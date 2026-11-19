// The editor's look renderer: one small WebGL canvas that runs the game's own grading shader (shared/look/shader.ts)
// and the user shaders over a picture, a tile layer or the whole stage, so the preview is the game's code.
//
// Texture convention: v = 0 is the image's top everywhere. Passes into an intermediate texture keep that order; the
// last pass, into the canvas, flips (GL's canvas origin is bottom-left).

import { LOOK_DETAIL_FRAG, LOOK_PASS_FRAG, lookDetailUniforms, lookUniforms, type LookPlacement } from '../../../../shared/look/shader'
import { hasDetail, type CompiledLook } from '../../../../shared/look/compile'
import { SHADER_HEADER_LINES, shaderParamValues, shaderSource, type ShaderInfo } from '../../../../shared/look/userShaders'

const VERT = `
attribute vec2 aPos;
uniform float uFlipY;
varying vec2 outTexCoord;
void main() {
  outTexCoord = vec2(aPos.x, uFlipY > 0.5 ? 1.0 - aPos.y : aPos.y);
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}
`

export interface GradePass {
  compiled: CompiledLook
  placement: LookPlacement
  /** uv (0..1, v down) -> map pixels: world = xy + uv * zw. */
  uvToWorld: [number, number, number, number]
  /** Snap world positions to pixel centres (screen-resolution sources). */
  snap: boolean
}

export interface ShaderPass {
  info: ShaderInfo
  params?: Record<string, number | number[]>
  uvToWorld: [number, number, number, number]
  time: number
}

interface Program {
  program: WebGLProgram
  uniforms: Map<string, WebGLUniformLocation | null>
}

export class LookGL {
  readonly canvas: HTMLCanvasElement
  private readonly gl: WebGLRenderingContext
  private readonly quad: WebGLBuffer
  private readonly programs = new Map<string, Program | { error: string }>()
  private readonly srcTex: WebGLTexture
  private targets: { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }[] = []
  private readonly lookTextures = new Map<string, { lut: WebGLTexture; brush: WebGLTexture | null }>()

  static create(): LookGL | null {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, alpha: true })
      return gl ? new LookGL(canvas, gl) : null
    } catch {
      return null
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas
    this.gl = gl
    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW)
    this.srcTex = this.texture(true)
  }

  private texture(linear: boolean): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    const f = linear ? gl.LINEAR : gl.NEAREST
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  /** Compiles (once) a fragment shader; an error string when it does not compile. */
  program(key: string, frag: string): Program | { error: string } {
    const cached = this.programs.get(key)
    if (cached) return cached
    const gl = this.gl
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) ?? 'compile error'
        gl.deleteShader(s)
        throw new Error(log)
      }
      return s
    }
    let result: Program | { error: string }
    try {
      const p = gl.createProgram()!
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT))
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag))
      gl.bindAttribLocation(p, 0, 'aPos')
      gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error')
      result = { program: p, uniforms: new Map() }
    } catch (e) {
      result = { error: e instanceof Error ? e.message : String(e) }
    }
    this.programs.set(key, result)
    return result
  }

  /** Compile errors of a user shader (line numbers of the user's file), or null when it compiles. */
  shaderError(info: ShaderInfo): string | null {
    const p = this.program(userKey(info), shaderSource(info.source))
    if (!('error' in p)) return null
    // ERROR: 0:42: ... -> line of the user's file
    return p.error.replace(/(ERROR: \d+:)(\d+)/g, (_m, pre: string, n: string) => `${pre}${Math.max(1, Number(n) - SHADER_HEADER_LINES - 1)}`)
  }

  private loc(p: Program, name: string): WebGLUniformLocation | null {
    if (!p.uniforms.has(name)) p.uniforms.set(name, this.gl.getUniformLocation(p.program, name))
    return p.uniforms.get(name)!
  }

  private lookTex(c: CompiledLook): { lut: WebGLTexture; brush: WebGLTexture | null } {
    let t = this.lookTextures.get(c.key)
    if (t) return t
    const gl = this.gl
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    const lut = this.texture(true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, c.lutWidth, c.lutHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, c.lut)
    let brush: WebGLTexture | null = null
    if (c.brush) {
      brush = this.texture(true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, c.brushSize, c.brushSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, c.brush)
    }
    t = { lut, brush }
    this.lookTextures.set(c.key, t)
    if (this.lookTextures.size > 96) {
      const [oldKey, old] = this.lookTextures.entries().next().value!
      gl.deleteTexture(old.lut)
      if (old.brush) gl.deleteTexture(old.brush)
      this.lookTextures.delete(oldKey)
    }
    return t
  }

  private target(i: number, w: number, h: number) {
    const gl = this.gl
    let t = this.targets[i]
    if (!t) {
      t = { tex: this.texture(true), fb: gl.createFramebuffer()!, w: 0, h: 0 }
      this.targets[i] = t
    }
    if (t.w !== w || t.h !== h) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
      t.w = w
      t.h = h
    }
    return t
  }

  /**
   * Runs the grade (if any) then the shaders over `source` (w x h pixels) and leaves the result on `this.canvas`
   * (draw it right away: the next call overwrites it). Returns false when nothing could be drawn.
   */
  render(source: TexImageSource, w: number, h: number, grade: GradePass | null, shaders: readonly ShaderPass[] = []): boolean {
    const gl = this.gl
    if (gl.isContextLost() || w < 1 || h < 1) return false
    const passes: ({ kind: 'grade'; p: GradePass } | { kind: 'detail'; p: GradePass } | { kind: 'shader'; p: ShaderPass })[] = []
    if (grade && !grade.compiled.gradeNeutral) passes.push({ kind: 'grade', p: grade })
    // Texture, clarity and dehaze look at the pixels around: a pass of their own over what the grade drew.
    if (grade && hasDetail(grade.compiled)) passes.push({ kind: 'detail', p: grade })
    for (const s of shaders) passes.push({ kind: 'shader', p: s })
    if (passes.length === 0) return false
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    gl.disable(gl.BLEND)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    let input = this.srcTex
    let drawn = 0
    passes.forEach((pass, i) => {
      const last = i === passes.length - 1
      const prog = pass.kind === 'grade' ? this.program('grade', LOOK_PASS_FRAG) : pass.kind === 'detail' ? this.program('detail', LOOK_DETAIL_FRAG) : this.program(userKey(pass.p.info), shaderSource(pass.p.info.source))
      if ('error' in prog) {
        if (pass.kind !== 'shader') console.error(`[looks] ${pass.kind} shader failed:`, prog.error)
        if (!last) return
        // A broken last shader: still show what came before it.
      }
      const out = last ? null : this.target(i % 2, w, h)
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null)
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      const p = 'error' in prog ? (this.program('copy', COPY_FRAG) as Program) : prog
      gl.useProgram(p.program)
      gl.uniform1f(this.loc(p, 'uFlipY'), last ? 1 : 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, input)
      gl.uniform1i(this.loc(p, 'uMainSampler'), 0)
      if (!('error' in prog)) {
        if (pass.kind === 'grade') this.setGrade(p, pass.p)
        else if (pass.kind === 'detail') this.setDetail(p, pass.p)
        else this.setShader(p, pass.p, w, h)
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (out) input = out.tex
      drawn++
    })
    return drawn > 0
  }

  private setGrade(p: Program, g: GradePass): void {
    const gl = this.gl
    // (creating the textures binds them to the active unit: never unit 0, which holds the input)
    gl.activeTexture(gl.TEXTURE1)
    const tex = this.lookTex(g.compiled)
    gl.bindTexture(gl.TEXTURE_2D, tex.lut)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, tex.brush ?? tex.lut)
    gl.uniform1i(this.loc(p, 'uLookLut'), 1)
    gl.uniform1i(this.loc(p, 'uLookBrush'), 2)
    gl.uniform4f(this.loc(p, 'uLookUvToWorld'), ...g.uvToWorld)
    gl.uniform1f(this.loc(p, 'uLookSnap'), g.snap ? 1 : 0)
    for (const u of lookUniforms(g.compiled, g.placement)) {
      const l = this.loc(p, u.name)
      const v = u.value as number[]
      if (u.type === '1f') gl.uniform1f(l, u.value as number)
      else if (u.type === '3f') gl.uniform3f(l, v[0], v[1], v[2])
      else if (u.type === '4f') gl.uniform4f(l, v[0], v[1], v[2], v[3])
      else gl.uniform4fv(l, u.value as Float32Array)
    }
  }

  private setDetail(p: Program, g: GradePass): void {
    const gl = this.gl
    gl.uniform4f(this.loc(p, 'uLookUvToWorld'), ...g.uvToWorld)
    for (const u of lookDetailUniforms(g.compiled)) {
      const v = u.value as number[]
      gl.uniform4f(this.loc(p, u.name), v[0], v[1], v[2], v[3])
    }
  }

  private setShader(p: Program, s: ShaderPass, w: number, h: number): void {
    const gl = this.gl
    gl.uniform1f(this.loc(p, 'uTime'), s.time)
    gl.uniform2f(this.loc(p, 'uResolution'), w, h)
    gl.uniform4f(this.loc(p, 'uWorld'), ...s.uvToWorld)
    gl.uniform2f(this.loc(p, 'uWorldPixel'), 1 / s.uvToWorld[2], 1 / s.uvToWorld[3])
    for (const [name, value] of Object.entries(shaderParamValues(s.info, s.params))) {
      const l = this.loc(p, name)
      if (typeof value === 'number') gl.uniform1f(l, value)
      else if (value.length === 2) gl.uniform2f(l, value[0], value[1])
      else if (value.length === 3) gl.uniform3f(l, value[0], value[1], value[2])
      else gl.uniform4f(l, value[0], value[1], value[2], value[3])
    }
  }
}

const COPY_FRAG = `precision mediump float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
void main() { gl_FragColor = texture2D(uMainSampler, outTexCoord); }
`

const userKey = (info: ShaderInfo) => `user:${info.id}:${info.source.length}:${hash(info.source)}`
const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}

let shared: LookGL | null | undefined
/** The editor's one look renderer (null when WebGL is not available: looks are then not previewed). */
export function lookGL(): LookGL | null {
  if (shared === undefined) shared = typeof document !== 'undefined' ? LookGL.create() : null
  return shared
}
