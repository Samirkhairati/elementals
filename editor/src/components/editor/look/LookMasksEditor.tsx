// The masks of a look (Lightroom's Masking): a list of masks, each made of components that add to, subtract from or
// intersect what the ones before them select, and its own adjustments. The mask being edited shows its handles on the
// canvas (konva/KonvaMaskEditor) and, when the overlay is on, what it selects.

import { Brush, Circle, Copy, Droplet, FlipHorizontal2, Layers, Minus, MoreHorizontal, Pipette, Plus, Square, SquareDashed, SunDim, Trash2, X } from 'lucide-react'
import React from 'react'
import type { LookMask, MaskComponent, MaskComponentType, MaskMode } from '../../../../../shared/look/types'
import { canAddComponent, canAddMask, COMPONENT_LABELS, COMPONENT_ORDER, MODE_LABELS, newComponent, newMask, updateComponent } from '@/lib/look/lookEdit'
import { getLookView, setLookView, useLookView, type LookViewState } from '@/lib/look/lookView'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Card, EdButton, EyeButton, Field, IconButton, InfoTip, NumberField, Segmented, TextField } from '../ui/controls'
import { ColorField } from '../ui/fields'
import { LookAdjustEditor } from './LookAdjustEditor'
import { LookSlider, type Change } from './lookControls'

type Box = { x: number; y: number; w: number; h: number }

export const COMPONENT_ICONS: Record<MaskComponentType, React.ReactNode> = {
  all: <Layers />,
  linear: <SquareDashed />,
  radial: <Circle />,
  rect: <Square />,
  brush: <Brush />,
  color: <Droplet />,
  luminance: <SunDim />,
}

const MODE_ICONS: Record<MaskMode, React.ReactNode> = {
  add: <Plus />,
  subtract: <Minus />,
  intersect: <X />,
}

/** Samples a colour from the screen with looks switched off (the colour range compares against the original). */
async function pickScreenColor(): Promise<string | null> {
  const Picker = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
  if (!Picker) return null
  const was = getLookView()
  setLookView({ enabled: false })
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const r = await new Picker().open()
    return r.sRGBHex
  } catch {
    return null
  } finally {
    setLookView({ enabled: was.enabled })
  }
}

function AddMenu({ label, mode, disabled, onAdd, children }: { label: string; mode: MaskMode | 'new'; disabled?: boolean; onAdd: (type: MaskComponentType) => void; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COMPONENT_ORDER.filter((t) => mode === 'new' || t !== 'all').map((t) => (
          <DropdownMenuItem key={t} onSelect={() => onAdd(t)}>
            {COMPONENT_ICONS[t]}
            {COMPONENT_LABELS[t]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const num = (label: string, value: number, onCommit: (v: number) => void, opts: { min?: number; max?: number; step?: number; unit?: string } = {}) => (
  <label className="flex min-w-0 items-center gap-1 text-ed-label text-muted-foreground">
    <span className="w-5 shrink-0">{label}</span>
    <NumberField aria-label={label} size="sm" value={Math.round(value * 100) / 100} step={opts.step ?? 1} min={opts.min} max={opts.max} unit={opts.unit} onCommit={onCommit} />
  </label>
)

/** The settings of one component (geometry as numbers; the canvas handles do the same by dragging). */
function ComponentSettings({ c, onChange, view }: { c: MaskComponent; onChange: Change<MaskComponent>; view: LookViewState }) {
  const set = (patch: Partial<MaskComponent>, done = true) => onChange({ ...c, ...patch } as MaskComponent, done)
  const strength = <LookSlider label="Strength" value={Math.round((c.strength ?? 1) * 100)} defaultValue={100} min={0} max={100} step={1} onChange={(v, done) => set({ strength: v >= 100 ? undefined : v / 100 }, done)} />
  switch (c.type) {
    case 'all':
      return strength
    case 'linear':
      return (
        <>
          <div className="grid grid-cols-2 gap-1">
            {num('X1', c.x1, (x1) => set({ x1 }))}
            {num('Y1', c.y1, (y1) => set({ y1 }))}
            {num('X2', c.x2, (x2) => set({ x2 }))}
            {num('Y2', c.y2, (y2) => set({ y2 }))}
          </div>
          {strength}
        </>
      )
    case 'radial':
      return (
        <>
          <div className="grid grid-cols-2 gap-1">
            {num('X', c.cx, (cx) => set({ cx }))}
            {num('Y', c.cy, (cy) => set({ cy }))}
            {num('RX', c.rx, (rx) => set({ rx }), { min: 1 })}
            {num('RY', c.ry, (ry) => set({ ry }), { min: 1 })}
          </div>
          <LookSlider label="Feather" value={Math.round((c.feather ?? 0.5) * 100)} defaultValue={50} min={0} max={100} step={1} onChange={(v, done) => set({ feather: v / 100 }, done)} />
          <LookSlider label="Rotation" value={c.rotation ?? 0} min={-180} max={180} step={1} unit="°" onChange={(rotation, done) => set({ rotation }, done)} />
          {strength}
        </>
      )
    case 'rect':
      return (
        <>
          <div className="grid grid-cols-2 gap-1">
            {num('X', c.x, (x) => set({ x }))}
            {num('Y', c.y, (y) => set({ y }))}
            {num('W', c.w, (w) => set({ w }), { min: 1 })}
            {num('H', c.h, (h) => set({ h }), { min: 1 })}
          </div>
          <LookSlider label="Feather" value={c.feather ?? 0} min={0} max={Math.max(8, Math.round(Math.min(c.w, c.h) / 2))} step={1} unit="px" onChange={(feather, done) => set({ feather }, done)} />
          <LookSlider label="Corner radius" value={c.radius ?? 0} min={0} max={Math.max(8, Math.round(Math.min(c.w, c.h) / 2))} step={1} unit="px" onChange={(radius, done) => set({ radius }, done)} />
          {strength}
        </>
      )
    case 'brush': {
      const b = view.brush
      const setBrush = (patch: Partial<LookViewState['brush']>) => setLookView((s) => ({ brush: { ...s.brush, ...patch } }))
      return (
        <>
          <Segmented<'paint' | 'erase'>
            aria-label="Brush or eraser"
            value={b.erase ? 'erase' : 'paint'}
            options={[
              { value: 'paint', label: 'Paint', icon: <Brush /> },
              { value: 'erase', label: 'Erase', icon: <X /> },
            ]}
            onChange={(v) => setBrush({ erase: v === 'erase' })}
          />
          <LookSlider label="Size" value={b.size} defaultValue={24} min={1} max={400} step={1} unit="px" onChange={(size) => setBrush({ size })} />
          <LookSlider label="Feather" value={Math.round(b.feather * 100)} defaultValue={60} min={0} max={100} step={1} onChange={(v) => setBrush({ feather: v / 100 })} />
          <LookSlider label="Flow" value={Math.round(b.flow * 100)} defaultValue={80} min={1} max={100} step={1} onChange={(v) => setBrush({ flow: v / 100 })} />
          <div className="flex items-center justify-between ed-hint">
            <span>{c.strokes.length} stroke{c.strokes.length === 1 ? '' : 's'}</span>
            <EdButton size="sm" disabled={c.strokes.length === 0} onClick={() => set({ strokes: [] })}>
              Clear
            </EdButton>
          </div>
          {strength}
        </>
      )
    }
    case 'color':
      return (
        <>
          <Field label="Color">
            <ColorField aria-label="Colour to select" value={c.color} onChange={(color) => set({ color })} />
            <IconButton
              aria-label="Pick a colour on screen"
              title="Pick a colour on screen (looks are hidden while picking)"
              onClick={async () => {
                const color = await pickScreenColor()
                if (color) set({ color })
              }}
            >
              <Pipette />
            </IconButton>
          </Field>
          <LookSlider label="Range" value={c.range ?? 30} defaultValue={30} min={0} max={100} step={1} onChange={(range, done) => set({ range }, done)} />
          <LookSlider label="Softness" value={c.softness ?? 50} defaultValue={50} min={0} max={100} step={1} onChange={(softness, done) => set({ softness }, done)} />
          {strength}
        </>
      )
    case 'luminance':
      return (
        <>
          <LookSlider label="From" value={Math.round(c.low * 100)} defaultValue={50} min={0} max={100} step={1} track="linear-gradient(90deg, #000, #fff)" onChange={(v, done) => set({ low: Math.min(v / 100, c.high) }, done)} />
          <LookSlider label="To" value={Math.round(c.high * 100)} defaultValue={100} min={0} max={100} step={1} track="linear-gradient(90deg, #000, #fff)" onChange={(v, done) => set({ high: Math.max(v / 100, c.low) }, done)} />
          <LookSlider label="Soft below" value={Math.round((c.featherLow ?? 0) * 100)} min={0} max={100} step={1} onChange={(v, done) => set({ featherLow: v / 100 }, done)} />
          <LookSlider label="Soft above" value={Math.round((c.featherHigh ?? 0) * 100)} min={0} max={100} step={1} onChange={(v, done) => set({ featherHigh: v / 100 }, done)} />
          {strength}
        </>
      )
  }
}

export interface LookMasksEditorProps {
  masks: readonly LookMask[]
  /** The look's subject key (lookView.mask.subject). */
  subject: string
  /** Where new geometric components go (the mask space). */
  box: Box
  /** Masks of a picture's own look are in its pixels; of a layer / the map in map pixels. */
  spaceLabel: string
  onChange: Change<LookMask[]>
}

export function LookMasksEditor({ masks, subject, box, spaceLabel, onChange }: LookMasksEditorProps) {
  const view = useLookView()
  const editing = view.mask && view.mask.subject === subject ? view.mask : null
  const current = masks.find((m) => m.id === editing?.maskId) ?? null
  const look = { masks: [...masks] }
  const select = (maskId: string | null, componentId: string | null = null) => setLookView({ mask: maskId ? { subject, maskId, componentId } : null })
  const setMask = (id: string, next: LookMask | null, done = true) => onChange(masks.flatMap((m) => (m.id !== id ? [m] : next ? [next] : [])), done)

  const addMask = (type: MaskComponentType) => {
    const m = newMask(masks, type, box)
    onChange([...masks, m], true)
    select(m.id, m.components[0].id)
  }
  const addComponent = (mask: LookMask, mode: MaskMode, type: MaskComponentType) => {
    const c = newComponent(type, mode, box)
    setMask(mask.id, { ...mask, components: [...mask.components, c] })
    select(mask.id, c.id)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AddMenu label="New mask" mode="new" disabled={!canAddMask(look)} onAdd={addMask}>
          <EdButton size="sm" variant="primary" disabled={!canAddMask(look)} aria-label="New mask">
            <Plus /> New mask
          </EdButton>
        </AddMenu>
        <span className="flex-1" />
        <Segmented<LookViewState['overlay']>
          aria-label="Mask overlay"
          value={view.overlay}
          options={[
            { value: 'off', label: 'Off', title: 'Show the result only' },
            { value: 'overlay', label: 'Overlay', title: 'Show the mask as a red overlay' },
            { value: 'bw', label: 'B/W', title: 'Show the mask in black and white' },
          ]}
          onChange={(overlay) => setLookView({ overlay })}
        />
        <InfoTip>
          A mask applies its own adjustments to part of the picture. Components combine top to bottom: Add (+) extends the selection, Subtract (−) removes from it, Intersect (×) keeps only what both select. Geometry is in {spaceLabel}. Drag the handles on the canvas; brush masks paint while the brush component is selected. Up to 4 masks and 16 components per look.
        </InfoTip>
      </div>
      {masks.length === 0 ? <div className="ed-hint py-2 text-center">No masks yet</div> : null}
      {masks.map((m) => {
        const open = m.id === current?.id
        const hidden = m.visible === false
        return (
          <Card
            key={m.id}
            collapsible
            open={open}
            onOpenChange={(o) => select(o ? m.id : null)}
            className={cn(open && 'ring-1 ring-primary/60')}
            title={m.name}
            summary={`${m.components.length} part${m.components.length === 1 ? '' : 's'}`}
            dim={hidden}
            actions={
              <>
                <EyeButton visible={!hidden} name={m.name} onToggle={() => setMask(m.id, { ...m, visible: hidden ? undefined : false })} />
                <IconButton aria-label={`Invert ${m.name}`} title="Invert" active={m.invert} onClick={() => setMask(m.id, { ...m, invert: m.invert ? undefined : true })}>
                  <FlipHorizontal2 />
                </IconButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton aria-label={`${m.name} menu`} title="More">
                      <MoreHorizontal />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onChange([...masks, { ...structuredClone(m), id: `${m.id}_${Date.now().toString(36)}`, name: `${m.name} copy` }], true)} disabled={!canAddMask(look)}>
                      <Copy /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setMask(m.id, null)}>
                      <Trash2 /> Delete mask
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          >
            <>
                <TextField aria-label="Mask name" value={m.name} onCommit={(name) => setMask(m.id, { ...m, name: name.trim() || m.name })} />
                <LookSlider label="Amount" value={Math.round((m.amount ?? 1) * 100)} defaultValue={100} min={0} max={100} step={1} onChange={(v, done) => setMask(m.id, { ...m, amount: v >= 100 ? undefined : v / 100 }, done)} />
                <div className="flex flex-col gap-0.5">
                  {m.components.map((c) => {
                    const sel = editing?.componentId === c.id
                    const off = c.visible === false
                    return (
                      <div key={c.id}>
                        <div className="ed-row h-7" data-selected={sel ? 'true' : undefined}>
                          <span className={cn('inline-flex size-4 shrink-0 items-center justify-center rounded-sm [&>svg]:size-3', c.mode === 'subtract' ? 'bg-red-500/30' : c.mode === 'intersect' ? 'bg-amber-500/30' : 'bg-primary/30')} title={MODE_LABELS[c.mode]}>
                            {MODE_ICONS[c.mode]}
                          </span>
                          {COMPONENT_ICONS[c.type]}
                          <button type="button" className={cn('ed-row-label flex-1 truncate text-left', off && 'opacity-50')} onClick={() => select(m.id, sel ? null : c.id)}>
                            {COMPONENT_LABELS[c.type]}
                            {c.invert ? <span className="ml-1 text-muted-foreground">(inverted)</span> : null}
                          </button>
                          <IconButton aria-label={`Invert ${COMPONENT_LABELS[c.type]}`} title="Invert" active={c.invert} onClick={() => setMask(m.id, updateComponent(m, c.id, (x) => ({ ...x, invert: x.invert ? undefined : true })))}>
                            <FlipHorizontal2 />
                          </IconButton>
                          <EyeButton visible={!off} name={COMPONENT_LABELS[c.type].toLowerCase()} onToggle={() => setMask(m.id, updateComponent(m, c.id, (x) => ({ ...x, visible: off ? undefined : false })))} />
                          <IconButton aria-label="Delete component" tone="danger" onClick={() => setMask(m.id, m.components.length > 1 ? updateComponent(m, c.id, () => null) : null)}>
                            <Trash2 />
                          </IconButton>
                        </div>
                        {sel ? (
                          <div className="flex flex-col gap-1.5 py-1.5 pl-6">
                            <Segmented<MaskMode>
                              aria-label="Combine"
                              value={c.mode}
                              options={(['add', 'subtract', 'intersect'] as const).map((mode) => ({ value: mode, label: MODE_LABELS[mode] }))}
                              onChange={(mode) => setMask(m.id, updateComponent(m, c.id, (x) => ({ ...x, mode })))}
                            />
                            <ComponentSettings c={c} view={view} onChange={(next, done) => setMask(m.id, updateComponent(m, c.id, () => next), done)} />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1">
                  {(['add', 'subtract', 'intersect'] as const).map((mode) => (
                    <AddMenu key={mode} label={MODE_LABELS[mode]} mode={mode} disabled={!canAddComponent(look)} onAdd={(t) => addComponent(m, mode, t)}>
                      <EdButton size="sm" variant="dashed" className="flex-1" disabled={!canAddComponent(look)} aria-label={`${MODE_LABELS[mode]} component`}>
                        {MODE_ICONS[mode]} {MODE_LABELS[mode]}
                      </EdButton>
                    </AddMenu>
                  ))}
                </div>
                <div className="ed-section-title mt-1">Mask adjustments</div>
                <LookAdjustEditor detail={false} adjust={m.adjust} onChange={(adjust, done) => setMask(m.id, { ...m, adjust: adjust ?? {} }, done)} />
            </>
          </Card>
        )
      })}
    </div>
  )
}
