// Compact Lightroom-mobile-style controls for the look panels. Every control is controlled (value in, onChange out):
// `onChange(next, done)` fires continuously while dragging with done=false and once with done=true on release, a
// keyboard step or a reset; the caller commits an undo step only on done=true.
import React, { useRef, useState } from 'react'
import { Slider } from '../ui/fields'
import { Card, EyeButton, ResetButton } from '../ui/controls'
import { cn } from '@/lib/utils'
import { curveTable } from '../../../../../shared/look/bake'
import { HSL_BANDS, HSL_BAND_COLORS, HSL_BAND_HUES } from '../../../../../shared/look/schema'
import type { CurvePoints, GradeWheel, HslBand, HslShift, LookAdjust } from '../../../../../shared/look/types'

export type Change<T> = (next: T, done: boolean) => void

// ── slider ─────────────────────────────────────────────────────────────────────────────────────────

const decimalsOf = (step: number) => (step < 0.1 ? 2 : step < 1 ? 1 : 0)
const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function formatLookValue(v: number, step: number, bipolar: boolean, unit = ''): string {
  const d = decimalsOf(step)
  const s = roundTo(v, d).toFixed(d)
  return `${bipolar && v > 0 ? '+' : ''}${s}${unit}`
}

export interface LookSliderProps {
  label: string
  value: number
  defaultValue?: number
  min: number
  max: number
  step: number
  /** CSS gradient for the track. */
  track?: string
  unit?: string
  disabled?: boolean
  onChange: Change<number>
}

export function LookSlider({ label, value, defaultValue = 0, min, max, step, track, unit, disabled, onChange }: LookSliderProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const bipolar = min < 0 && max > 0
  const isDefault = value === defaultValue
  const reset = () => onChange(defaultValue, true)
  const commitText = () => {
    if (editing === null) return
    const n = parseFloat(editing)
    setEditing(null)
    if (Number.isFinite(n)) onChange(roundTo(clamp(n, min, max), Math.max(decimalsOf(step), 2)), true)
  }
  const tone = isDefault ? 'text-muted-foreground' : 'text-foreground'

  return (
    <div className={cn('flex flex-col gap-0.5', disabled && 'pointer-events-none opacity-50')}>
      <div className="flex h-4 items-center justify-between gap-2 text-ed-label">
        <span className={cn('truncate select-none', tone)} onDoubleClick={reset} title="Double-click to reset">
          {label}
        </span>
        {editing !== null ? (
          <input
            aria-label={`${label} value input`}
            autoFocus
            className="ed-input h-4 w-14 px-1 text-right text-ed-label"
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText()
              else if (e.key === 'Escape') {
                e.stopPropagation()
                setEditing(null)
              }
            }}
          />
        ) : (
          <button type="button" aria-label={`${label} value`} className={cn('ed-mono tabular-nums', tone)} onClick={() => setEditing(String(roundTo(value, decimalsOf(step))))}>
            {formatLookValue(value, step, bipolar, unit)}
          </button>
        )}
      </div>
      <div onDoubleClick={reset}>
        <Slider
          aria-label={label}
          value={clamp(value, min, max)}
          min={min}
          max={max}
          step={step}
          track={track}
          origin={bipolar ? 0 : undefined}
          disabled={disabled}
          onChange={(v) => onChange(v, false)}
          onRelease={(v) => onChange(v, true)}
        />
      </div>
    </div>
  )
}

// ── curves ─────────────────────────────────────────────────────────────────────────────────────────

export type CurveChannel = 'rgb' | 'r' | 'g' | 'b'
type Curves = NonNullable<LookAdjust['curves']>

const CHANNELS: { id: CurveChannel; label: string; color: string }[] = [
  { id: 'rgb', label: 'RGB', color: '#e6e6e6' },
  { id: 'r', label: 'Red', color: '#ef4444' },
  { id: 'g', label: 'Green', color: '#22c55e' },
  { id: 'b', label: 'Blue', color: '#3b82f6' },
]
const STRAIGHT: CurvePoints = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
]
const MIN_GAP = 0.005

export const isStraightCurve = (p: CurvePoints | undefined) => !p || p.length < 2 || p.every((q) => Math.abs(q.x - q.y) < 1e-6)

/** Inserts a point keeping the list sorted by x; returns the new list and the index of the point. */
export function insertCurvePoint(points: CurvePoints, p: { x: number; y: number }): { points: CurvePoints; index: number } {
  const pt = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }
  let index = points.findIndex((q) => q.x > pt.x)
  if (index < 0) index = points.length
  return { points: [...points.slice(0, index), pt, ...points.slice(index)], index }
}

/** Moves a point; x stays between its neighbours, both axes stay in 0..1. */
export function moveCurvePoint(points: CurvePoints, i: number, p: { x: number; y: number }): CurvePoints {
  const lo = i > 0 ? points[i - 1].x + MIN_GAP : 0
  const hi = i < points.length - 1 ? points[i + 1].x - MIN_GAP : 1
  return points.map((q, k) => (k === i ? { x: clamp(p.x, lo, Math.max(lo, hi)), y: clamp(p.y, 0, 1) } : q))
}

/** Removes an interior point (the endpoints stay). */
export function removeCurvePoint(points: CurvePoints, i: number): CurvePoints {
  if (i <= 0 || i >= points.length - 1) return points
  return points.filter((_, k) => k !== i)
}

/** Sets one channel; a straight curve is stored as absent, and no curves at all as undefined. */
export function setCurveChannel(curves: LookAdjust['curves'], ch: CurveChannel, points: CurvePoints | undefined): LookAdjust['curves'] {
  const next: Curves = { ...curves }
  if (points && !isStraightCurve(points)) next[ch] = points
  else delete next[ch]
  return Object.keys(next).length ? next : undefined
}

function curvePath(points: CurvePoints | undefined): string {
  const t = curveTable(points)
  if (!t) return 'M0 100 L100 0'
  let d = ''
  for (let i = 0; i < t.length; i++) d += `${i ? 'L' : 'M'}${((i / (t.length - 1)) * 100).toFixed(2)} ${(100 - t[i] * 100).toFixed(2)}`
  return d
}

export interface CurveEditorProps {
  curves: LookAdjust['curves']
  onChange: Change<LookAdjust['curves']>
}

export function CurveEditor({ curves, onChange }: CurveEditorProps) {
  const [ch, setCh] = useState<CurveChannel>('rgb')
  // Working points: a straight curve is stored as absent, so extra points on the diagonal would vanish while editing.
  const [work, setWork] = useState<{ ch: CurveChannel; pts: CurvePoints; emitted: CurvePoints | undefined } | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<number | null>(null)

  const stored = curves?.[ch]
  const pts: CurvePoints = work && work.ch === ch && work.emitted === stored ? work.pts : stored && stored.length >= 2 ? stored : STRAIGHT
  const color = CHANNELS.find((c) => c.id === ch)?.color ?? '#fff'

  const publish = (next: CurvePoints, done: boolean) => {
    const nextCurves = setCurveChannel(curves, ch, next)
    setWork({ ch, pts: next, emitted: nextCurves?.[ch] })
    onChange(nextCurves, done)
  }
  const at = (e: { clientX: number; clientY: number }) => {
    const r = svg.current?.getBoundingClientRect()
    if (!r || r.width === 0) return { x: 0, y: 0 }
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) }
  }
  const hit = (p: { x: number; y: number }) => {
    let best = -1
    let bd = 0.06
    pts.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    return best
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div role="radiogroup" aria-label="Curve channel" className="flex items-center gap-1.5">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={ch === c.id}
              aria-label={`${c.label} curve`}
              title={c.label}
              className={cn('h-4 w-4 rounded-full border border-black/40', ch === c.id && 'ring-2 ring-ring ring-offset-1 ring-offset-background')}
              style={{ background: c.color }}
              onClick={() => setCh(c.id)}
            />
          ))}
        </div>
        <ResetButton
          name="curve"
          disabled={isStraightCurve(stored)}
          onReset={() => {
            setWork(null)
            onChange(setCurveChannel(curves, ch, undefined), true)
          }}
        />
      </div>
      <svg
        ref={svg}
        role="img"
        aria-label="Tone curve"
        viewBox="0 0 100 100"
        className="aspect-square w-full touch-none rounded border border-border bg-black/30"
        onPointerDown={(e) => {
          const p = at(e)
          e.currentTarget.setPointerCapture?.(e.pointerId)
          const h = hit(p)
          if (h >= 0) drag.current = h
          else {
            const ins = insertCurvePoint(pts, p)
            drag.current = ins.index
            publish(ins.points, false)
          }
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return
          publish(moveCurvePoint(pts, drag.current, at(e)), false)
        }}
        onPointerUp={(e) => {
          if (drag.current === null) return
          drag.current = null
          e.currentTarget.releasePointerCapture?.(e.pointerId)
          publish(pts, true)
        }}
        onDoubleClick={(e) => {
          const h = hit(at(e))
          if (h > 0 && h < pts.length - 1) publish(removeCurvePoint(pts, h), true)
        }}
      >
        {[25, 50, 75].map((g) => (
          <g key={g} stroke="currentColor" className="text-border" strokeWidth={0.4}>
            <line x1={g} y1={0} x2={g} y2={100} />
            <line x1={0} y1={g} x2={100} y2={g} />
          </g>
        ))}
        <line x1={0} y1={100} x2={100} y2={0} stroke="currentColor" className="text-muted-foreground/50" strokeWidth={0.5} strokeDasharray="2 2" />
        {CHANNELS.filter((c) => c.id !== ch && !isStraightCurve(curves?.[c.id])).map((c) => (
          <path key={c.id} d={curvePath(curves?.[c.id])} fill="none" stroke={c.color} strokeOpacity={0.3} strokeWidth={0.8} />
        ))}
        <path d={curvePath(pts)} fill="none" stroke={color} strokeWidth={1.2} />
        {pts.map((q, i) => (
          <circle key={i} cx={q.x * 100} cy={100 - q.y * 100} r={2.2} fill={color} stroke="#000" strokeWidth={0.5} />
        ))}
      </svg>
    </div>
  )
}

// ── colour wheel ───────────────────────────────────────────────────────────────────────────────────

/** Neutral parts removed; hue only matters while there is saturation; all neutral = undefined. */
export function cleanWheel(w: GradeWheel | undefined): GradeWheel | undefined {
  if (!w) return undefined
  const out: GradeWheel = {}
  const sat = w.sat ? roundTo(w.sat, 1) : 0
  if (sat > 0) {
    out.hue = roundTo((((w.hue ?? 0) % 360) + 360) % 360, 1)
    out.sat = sat
  }
  if (w.lum) out.lum = roundTo(w.lum, 1)
  return Object.keys(out).length ? out : undefined
}

export interface ColorWheelProps {
  value: GradeWheel | undefined
  size?: number
  /** Hide the Luminance slider (used by compact layouts). */
  compact?: boolean
  label?: string
  onChange: Change<GradeWheel | undefined>
}

const WHEEL_BG =
  'radial-gradient(circle closest-side, #cfcfcf 0%, rgba(207,207,207,0) 100%), conic-gradient(from 0deg, hsl(0 70% 50%), hsl(60 70% 50%), hsl(120 70% 50%), hsl(180 70% 50%), hsl(240 70% 50%), hsl(300 70% 50%), hsl(360 70% 50%))'

/** Hue 0 is red at the top, growing clockwise (like `conic-gradient(from 0deg)`). */
export function ColorWheel({ value, size = 120, compact, label = 'Wheel', onChange }: ColorWheelProps) {
  const disc = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const last = useRef<GradeWheel | undefined>(value)
  const hue = value?.hue ?? 0
  const sat = value?.sat ?? 0
  const lum = value?.lum ?? 0
  const rad = (hue * Math.PI) / 180
  const r = size / 2

  const fromPointer = (e: React.PointerEvent) => {
    const b = disc.current?.getBoundingClientRect()
    if (!b || b.width === 0) return
    const dx = e.clientX - (b.left + b.width / 2)
    const dy = e.clientY - (b.top + b.height / 2)
    const s = clamp((Math.hypot(dx, dy) / (b.width / 2)) * 100, 0, 100)
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    const next = cleanWheel({ ...value, hue: h, sat: s })
    last.current = next
    onChange(next, false)
  }

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <div className="mb-0.5 select-none text-[11px] text-muted-foreground">{label}</div>
      <div
        ref={disc}
        role="group"
        aria-label={`${label} wheel`}
        data-hue={Math.round(hue)}
        data-sat={Math.round(sat)}
        className="relative touch-none rounded-full border border-border"
        style={{ width: size, height: size, background: WHEEL_BG }}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture?.(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={(e) => {
          if (!dragging.current) return
          dragging.current = false
          e.currentTarget.releasePointerCapture?.(e.pointerId)
          onChange(last.current, true)
        }}
        onDoubleClick={() => onChange(cleanWheel({ lum }), true)}
      >
        <span
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: r + Math.sin(rad) * (sat / 100) * r, top: r - Math.cos(rad) * (sat / 100) * r, background: `hsl(${hue} 80% 55%)` }}
        />
      </div>
      <div className="flex w-full justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>H {Math.round(hue)}°</span>
        <span>S {Math.round(sat)}</span>
      </div>
      {!compact && (
        <div className="w-full">
          <LookSlider label="Luminance" value={lum} min={-100} max={100} step={1} onChange={(v, done) => onChange(cleanWheel({ ...value, lum: v }), done)} />
        </div>
      )}
    </div>
  )
}

// ── colour grading ─────────────────────────────────────────────────────────────────────────────────

type Grading = NonNullable<LookAdjust['grading']>
type GradeZone = 'shadows' | 'midtones' | 'highlights' | 'global'
type GradeTab = 'three' | GradeZone

const GRADE_TABS: { id: GradeTab; label: string; dot: string }[] = [
  { id: 'three', label: '3-way', dot: 'conic-gradient(#555 0 33%, #999 0 66%, #ddd 0)' },
  { id: 'shadows', label: 'Shadows', dot: '#333' },
  { id: 'midtones', label: 'Midtones', dot: '#888' },
  { id: 'highlights', label: 'Highlights', dot: '#eee' },
  { id: 'global', label: 'Global', dot: 'conic-gradient(#e5484d, #ffd60a, #46a758, #0090ff, #d6409f, #e5484d)' },
]

type GradingPatch = Partial<Record<GradeZone, GradeWheel | undefined>> & { blending?: number; balance?: number }

/** Sets a part of the grading; neutral parts (empty wheels, blending 50, balance 0) are removed; all neutral = undefined. */
export function setGradingPart(g: LookAdjust['grading'], patch: GradingPatch): LookAdjust['grading'] {
  const next: Grading = { ...g }
  for (const z of ['shadows', 'midtones', 'highlights', 'global'] as const) {
    if (z in patch) {
      const w = cleanWheel(patch[z])
      if (w) next[z] = w
      else delete next[z]
    }
  }
  if ('blending' in patch) {
    if (patch.blending === undefined || patch.blending === 50) delete next.blending
    else next.blending = patch.blending
  }
  if ('balance' in patch) {
    if (!patch.balance) delete next.balance
    else next.balance = patch.balance
  }
  return Object.keys(next).length ? next : undefined
}

export interface GradingEditorProps {
  grading: LookAdjust['grading']
  onChange: Change<LookAdjust['grading']>
}

export function GradingEditor({ grading, onChange }: GradingEditorProps) {
  const [tab, setTab] = useState<GradeTab>('three')
  const wheel = (z: GradeZone, size: number, compact: boolean, label: string) => (
    <ColorWheel key={z} label={label} size={size} compact={compact} value={grading?.[z]} onChange={(w, done) => onChange(setGradingPart(grading, { [z]: w }), done)} />
  )
  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Grading zone" className="flex gap-0.5 rounded bg-muted p-0.5">
        {GRADE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-label={t.label}
            title={t.label}
            className={cn('flex flex-1 items-center justify-center rounded px-1 py-1 text-[11px]', tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => setTab(t.id)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/40" style={{ background: t.dot }} />
          </button>
        ))}
      </div>
      {tab === 'three' ? (
        <div className="flex justify-between gap-1">
          {wheel('shadows', 84, true, 'Shadows')}
          {wheel('midtones', 84, true, 'Midtones')}
          {wheel('highlights', 84, true, 'Highlights')}
        </div>
      ) : (
        <div className="flex justify-center">{wheel(tab, 150, false, GRADE_TABS.find((t) => t.id === tab)?.label ?? '')}</div>
      )}
      <LookSlider label="Blending" value={grading?.blending ?? 50} defaultValue={50} min={0} max={100} step={1} onChange={(v, done) => onChange(setGradingPart(grading, { blending: v }), done)} />
      <LookSlider label="Balance" value={grading?.balance ?? 0} min={-100} max={100} step={1} onChange={(v, done) => onChange(setGradingPart(grading, { balance: v }), done)} />
    </div>
  )
}

// ── HSL mixer ──────────────────────────────────────────────────────────────────────────────────────

type Hsl = NonNullable<LookAdjust['hsl']>
const hslCss = (h: number, s = 80, l = 50) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`

/** Sets one value of one band; neutral values and bands are removed; all neutral = undefined. */
export function setHslValue(map: LookAdjust['hsl'], band: HslBand, key: keyof HslShift, v: number): LookAdjust['hsl'] {
  const shift: HslShift = { ...map?.[band] }
  if (v) shift[key] = v
  else delete shift[key]
  const next: Hsl = { ...map }
  if (Object.keys(shift).length) next[band] = shift
  else delete next[band]
  return Object.keys(next).length ? next : undefined
}

const bandChanged = (s: HslShift | undefined) => !!s && !!(s.h || s.s || s.l)

export interface HslMixerProps {
  hsl: LookAdjust['hsl']
  onChange: Change<LookAdjust['hsl']>
}

export function HslMixer({ hsl: map, onChange }: HslMixerProps) {
  const [band, setBand] = useState<HslBand>('red')
  const shift = map?.[band]
  const hue = HSL_BAND_HUES[band]
  const color = HSL_BAND_COLORS[band]
  const tracks = {
    h: `linear-gradient(90deg, ${hslCss(hue - 30)}, ${hslCss(hue)}, ${hslCss(hue + 30)})`,
    s: `linear-gradient(90deg, #808080, ${color})`,
    l: `linear-gradient(90deg, #111, ${color}, #fff)`,
  }
  const row = (key: keyof HslShift, label: string) => (
    <LookSlider key={`${band}-${key}`} label={label} value={shift?.[key] ?? 0} min={-100} max={100} step={1} track={tracks[key]} onChange={(v, done) => onChange(setHslValue(map, band, key, v), done)} />
  )
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Colour band" className="flex justify-between px-0.5">
        {HSL_BANDS.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={band === b}
            aria-label={`${b} band`}
            title={b}
            className={cn('relative h-5 w-5 rounded-full border border-black/40', band === b && 'ring-2 ring-ring ring-offset-1 ring-offset-background')}
            style={{ background: HSL_BAND_COLORS[b] }}
            onClick={() => setBand(b)}
          >
            {bandChanged(map?.[b]) && <span data-testid={`changed-${b}`} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/50" />}
          </button>
        ))}
      </div>
      {row('h', 'Hue')}
      {row('s', 'Saturation')}
      {row('l', 'Luminance')}
    </div>
  )
}

// ── collapsible section ────────────────────────────────────────────────────────────────────────────

export interface LookSectionProps {
  title: string
  icon?: React.ReactNode
  visible?: boolean
  onToggleVisible?: () => void
  onReset?: () => void
  defaultOpen?: boolean
  /** Shown beside the title while closed (e.g. "3 changes"). */
  summary?: React.ReactNode
  children: React.ReactNode
}

/** A section of the look editors: a collapsible card with its reset and its eye in the head. */
export function LookSection({ title, icon, visible = true, onToggleVisible, onReset, defaultOpen = false, summary, children }: LookSectionProps) {
  return (
    <Card
      collapsible
      defaultOpen={defaultOpen}
      title={title}
      icon={icon}
      summary={summary}
      dim={!visible}
      actions={
        <>
          {onReset && <ResetButton name={title} onReset={onReset} />}
          {onToggleVisible && <EyeButton name={title} visible={visible} onToggle={onToggleVisible} title={visible ? 'Switch off' : 'Switch on'} />}
        </>
      }
    >
      {children}
    </Card>
  )
}
