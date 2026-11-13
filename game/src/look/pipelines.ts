// Phaser pipelines for looks (docs/looks.md):
// - LookGradePipeline: Phaser's Single pipeline with the grade inline, for pictures and tile layers. No extra render
//   pass: each object's pixels are graded while they are drawn, and objects with different looks only split the batch.
// - LookPassPipeline: a camera post pass with the same grade, for the whole map's look (characters included).
// - user shaders: one post pipeline class per shader file, on the camera, a tile layer or a picture.
// Every grade calls `lookGrade` of shared/look/shader.ts, the code the editor draws its preview with.

import Phaser from "phaser";
import { LOOK_GLSL, LOOK_PASS_FRAG, LOOK_PRECISION, lookUniforms, type LookPlacement, type UniformValue } from "@shared/look/shader.ts";
import type { CompiledLook } from "@shared/look/compile.ts";
import { shaderParamValues, shaderSource, type ShaderInfo } from "@shared/look/userShaders.ts";

type Wrapper = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

/** A compiled look on the GPU, as an object or the camera carries it (`pipelineData.look`). */
export interface LookBinding {
  compiled: CompiledLook;
  lut: Wrapper;
  brush: Wrapper | null;
  /** Pictures: map pixels from the texel the fragment shows (`picture`); tile layers: from the screen (`screen`). */
  mode: "picture" | "screen";
  /** picture mode: the frame's uv rect in its texture (u0, v0, du, dv), the texture size, and uv (0..1) -> map pixels. */
  frameUv?: [number, number, number, number];
  texSize?: [number, number];
  uvToWorld?: [number, number, number, number];
  subject: LookPlacement["subject"];
  /** The vignette's frame in map pixels (null = the camera's view). */
  frame: LookPlacement["frame"] | null;
}

/** Where the main camera looks this frame (written by the LookRuntime before rendering). */
export const lookView = {
  /** world = xy + screen * zw */
  screenToWorld: [0, 0, 1, 1] as [number, number, number, number],
  worldView: { x: 0, y: 0, w: 1, h: 1 },
  time: 0,
};

type Setter = { set1f(n: string, v: number): unknown; set3f(n: string, a: number, b: number, c: number): unknown; set4f(n: string, a: number, b: number, c: number, d: number): unknown; set4fv(n: string, v: number[] | Float32Array): unknown };

function applyUniforms(p: Setter, values: UniformValue[]): void {
  for (const u of values) {
    const v = u.value as number[];
    if (u.type === "1f") p.set1f(u.name, u.value as number);
    else if (u.type === "3f") p.set3f(u.name, v[0], v[1], v[2]);
    else if (u.type === "4f") p.set4f(u.name, v[0], v[1], v[2], v[3]);
    else p.set4fv(u.name, u.value as Float32Array);
  }
}

function placementOf(b: LookBinding): LookPlacement {
  const v = lookView.worldView;
  return { subject: b.subject, frame: b.frame ?? { x: v.x, y: v.y, w: v.w, h: v.h }, time: lookView.time };
}

const GRADE_VERT = `
#define SHADER_NAME LOOK_GRADE_VS
precision highp float;
uniform mat4 uProjectionMatrix;
uniform vec2 uResolution;
attribute vec2 inPosition;
attribute vec2 inTexCoord;
attribute float inTexId;
attribute float inTintEffect;
attribute vec4 inTint;
varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
varying vec2 vLookScreen;
void main () {
  gl_Position = uProjectionMatrix * vec4(inPosition, 1.0, 1.0);
  outTexCoord = inTexCoord;
  outTint = inTint;
  outTintEffect = inTintEffect;
  vLookScreen = inPosition;
}
`;

const GRADE_FRAG = `#define SHADER_NAME LOOK_GRADE_FS
${LOOK_PRECISION}
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
varying vec2 vLookScreen;
uniform float uLookOn;
uniform float uLookMode;
uniform vec4 uLookScreenToWorld;
uniform vec4 uLookFrameUv;
uniform vec2 uLookTexSize;
uniform vec4 uLookUvToWorld;
${LOOK_GLSL}
void main () {
  vec4 texture = texture2D(uMainSampler, outTexCoord);
  if (uLookOn > 0.5 && texture.a > 0.0) {
    vec2 world;
    if (uLookMode > 0.5) {
      // the texel's centre, so a scaled-up picture is graded per picture pixel (as the editor does)
      vec2 t = (floor(outTexCoord * uLookTexSize) + 0.5) / uLookTexSize;
      world = uLookUvToWorld.xy + ((t - uLookFrameUv.xy) / uLookFrameUv.zw) * uLookUvToWorld.zw;
    } else {
      world = floor(uLookScreenToWorld.xy + vLookScreen * uLookScreenToWorld.zw) + 0.5;
    }
    texture.rgb = lookGrade(texture.rgb / texture.a, world) * texture.a;
  }
  vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
  vec4 color = texture * texel;
  if (outTintEffect == 1.0) color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
  else if (outTintEffect == 2.0) color = texel;
  gl_FragColor = color;
}
`;

export const LOOK_GRADE_PIPELINE = "LookGrade";
export const LOOK_PASS_PIPELINE = "LookPass";

/** Pictures and tile layers with a look: `setPipeline(LOOK_GRADE_PIPELINE, { look: binding })`. */
export class LookGradePipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  private bound: LookBinding | null = null;

  constructor(game: Phaser.Game) {
    super({ game, name: LOOK_GRADE_PIPELINE, fragShader: GRADE_FRAG, vertShader: GRADE_VERT } as unknown as Phaser.Types.Renderer.WebGL.WebGLPipelineConfig);
  }

  override boot(): void {
    super.boot();
    this.set1i("uLookLut", 1);
    this.set1i("uLookBrush", 2);
  }

  override onActive(): void {
    // Another pipeline may have used texture units 1 and 2 in between.
    this.bound = null;
  }

  override onPreRender(): void {
    // The camera moved and time went on: every object's uniforms are set again on its first draw.
    this.bound = null;
  }

  override onBind(gameObject?: Phaser.GameObjects.GameObject): void {
    const binding = (gameObject as unknown as { pipelineData?: { look?: LookBinding } } | undefined)?.pipelineData?.look ?? null;
    if (binding === this.bound) return;
    this.flush();
    this.bound = binding;
    if (!binding) {
      this.set1f("uLookOn", 0);
      return;
    }
    this.set1f("uLookOn", 1);
    this.set1f("uLookMode", binding.mode === "picture" ? 1 : 0);
    const [a, b, c, d] = lookView.screenToWorld;
    this.set4f("uLookScreenToWorld", a, b, c, d);
    if (binding.mode === "picture") {
      const f = binding.frameUv!;
      const w = binding.uvToWorld!;
      this.set4f("uLookFrameUv", f[0], f[1], f[2], f[3]);
      this.set2f("uLookTexSize", binding.texSize![0], binding.texSize![1]);
      this.set4f("uLookUvToWorld", w[0], w[1], w[2], w[3]);
    }
    applyUniforms(this, lookUniforms(binding.compiled, placementOf(binding)));
    this.bindTexture(binding.lut, 1);
    this.bindTexture(binding.brush ?? binding.lut, 2);
    this.gl.activeTexture(this.gl.TEXTURE0);
  }
}

/** The whole map's look: a pass over what the camera drew (`camera.setPostPipeline(LookPassPipeline)` + pipelineData). */
export class LookPassPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  look: LookBinding | null = null;

  constructor(game: Phaser.Game) {
    super({ game, name: LOOK_PASS_PIPELINE, fragShader: LOOK_PASS_FRAG });
  }

  override onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    const binding = this.look;
    if (!binding) {
      this.bindAndDraw(renderTarget);
      return;
    }
    const v = lookView.worldView;
    // The render target holds the camera's whole screen, upside down in uv (GL's origin is bottom-left).
    const s = lookView.screenToWorld;
    const w = renderTarget.width;
    const h = renderTarget.height;
    this.set4f("uLookUvToWorld", s[0], s[1] + h * s[3], w * s[2], -h * s[3]);
    this.set1f("uLookSnap", 1);
    this.set1i("uLookLut", 1);
    this.set1i("uLookBrush", 2);
    applyUniforms(this, lookUniforms(binding.compiled, { subject: binding.subject, frame: binding.frame ?? { x: v.x, y: v.y, w: v.w, h: v.h }, time: lookView.time }));
    this.bindTexture(binding.lut, 1);
    this.bindTexture(binding.brush ?? binding.lut, 2);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.bindAndDraw(renderTarget);
  }
}

/** A user shader's settings on one object (its post pipeline instance reads them). */
export interface ShaderBinding {
  info: ShaderInfo;
  params?: Record<string, number | number[]>;
}

/** The post pipeline class of a user shader (`camera.setPostPipeline(key)`, `image.setPostPipeline(key)`). */
export function userShaderPipeline(info: ShaderInfo): new (game: Phaser.Game) => Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  return class UserShader extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    params: Record<string, number | number[]> | undefined;

    constructor(game: Phaser.Game) {
      super({ game, name: userShaderKey(info.id), fragShader: shaderSource(info.source) });
    }

    override onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
      const s = lookView.screenToWorld;
      const w = renderTarget.width;
      const h = renderTarget.height;
      this.set1f("uTime", lookView.time);
      this.set2f("uResolution", w, h);
      this.set4f("uWorld", s[0], s[1] + h * s[3], w * s[2], -h * s[3]);
      this.set2f("uWorldPixel", 1 / (w * s[2]), 1 / (h * s[3]));
      for (const [name, value] of Object.entries(shaderParamValues(info, this.params))) {
        if (typeof value === "number") this.set1f(name, value);
        else if (value.length === 2) this.set2f(name, value[0], value[1]);
        else if (value.length === 3) this.set3f(name, value[0], value[1], value[2]);
        else this.set4f(name, value[0], value[1], value[2], value[3]);
      }
      this.bindAndDraw(renderTarget);
    }
  };
}

export const userShaderKey = (id: string): string => `shader:${id}`;
