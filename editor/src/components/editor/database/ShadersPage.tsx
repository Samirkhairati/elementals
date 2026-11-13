// Database > Shaders: the project's user shaders (project/shaders/*.frag), a code editor with a live compile check
// and a preview of the draft over a test picture. Saving writes the file (and refreshes the game's copy).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Pencil, Plus, Save, Trash2, TriangleAlert } from 'lucide-react'
import { parseShader, shaderParamValues, type ShaderInfo, type ShaderParam } from '../../../../../shared/look/userShaders'
import { deleteShader, renameShader, saveShader, useLookLibrary } from '@/lib/look/lookLibrary'
import { lookGL } from '@/lib/look/lookGL'
import { NEW_SHADER_TEMPLATE, colorParamValue, lineStart, parseShaderErrors, shaderIdProblem, shaderLabel, uniqueShaderId, vecToHex } from '@/lib/shaderEdit'
import { cn } from '@/lib/utils'
import { EdButton, InfoTip, SliderNumber } from '../ui/controls'
import { ColorField } from '../ui/fields'
import { InlineConfirm } from '../ui/InlineConfirm'
import { RenameInput } from '../ui/RenameInput'
import type { DatabaseData } from './useDatabaseData'

const PREVIEW_W = 320
const PREVIEW_H = 180

export const SHADER_SYNTAX_INFO = (
  <>
    A shader is a GLSL ES 1.0 fragment shader with its own <code>main()</code> that reads the picture with <code>texture2D(uMainSampler, outTexCoord)</code>.
    Annotations go in comments: <code>// @name</code>, <code>// @description</code>, <code>// @animated</code> (redraws every frame) and <code>// @pad 8</code> (map pixels
    of room around a picture). A uniform followed by <code>// @param min max default Label</code> becomes a slider, and <code>// @color #rrggbb Label</code> on a vec3 or vec4 a colour
    picker. Provided: <code>uTime</code>, <code>uResolution</code>, <code>worldAt(uv)</code>, <code>uvAt(world)</code>. Ctrl/Cmd+S saves.
  </>
)

/** A small procedural scene to look at the shader on: sky, sun, hills, a house and a checker ground. */
function drawTestScene(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = PREVIEW_W
  c.height = PREVIEW_H
  const g = c.getContext('2d')
  if (!g) return c
  const sky = g.createLinearGradient(0, 0, 0, 110)
  sky.addColorStop(0, '#3b6fd8')
  sky.addColorStop(1, '#bfe3ff')
  g.fillStyle = sky
  g.fillRect(0, 0, PREVIEW_W, PREVIEW_H)
  g.fillStyle = '#ffd84a'
  g.beginPath()
  g.arc(250, 40, 20, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3f9a52'
  g.beginPath()
  g.ellipse(80, 120, 120, 40, 0, Math.PI, 0)
  g.fill()
  g.fillStyle = '#c8553d'
  g.fillRect(150, 80, 70, 40)
  g.fillStyle = '#7a2e22'
  g.beginPath()
  g.moveTo(142, 82)
  g.lineTo(185, 52)
  g.lineTo(228, 82)
  g.fill()
  g.fillStyle = '#f5e6c8'
  g.fillRect(176, 98, 16, 22)
  for (let y = 120; y < PREVIEW_H; y += 20) {
    for (let x = 0; x < PREVIEW_W; x += 20) {
      g.fillStyle = ((x + y) / 20) % 2 === 0 ? '#8a7a5c' : '#a8977a'
      g.fillRect(x, y, 20, 20)
    }
  }
  g.fillStyle = '#e8403a'
  g.fillRect(40, 130, 24, 24)
  g.fillStyle = '#2a6fe0'
  g.beginPath()
  g.arc(110, 150, 14, 0, Math.PI * 2)
  g.fill()
  return c
}

function nextId(base: string, ids: string[]): string {
  return uniqueShaderId(base, ids)
}

// ── preview ─────────────────────────────────────────────────────────────────────────────────────

function ShaderPreview({ info, params, blocked }: { info: ShaderInfo; params: Record<string, number | number[]>; blocked: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<HTMLCanvasElement | null>(null)
  const gl = useMemo(() => lookGL(), [])
  useEffect(() => {
    const target = canvas.current
    const ctx = target?.getContext('2d')
    if (!gl || !target || !ctx || blocked) return
    scene.current ??= drawTestScene()
    const src = scene.current
    const start = performance.now()
    let raf = 0
    const draw = () => {
      const time = (performance.now() - start) / 1000
      const ok = gl.render(src, PREVIEW_W, PREVIEW_H, null, [{ info, params, uvToWorld: [0, 0, PREVIEW_W, PREVIEW_H], time }])
      ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H)
      ctx.drawImage(ok ? gl.canvas : src, 0, 0)
      if (info.animated) raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [gl, info, params, blocked])

  if (!gl) return <p className="text-muted-foreground">Preview needs WebGL.</p>
  return <canvas ref={canvas} width={PREVIEW_W} height={PREVIEW_H} aria-label="Shader preview" className="w-full max-w-[480px] rounded border border-border [image-rendering:pixelated]" />
}

function ParamControl({ param, value, onChange }: { param: ShaderParam; value: number | number[]; onChange: (v: number | number[]) => void }) {
  if (param.color) {
    const rgb = Array.isArray(value) ? value : [value, value, value]
    return <ColorField aria-label={param.label} value={vecToHex(rgb)} onChange={(hex) => onChange(colorParamValue(value, hex))} className="w-28" />
  }
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-col gap-1">
        {value.map((v, i) => (
          <SliderNumber key={i} label={`${param.label} ${'xyzw'[i]}`} value={v} min={param.min} max={param.max} step={param.step} onCommit={(n) => onChange(value.map((x, j) => (j === i ? n : x)))} />
        ))}
      </div>
    )
  }
  return <SliderNumber label={param.label} value={value} min={param.min} max={param.max} step={param.step} onCommit={onChange} />
}

// ── the code editor ─────────────────────────────────────────────────────────────────────────────

function CodeEditor({ value, onChange, onSave, area }: { value: string; onChange: (v: string) => void; onSave: () => void; area: React.RefObject<HTMLTextAreaElement | null> }) {
  const gutter = useRef<HTMLDivElement>(null)
  const lines = value.split('\n').length
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded border border-input/60 bg-background/50 font-mono text-[12px] leading-5">
      <div ref={gutter} aria-hidden className="w-10 shrink-0 select-none overflow-hidden bg-muted/30 px-1 py-1 text-right text-muted-foreground/70">
        {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <textarea
        ref={area}
        aria-label="Shader source"
        spellCheck={false}
        wrap="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault()
            onSave()
          } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            const el = e.currentTarget
            const next = `${value.slice(0, el.selectionStart)}  ${value.slice(el.selectionEnd)}`
            const caret = el.selectionStart + 2
            onChange(next)
            requestAnimationFrame(() => el.setSelectionRange(caret, caret))
          }
        }}
        className="min-w-0 flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-2 py-1 outline-none"
      />
    </div>
  )
}

function ShaderEditor({ shader }: { shader: ShaderInfo }) {
  const [draft, setDraft] = useState(shader.source)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [compileError, setCompileError] = useState<string | null>(null)
  const [stored, setStored] = useState<Record<string, number | number[]>>({})
  const area = useRef<HTMLTextAreaElement>(null)
  const dirty = draft !== shader.source
  const info = useMemo(() => parseShader(shader.id, draft), [shader.id, draft])
  const params = useMemo(() => shaderParamValues(info, stored), [info, stored])

  // The compile check runs shortly after typing stops.
  useEffect(() => {
    const t = window.setTimeout(() => setCompileError(lookGL()?.shaderError(info) ?? null), 300)
    return () => window.clearTimeout(t)
  }, [info])

  const save = async () => {
    setSaveError(await saveShader(shader.id, draft))
  }
  const errors = parseShaderErrors(compileError)
  const goTo = (line: number | null) => {
    const el = area.current
    if (!el || line === null) return
    const at = lineStart(draft, line)
    el.focus()
    el.setSelectionRange(at, at)
    el.scrollTop = Math.max(0, (line - 3) * 20)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3" data-testid="shader-editor">
      <div className="flex items-center gap-2">
        <h3 className="text-ed-title">{shaderLabel(info)}</h3>
        <span className="ed-mono text-muted-foreground">{shader.id}</span>
        <InfoTip>{SHADER_SYNTAX_INFO}</InfoTip>
        {dirty && <span role="img" aria-label="Unsaved changes" title="Unsaved changes" className="h-2 w-2 rounded-full bg-amber-400" />}
        <EdButton variant="primary" size="sm" className="ml-auto" disabled={!dirty} onClick={() => void save()}><Save className="h-3 w-3" />Save</EdButton>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <CodeEditor value={draft} onChange={setDraft} onSave={() => void save()} area={area} />
          {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
          {errors.length > 0 && (
            <ul aria-label="Compile errors" className="max-h-28 shrink-0 overflow-y-auto rounded border border-red-500/40 bg-red-500/10 p-1.5 font-mono text-[11px] text-red-400">
              {errors.map((e, i) => (
                <li key={i}>
                  <button type="button" disabled={e.line === null} onClick={() => goTo(e.line)} className="flex w-full items-start gap-1 text-left enabled:hover:underline">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {e.line !== null ? `Line ${e.line}: ` : ''}{e.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex w-[340px] shrink-0 flex-col gap-2 overflow-y-auto">
          <ShaderPreview info={info} params={params} blocked={errors.length > 0} />
          {info.params.map((p) => (
            <div key={p.name} className="flex flex-col gap-0.5">
              <span className="text-ed-label text-muted-foreground">{p.label}</span>
              <ParamControl param={p} value={params[p.name]} onChange={(v) => setStored((cur) => ({ ...cur, [p.name]: v }))} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── the page ────────────────────────────────────────────────────────────────────────────────────

export function ShadersPage(_props: { data?: DatabaseData } = {}) {
  const lib = useLookLibrary()
  const shaders = lib.shaders
  const ids = useMemo(() => shaders.map((s) => s.id), [shaders])
  const [selected, setSelected] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const current = shaders.find((s) => s.id === selected) ?? null

  const run = async (error: Promise<string | null>, then?: () => void) => {
    const e = await error
    setMessage(e)
    if (!e) then?.()
  }

  const create = () => {
    const id = nextId('new-shader', ids)
    void run(saveShader(id, NEW_SHADER_TEMPLATE), () => setSelected(id))
  }
  const duplicate = () => {
    if (!current) return
    const id = nextId(`${current.id}-copy`, ids)
    void run(saveShader(id, current.source), () => setSelected(id))
  }
  const rename = (name: string) => {
    if (!current) return
    const id = name.trim()
    const problem = shaderIdProblem(id, ids, current.id)
    if (problem) return setMessage(problem)
    if (id === current.id) return
    void run(renameShader(current.id, id), () => setSelected(id))
  }
  const remove = () => {
    if (!current) return
    setConfirmDelete(false)
    void run(deleteShader(current.id), () => setSelected(''))
  }

  return (
    <div className="flex h-full min-h-0" data-testid="shaders-page">
      <div className="flex w-72 shrink-0 flex-col gap-2 border-r border-sidebar-border p-2" data-testid="list-pane">
        <div className="flex flex-wrap gap-1">
          <EdButton size="sm" onClick={create}><Plus className="h-3 w-3" />New shader</EdButton>
          <EdButton size="sm" disabled={!current} onClick={duplicate}><Copy className="h-3 w-3" />Duplicate</EdButton>
          <EdButton size="sm" disabled={!current} onClick={() => setRenaming(true)}><Pencil className="h-3 w-3" />Rename</EdButton>
          <EdButton size="sm" variant="danger" disabled={!current} onClick={() => setConfirmDelete(true)}><Trash2 className="h-3 w-3" />Delete</EdButton>
        </div>
        {(message ?? lib.error) && <p role="alert" className="text-destructive">{message ?? lib.error}</p>}
        {confirmDelete && current && (
          <InlineConfirm label={`Delete ${current.id}?`} confirmLabel="Delete" onConfirm={remove} onCancel={() => setConfirmDelete(false)}>
            Delete <b>{current.id}</b>? Looks and layers that use it lose the effect. This cannot be undone.
          </InlineConfirm>
        )}
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Shaders">
          {!lib.loaded && <li className="text-muted-foreground">Loading…</li>}
          {lib.loaded && shaders.length === 0 && <li className="text-muted-foreground">No shaders yet</li>}
          {shaders.map((s) => (
            <li key={s.id}>
              {renaming && s.id === selected ? (
                <RenameInput initial={s.id} label="Shader id" onRename={rename} onClose={() => setRenaming(false)} />
              ) : (
                <button type="button" data-selected={s.id === selected ? 'true' : undefined} className={cn('ed-row flex w-full flex-col items-start text-left')} onClick={() => { setSelected(s.id); setMessage(null); setConfirmDelete(false) }}>
                  <span className="truncate">{shaderLabel(s)}</span>
                  <span className="ed-mono truncate text-[10px] text-muted-foreground">{s.id}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        {current ? <ShaderEditor key={current.id} shader={current} /> : <p className="p-4 text-muted-foreground">Select a shader, or make a new one.</p>}
      </div>
    </div>
  )
}
