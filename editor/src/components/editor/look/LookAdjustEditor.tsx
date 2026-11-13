// The adjustments of a look or of one of its masks, in Lightroom's sections: Light, Color (with the mixer), Grading,
// Curve and Effects. Every change goes out as (next, done): done = the end of a drag, the moment to record an undo step.

import { Aperture, Blend, Droplets, Palette, Spline, Sun } from 'lucide-react'
import { ADJUST_SLIDERS, OVERLAY_MODES } from '../../../../../shared/look/schema'
import type { AdjustSection, LookAdjust, OverlayMode } from '../../../../../shared/look/types'
import { patchAdjust } from '@/lib/look/lookEdit'
import { ColorField, Select, optionsOf } from '../ui/fields'
import { CurveEditor, GradingEditor, HslMixer, LookSection, LookSlider, type Change } from './lookControls'

const SECTION_ICONS: Record<AdjustSection, React.ReactNode> = {
  light: <Sun className="h-3.5 w-3.5" />,
  color: <Palette className="h-3.5 w-3.5" />,
  mixer: <Droplets className="h-3.5 w-3.5" />,
  grading: <Aperture className="h-3.5 w-3.5" />,
  curves: <Spline className="h-3.5 w-3.5" />,
  effects: <Blend className="h-3.5 w-3.5" />,
}

const sliderKeys = (section: AdjustSection) => ADJUST_SLIDERS.filter((s) => s.section === section)

/** Short "Exposure +0.4, Contrast +12" summary of a section while it is closed. */
function summary(a: LookAdjust | undefined, section: AdjustSection): string | undefined {
  if (!a) return undefined
  const parts = sliderKeys(section).flatMap((s) => {
    const v = a[s.key]
    return typeof v === 'number' && v !== 0 ? [`${s.label} ${v > 0 ? '+' : ''}${Math.round(v * 100) / 100}`] : []
  })
  return parts.length ? parts.slice(0, 3).join(', ') + (parts.length > 3 ? '…' : '') : undefined
}

const SECTION_KEYS: Record<AdjustSection, (keyof LookAdjust)[]> = {
  light: sliderKeys('light').map((s) => s.key),
  color: sliderKeys('color').map((s) => s.key),
  mixer: ['hsl'],
  grading: ['grading'],
  curves: ['curves'],
  effects: [...sliderKeys('effects').map((s) => s.key), 'overlay'],
}

export interface LookAdjustEditorProps {
  adjust: LookAdjust | undefined
  onChange: Change<LookAdjust | undefined>
  /** Sections open at first. */
  open?: AdjustSection[]
  /** Extra Effects rows (vignette, grain: the whole look's only). */
  effectsExtra?: React.ReactNode
  /** Nothing in Effects but `effectsExtra` counts as set (for the summary / reset). */
  onResetEffectsExtra?: () => void
}

export function LookAdjustEditor({ adjust, onChange, open = ['light'], effectsExtra, onResetEffectsExtra }: LookAdjustEditorProps) {
  const set = (patch: Partial<LookAdjust>, done: boolean) => onChange(patchAdjust(adjust, patch), done)
  const off = adjust?.off ?? {}
  const toggle = (s: AdjustSection) => {
    const nextOff = { ...off, [s]: !off[s] }
    if (!nextOff[s]) delete nextOff[s]
    set({ off: Object.keys(nextOff).length ? nextOff : undefined }, true)
  }
  const reset = (s: AdjustSection) => {
    const patch: Partial<LookAdjust> = {}
    for (const k of SECTION_KEYS[s]) (patch as Record<string, undefined>)[k] = undefined
    set(patch, true)
    if (s === 'effects') onResetEffectsExtra?.()
  }
  const section = (s: AdjustSection, title: string, body: React.ReactNode, sum?: string) => (
    <LookSection
      key={s}
      title={title}
      icon={SECTION_ICONS[s]}
      visible={!off[s]}
      onToggleVisible={() => toggle(s)}
      onReset={() => reset(s)}
      defaultOpen={open.includes(s)}
      summary={sum}
    >
      {body}
    </LookSection>
  )
  const sliders = (s: AdjustSection) =>
    sliderKeys(s).map((d) => (
      <LookSlider
        key={d.key}
        label={d.label}
        value={(adjust?.[d.key] as number | undefined) ?? 0}
        min={d.min}
        max={d.max}
        step={d.step}
        track={d.track}
        onChange={(v, done) => set({ [d.key]: v }, done)}
      />
    ))
  const overlay = adjust?.overlay
  const setOverlay = (o: Partial<NonNullable<LookAdjust['overlay']>>, done: boolean) => {
    const next = { color: overlay?.color ?? '#ff9a3c', amount: overlay?.amount ?? 0, ...(overlay?.mode ? { mode: overlay.mode } : {}), ...o }
    set({ overlay: next.amount > 0 || o.amount === undefined ? next : undefined }, done)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {section('light', 'Light', sliders('light'), summary(adjust, 'light'))}
      {section('color', 'Color', sliders('color'), summary(adjust, 'color'))}
      {section('mixer', 'Color mixer', <HslMixer hsl={adjust?.hsl} onChange={(hsl, done) => set({ hsl }, done)} />, adjust?.hsl ? `${Object.keys(adjust.hsl).length} band(s)` : undefined)}
      {section('grading', 'Color grading', <GradingEditor grading={adjust?.grading} onChange={(grading, done) => set({ grading }, done)} />, adjust?.grading ? 'Set' : undefined)}
      {section('curves', 'Curve', <CurveEditor curves={adjust?.curves} onChange={(curves, done) => set({ curves }, done)} />, adjust?.curves ? 'Set' : undefined)}
      {section(
        'effects',
        'Effects',
        <>
          {sliders('effects')}
          <div className="mt-1 flex items-center gap-2">
            <span className="w-14 shrink-0 text-ed-label text-muted-foreground">Light color</span>
            <ColorField aria-label="Overlay colour" value={overlay?.color ?? '#ff9a3c'} onChange={(color) => setOverlay({ color }, true)} />
            <Select<OverlayMode>
              aria-label="Overlay blend mode"
              className="min-w-0 flex-1"
              value={overlay?.mode ?? 'softlight'}
              options={optionsOf(OVERLAY_MODES)}
              onChange={(mode) => setOverlay({ mode }, true)}
            />
          </div>
          <LookSlider label="Light amount" value={overlay?.amount ?? 0} min={0} max={100} step={1} track={`linear-gradient(90deg, transparent, ${overlay?.color ?? '#ff9a3c'})`} onChange={(amount, done) => setOverlay({ amount }, done)} />
          {effectsExtra}
        </>,
        summary(adjust, 'effects')
      )}
    </div>
  )
}
