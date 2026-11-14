// On-canvas editing of the mask component chosen in the Look panel: handles for linear and radial gradients and the
// marquee, and painting for brush components (Lightroom's mask tools). Geometry is in the mask's space (a picture's own
// pixels or map pixels) and mapped to the canvas through the subject mapping (shared/look/shader.ts).

import React, { useRef, useState, useSyncExternalStore } from 'react'
import { Circle, Ellipse, Group, Line, Rect } from 'react-konva'
import type Konva from 'konva'
import { subjectToWorld, worldToSubject, WORLD_SUBJECT, type LookPlacement } from '../../../../../../shared/look/shader'
import type { BrushStroke, LookSet, MaskComponent } from '../../../../../../shared/look/types'
import type { MapData } from '@/types/editor'
import type { SceneNode } from '../../../../../../shared/sceneTree'
import { findPicture } from '@/lib/look/lookEdit'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import { editLookSet, lookInView, updateComponent, updateMask } from '@/lib/look/lookEdit'
import { getLookSet } from '@/lib/look/lookSubjects'
import { parseSubjectKey, useLookView, type LookSubjectRef } from '@/lib/look/lookView'
import { resolveImageItem } from '@/lib/imageItems'
import { pictureBox } from '@/lib/look/pictureBox'
import { useLookLibrary } from '@/lib/look/lookLibrary'

type Subject = LookPlacement['subject']
type Pt = { x: number; y: number }

const COLOR = '#ffffff'
const ACCENT = '#3b82f6'

interface Props {
  map: MapData
  nodes: readonly SceneNode[]
  spriteAssets: Record<string, SpriteAssetInfo>
  viewStore: { subscribe: (l: () => void) => () => void; getSnapshot: () => { scale: number; x: number; y: number } }
  setLook: (ref: LookSubjectRef, set: LookSet | undefined, commit?: boolean) => void
}

/** The subject mapping of a look subject: world for the map / a layer, the picture's own pixels for a picture. */
function subjectMapping(ref: LookSubjectRef, nodes: readonly SceneNode[], assets: Record<string, SpriteAssetInfo>): Subject | null {
  if (ref.kind !== 'picture') return WORLD_SUBJECT
  const item = findPicture(nodes, ref)
  const resolved = item ? resolveImageItem(item, assets) : null
  return item && resolved ? pictureBox(item, resolved, item).subject : null
}

/** A round handle drawn at the same screen size at any zoom. */
function Handle({ at, k, onMove, onEnd, fill = COLOR, label }: { at: Pt; k: number; onMove: (p: Pt) => void; onEnd: () => void; fill?: string; label: string }) {
  return (
    <Circle
      name={`look-mask-handle ${label}`}
      x={at.x}
      y={at.y}
      radius={5 / k}
      fill={fill}
      stroke="#111"
      strokeWidth={1.5 / k}
      hitStrokeWidth={8 / k}
      draggable
      onMouseEnter={(e) => ((e.target.getStage()!.container().style.cursor = 'move'))}
      onMouseLeave={(e) => ((e.target.getStage()!.container().style.cursor = ''))}
      onDragMove={(e) => onMove({ x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => {
        onMove({ x: e.target.x(), y: e.target.y() })
        onEnd()
      }}
    />
  )
}

export function KonvaMaskEditor({ map, nodes, spriteAssets, viewStore, setLook }: Props) {
  const view = useLookView()
  const lib = useLookLibrary()
  const cam = useSyncExternalStore(viewStore.subscribe, viewStore.getSnapshot)

  const editing = view.mask
  if (!editing || !editing.componentId || !view.enabled) return null
  const ref = parseSubjectKey(editing.subject)
  if (!ref) return null
  const s = subjectMapping(ref, nodes, spriteAssets)
  if (!s) return null
  const set = getLookSet(map, nodes, ref)
  const profile = view.profile !== null && lib.file.profiles.some((p) => p.id === view.profile) ? view.profile : null
  const look = lookInView(set, profile).look
  const mask = look?.masks?.find((m) => m.id === editing.maskId)
  const comp = mask?.components.find((c) => c.id === editing.componentId)
  if (!mask || !comp) return null
  return <MaskHandles key={comp.id} subjectRef={ref} s={s} set={set} profile={profile} maskId={mask.id} comp={comp} cam={cam} brush={view.brush} setLook={setLook} />
}

interface HandlesProps {
  subjectRef: LookSubjectRef
  s: Subject
  set: LookSet | undefined
  profile: string | null
  maskId: string
  comp: MaskComponent
  cam: { scale: number; x: number; y: number }
  brush: ReturnType<typeof useLookView>['brush']
  setLook: Props['setLook']
}

function MaskHandles({ subjectRef: ref, s, set, profile, maskId, comp, cam, brush, setLook }: HandlesProps) {
  const [cursor, setCursor] = useState<Pt | null>(null)
  const painting = useRef<{ stroke: BrushStroke } | null>(null)
  // the latest component (drags write several times before the end)
  const latest = useLatest(comp)
  const k = cam.scale || 1
  const toW = (x: number, y: number) => subjectToWorld(s, x, y)
  const toS = (p: Pt) => worldToSubject(s, p.x, p.y)
  /** Map pixels per subject pixel (for sizes). */
  const unit = 1 / Math.abs(s.sx)

  const write = (next: MaskComponent, commit: boolean) =>
    setLook(ref, editLookSet(set, profile, (l) => updateMask(l, maskId, (m) => updateComponent(m, comp.id, () => next))), commit)
  const commit = () => write(latest.current, true)
  const move = (patch: Partial<MaskComponent>) => {
    const next = { ...latest.current, ...patch } as MaskComponent
    latest.current = next
    write(next, false)
  }
  const r1 = (v: number) => Math.round(v * 10) / 10

  switch (comp.type) {
    case 'linear': {
      const a = toW(comp.x1, comp.y1)
      const b = toW(comp.x2, comp.y2)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      // lines across the gradient at its start (full effect), middle and end (none), like Lightroom
      const nx = (-dy / len) * Math.max(len, 200 / k)
      const ny = (dx / len) * Math.max(len, 200 / k)
      const across = (p: Pt, dash?: number[]) => <Line points={[p.x - nx, p.y - ny, p.x + nx, p.y + ny]} stroke={COLOR} strokeWidth={1.5 / k} dash={dash?.map((d) => d / k)} shadowColor="#000" shadowBlur={2} listening={false} />
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      return (
        <Group>
          {across(a)}
          {across(mid, [6, 4])}
          {across(b)}
          <Line points={[a.x, a.y, b.x, b.y]} stroke={ACCENT} strokeWidth={1 / k} listening={false} />
          <Handle
            label="middle"
            at={mid}
            k={k}
            fill={ACCENT}
            onMove={(p) => {
              const d = toS({ x: p.x - mid.x + a.x, y: p.y - mid.y + a.y })
              const e = toS({ x: p.x - mid.x + b.x, y: p.y - mid.y + b.y })
              move({ x1: r1(d.x), y1: r1(d.y), x2: r1(e.x), y2: r1(e.y) })
            }}
            onEnd={commit}
          />
          <Handle label="start" at={a} k={k} onMove={(p) => { const q = toS(p); move({ x1: r1(q.x), y1: r1(q.y) }) }} onEnd={commit} />
          <Handle label="end" at={b} k={k} onMove={(p) => { const q = toS(p); move({ x2: r1(q.x), y2: r1(q.y) }) }} onEnd={commit} />
        </Group>
      )
    }
    case 'radial': {
      const rot = ((comp.rotation ?? 0) * Math.PI) / 180
      const c = toW(comp.cx, comp.cy)
      const ex = toW(comp.cx + comp.rx * Math.cos(rot), comp.cy + comp.rx * Math.sin(rot))
      const ey = toW(comp.cx - comp.ry * Math.sin(rot), comp.cy + comp.ry * Math.cos(rot))
      const rx = Math.hypot(ex.x - c.x, ex.y - c.y)
      const ry = Math.hypot(ey.x - c.x, ey.y - c.y)
      const angle = (Math.atan2(ex.y - c.y, ex.x - c.x) * 180) / Math.PI
      const f = 1 - (comp.feather ?? 0.5)
      return (
        <Group>
          <Ellipse x={c.x} y={c.y} radiusX={rx} radiusY={ry} rotation={angle} stroke={COLOR} strokeWidth={1.5 / k} shadowColor="#000" shadowBlur={2} listening={false} />
          {f < 0.999 ? <Ellipse x={c.x} y={c.y} radiusX={rx * f} radiusY={ry * f} rotation={angle} stroke={COLOR} strokeWidth={1 / k} dash={[5 / k, 4 / k]} listening={false} /> : null}
          <Handle label="centre" at={c} k={k} fill={ACCENT} onMove={(p) => { const q = toS(p); move({ cx: r1(q.x), cy: r1(q.y) }) }} onEnd={commit} />
          <Handle
            label="width"
            at={ex}
            k={k}
            onMove={(p) => {
              const q = toS(p)
              const vx = q.x - comp.cx
              const vy = q.y - comp.cy
              move({ rx: r1(Math.max(1, Math.hypot(vx, vy))), rotation: Math.round((Math.atan2(vy, vx) * 180) / Math.PI) })
            }}
            onEnd={commit}
          />
          <Handle
            label="height"
            at={ey}
            k={k}
            onMove={(p) => {
              const q = toS(p)
              move({ ry: r1(Math.max(1, Math.hypot(q.x - comp.cx, q.y - comp.cy))) })
            }}
            onEnd={commit}
          />
        </Group>
      )
    }
    case 'rect': {
      const p0 = toW(comp.x, comp.y)
      const p1 = toW(comp.x + comp.w, comp.y + comp.h)
      const x = Math.min(p0.x, p1.x)
      const y = Math.min(p0.y, p1.y)
      const w = Math.abs(p1.x - p0.x)
      const h = Math.abs(p1.y - p0.y)
      const feather = (comp.feather ?? 0) * unit
      // corners in subject space: dragging one moves that corner, the opposite stays
      const corner = (cx: 0 | 1, cy: 0 | 1) => {
        const at = toW(comp.x + comp.w * cx, comp.y + comp.h * cy)
        return (
          <Handle
            key={`${cx}${cy}`}
            label={`corner ${cx}${cy}`}
            at={at}
            k={k}
            onMove={(p) => {
              const q = toS(p)
              const ox = cx ? comp.x : comp.x + comp.w
              const oy = cy ? comp.y : comp.y + comp.h
              move({ x: r1(Math.min(q.x, ox)), y: r1(Math.min(q.y, oy)), w: r1(Math.max(1, Math.abs(q.x - ox))), h: r1(Math.max(1, Math.abs(q.y - oy))) })
            }}
            onEnd={commit}
          />
        )
      }
      return (
        <Group>
          <Rect x={x} y={y} width={w} height={h} cornerRadius={(comp.radius ?? 0) * unit} stroke={COLOR} strokeWidth={1.5 / k} shadowColor="#000" shadowBlur={2} listening={false} />
          {feather > 0 && w > feather * 2 && h > feather * 2 ? <Rect x={x + feather} y={y + feather} width={w - feather * 2} height={h - feather * 2} stroke={COLOR} strokeWidth={1 / k} dash={[5 / k, 4 / k]} listening={false} /> : null}
          <Handle
            label="move"
            at={{ x: x + w / 2, y: y + h / 2 }}
            k={k}
            fill={ACCENT}
            onMove={(p) => {
              const q = toS({ x: p.x - w / 2, y: p.y - h / 2 })
              const q2 = toS({ x: p.x + w / 2, y: p.y + h / 2 })
              move({ x: r1(Math.min(q.x, q2.x)), y: r1(Math.min(q.y, q2.y)) })
            }}
            onEnd={commit}
          />
          {corner(0, 0)}
          {corner(1, 0)}
          {corner(0, 1)}
          {corner(1, 1)}
        </Group>
      )
    }
    case 'brush': {
      const b = brush
      const r = b.size * unit
      const stagePoint = (e: Konva.KonvaEventObject<MouseEvent>): Pt | null => {
        const st = e.target.getStage()
        const p = st?.getPointerPosition()
        if (!st || !p) return null
        const t = st.getAbsoluteTransform().copy().invert()
        return t.point(p)
      }
      const add = (p: Pt) => {
        const cur = painting.current
        if (!cur) return
        const q = toS(p)
        const pts = cur.stroke.points
        const n = pts.length
        // a point every quarter radius is enough for a smooth stroke
        if (n >= 2 && Math.hypot(q.x - pts[n - 2], q.y - pts[n - 1]) < Math.max(0.5, b.size / 4)) return
        cur.stroke = { ...cur.stroke, points: [...pts, r1(q.x), r1(q.y)] }
        const base = latest.current as Extract<MaskComponent, { type: 'brush' }>
        write({ ...base, strokes: [...base.strokes, cur.stroke] }, false)
      }
      const finish = () => {
        const cur = painting.current
        painting.current = null
        if (!cur || cur.stroke.points.length === 0) return
        const base = latest.current as Extract<MaskComponent, { type: 'brush' }>
        const next = { ...base, strokes: [...base.strokes, cur.stroke] }
        latest.current = next
        write(next, true)
      }
      // a catcher over the visible area: left-drag paints (and keeps the tile tools from painting)
      const viewRect = { x: -cam.x / k, y: -cam.y / k, w: 1e5, h: 1e5 }
      return (
        <Group>
          <Rect
            name="look-mask-brush"
            x={viewRect.x - 1e4}
            y={viewRect.y - 1e4}
            width={viewRect.w + 2e4}
            height={viewRect.h + 2e4}
            fill="rgba(0,0,0,0.001)"
            onMouseDown={(e) => {
              if (e.evt.button !== 0) return
              const p = stagePoint(e)
              if (!p) return
              e.cancelBubble = true
              painting.current = { stroke: { points: [], size: b.size, feather: b.feather, flow: b.flow, ...(b.erase ? { erase: true } : {}) } }
              add(p)
            }}
            onMouseMove={(e) => {
              const p = stagePoint(e)
              setCursor(p)
              if (p && painting.current) add(p)
            }}
            onMouseUp={finish}
            onMouseLeave={() => {
              setCursor(null)
              finish()
            }}
          />
          {cursor ? (
            <>
              <Circle x={cursor.x} y={cursor.y} radius={r} stroke={b.erase ? '#f87171' : COLOR} strokeWidth={1.5 / k} shadowColor="#000" shadowBlur={2} listening={false} />
              {b.feather > 0 ? <Circle x={cursor.x} y={cursor.y} radius={r * (1 - b.feather)} stroke={COLOR} strokeWidth={1 / k} dash={[4 / k, 3 / k]} listening={false} /> : null}
            </>
          ) : null}
        </Group>
      )
    }
    default:
      return null
  }
}

/** A ref that follows a value (reset whenever the value changes from outside). */
function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value)
  const seen = useRef(value)
  if (seen.current !== value) {
    seen.current = value
    ref.current = value
  }
  return ref
}
