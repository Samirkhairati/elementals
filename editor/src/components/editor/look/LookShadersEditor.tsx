// The user shaders of a look, run in order after the grade: add one from the project's library, show / hide, reorder,
// and set its parameters (sliders and colour pickers from the shader's annotations).

import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from 'lucide-react'
import { lookId } from '../../../../../shared/look/schema'
import { shaderParamValues, type ShaderInfo } from '../../../../../shared/look/userShaders'
import type { ShaderUse } from '../../../../../shared/look/types'
import { moveBy } from '@/lib/look/lookEdit'
import { useLookLibrary } from '@/lib/look/lookLibrary'
import { setLookView, useLookView } from '@/lib/look/lookView'
import { colorParamValue, shaderLabel, vecToHex } from '@/lib/shaderEdit'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Card, EdButton, Field, EyeButton, IconButton, InfoTip, Toggle } from '../ui/controls'
import { ColorField } from '../ui/fields'
import { LookSlider, type Change } from './lookControls'

function ShaderParams({ info, use, onChange }: { info: ShaderInfo; use: ShaderUse; onChange: Change<ShaderUse> }) {
  const values = shaderParamValues(info, use.params)
  const set = (name: string, v: number | number[], done: boolean) => onChange({ ...use, params: { ...(use.params ?? {}), [name]: v } }, done)
  if (info.params.length === 0) return <div className="ed-hint">No parameters</div>
  return (
    <>
      {info.params.map((p) => {
        const v = values[p.name]
        if (p.color && Array.isArray(v)) {
          return (
            <Field key={p.name} label={p.label}>
              <ColorField aria-label={p.label} value={vecToHex(v)} onChange={(hex) => set(p.name, colorParamValue(v, hex), true)} />
            </Field>
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
          <DropdownMenuContent align="start" className="min-w-52 overflow-y-auto">
            {lib.shaders.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => add(s)} className="flex-col items-start gap-0">
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
      {shaders.length === 0 ? <div className="ed-hint py-2 text-center">{lib.shaders.length ? 'No shaders' : 'No shaders in the project yet'}</div> : null}
      {shaders.map((u, i) => {
        const info = lib.shaders.find((s) => s.id === u.shader)
        const hidden = u.visible === false
        const name = info ? shaderLabel(info) : u.shader
        return (
          <Card
            key={u.id}
            icon={<Sparkles />}
            title={<span className={cn(!info && 'text-red-400')} title={u.shader}>{info ? name : `Missing: ${u.shader}`}</span>}
            dim={hidden}
            actions={
              <>
                <EyeButton visible={!hidden} name={name} onToggle={() => set(u.id, { ...u, visible: hidden ? undefined : false })} />
                <IconButton aria-label="Move shader up" title="Move up" disabled={i === 0} onClick={() => onChange(moveBy(shaders, u.id, -1), true)}>
                  <ArrowUp />
                </IconButton>
                <IconButton aria-label="Move shader down" title="Move down" disabled={i === shaders.length - 1} onClick={() => onChange(moveBy(shaders, u.id, 1), true)}>
                  <ArrowDown />
                </IconButton>
                <IconButton aria-label="Remove shader" title="Remove" tone="danger" onClick={() => set(u.id, null)}>
                  <Trash2 />
                </IconButton>
              </>
            }
          >
            {info ? <ShaderParams info={info} use={u} onChange={(next, done) => set(u.id, next, done)} /> : null}
          </Card>
        )
      })}
    </div>
  )
}
