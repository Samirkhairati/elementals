// The user shaders of a look, run in order after the grade: add one from the project's library, show / hide, reorder,
// and set its parameters (sliders and colour pickers from the shader's annotations).

import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Sparkles, Trash2 } from 'lucide-react'
import { lookId } from '../../../../../shared/look/schema'
import { shaderParamValues, type ShaderInfo } from '../../../../../shared/look/userShaders'
import type { ShaderUse } from '../../../../../shared/look/types'
import { moveBy } from '@/lib/look/lookEdit'
import { useLookLibrary } from '@/lib/look/lookLibrary'
import { setLookView, useLookView } from '@/lib/look/lookView'
import { colorParamValue, shaderLabel, vecToHex } from '@/lib/shaderEdit'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EdButton, IconButton, InfoTip, Toggle } from '../ui/controls'
import { ColorField } from '../ui/fields'
import { LookSlider, type Change } from './lookControls'

function ShaderParams({ info, use, onChange }: { info: ShaderInfo; use: ShaderUse; onChange: Change<ShaderUse> }) {
  const values = shaderParamValues(info, use.params)
  const set = (name: string, v: number | number[], done: boolean) => onChange({ ...use, params: { ...(use.params ?? {}), [name]: v } }, done)
  if (info.params.length === 0) return <div className="text-ed-label text-muted-foreground">No parameters</div>
  return (
    <>
      {info.params.map((p) => {
        const v = values[p.name]
        if (p.color && Array.isArray(v)) {
          return (
            <div key={p.name} className="flex items-center justify-between gap-2">
              <span className="text-ed-label text-muted-foreground">{p.label}</span>
              <ColorField aria-label={p.label} value={vecToHex(v)} onChange={(hex) => set(p.name, colorParamValue(v, hex), true)} />
            </div>
          )
        }
        if (Array.isArray(v)) {
          return v.map((x, i) => (
            <LookSlider
              key={`${p.name}${i}`}
              label={`${p.label} ${'xyzw'[i]}`}
              value={x}
              defaultValue={Array.isArray(p.default) ? (p.default[i] ?? 0) : 0}
              min={p.min}
              max={p.max}
              step={p.step}
              onChange={(n, done) => set(p.name, v.map((o, j) => (j === i ? n : o)), done)}
            />
          ))
        }
        return <LookSlider key={p.name} label={p.label} value={v} defaultValue={typeof p.default === 'number' ? p.default : 0} min={p.min} max={p.max} step={p.step} onChange={(n, done) => set(p.name, n, done)} />
      })}
    </>
  )
}

export function LookShadersEditor({ shaders, onChange }: { shaders: readonly ShaderUse[]; onChange: Change<ShaderUse[]> }) {
  const lib = useLookLibrary()
  const view = useLookView()
  const set = (id: string, next: ShaderUse | null, done = true) => onChange(shaders.flatMap((s) => (s.id !== id ? [s] : next ? [next] : [])), done)
  const add = (info: ShaderInfo) => onChange([...shaders, { id: lookId('s'), shader: info.id }], true)
  const animated = shaders.some((s) => lib.shaders.find((i) => i.id === s.shader)?.animated)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <EdButton size="sm" variant="primary" disabled={lib.shaders.length === 0} aria-label="Add shader">
              <Plus /> Add shader
            </EdButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 min-w-52 overflow-y-auto">
            {lib.shaders.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => add(s)} className="flex-col items-start gap-0 text-ed-body">
                <span>{shaderLabel(s)}</span>
                {s.description ? <span className="text-ed-label text-muted-foreground">{s.description}</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1" />
        {animated ? (
          <label className="flex items-center gap-1.5 text-ed-label text-muted-foreground">
            Animate
            <Toggle aria-label="Animate on the canvas" checked={view.animate} onChange={(animate) => setLookView({ animate })} />
          </label>
        ) : null}
        <InfoTip>Shaders run after the colour grade, top to bottom, in the editor and in the game alike. Write or edit them in Database › Shaders (project/shaders/*.frag).</InfoTip>
      </div>
      {shaders.length === 0 ? <div className="py-3 text-center text-ed-label text-muted-foreground">{lib.shaders.length ? 'No shaders' : 'No shaders in the project yet'}</div> : null}
      {shaders.map((u, i) => {
        const info = lib.shaders.find((s) => s.id === u.shader)
        const hidden = u.visible === false
        return (
          <div key={u.id} className="ed-card">
            <div className="flex items-center gap-1 px-1.5 py-1">
              <IconButton aria-label={hidden ? 'Show shader' : 'Hide shader'} onClick={() => set(u.id, { ...u, visible: hidden ? undefined : false })}>
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </IconButton>
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={cn('min-w-0 flex-1 truncate text-ed-body', hidden && 'opacity-50', !info && 'text-destructive')} title={u.shader}>
                {info ? shaderLabel(info) : `Missing: ${u.shader}`}
              </span>
              <IconButton aria-label="Move shader up" disabled={i === 0} onClick={() => onChange(moveBy(shaders, u.id, -1), true)}>
                <ArrowUp className="h-3 w-3" />
              </IconButton>
              <IconButton aria-label="Move shader down" disabled={i === shaders.length - 1} onClick={() => onChange(moveBy(shaders, u.id, 1), true)}>
                <ArrowDown className="h-3 w-3" />
              </IconButton>
              <IconButton aria-label="Remove shader" tone="danger" onClick={() => set(u.id, null)}>
                <Trash2 className="h-3 w-3" />
              </IconButton>
            </div>
            {info ? (
              <div className={cn('flex flex-col gap-1.5 border-t border-border/60 p-2', hidden && 'opacity-60')}>
                <ShaderParams info={info} use={u} onChange={(next, done) => set(u.id, next, done)} />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
