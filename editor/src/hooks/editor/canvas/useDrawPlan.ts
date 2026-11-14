import { useMemo, useRef } from 'react'
import { drawPlan, sceneIndex, type DrawSegment, type SceneIndex } from '@/lib/sceneIndex'
import type { EntityData } from '@/types/editor'
import type { SceneNode } from '../../../../../shared/sceneTree'

const NO_NODES: SceneNode[] = []

const sameItems = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

const sameSegment = (a: DrawSegment, b: DrawSegment) =>
  a.kind === b.kind && (a.kind === 'layers' ? sameItems(a.layers, (b as typeof a).layers) : sameItems(a.entities, (b as typeof a).entities))

export interface CanvasScene {
  index: SceneIndex
  /** What the canvas draws bottom to top (see `drawPlan`); a segment keeps its identity while its layers / entities are the same nodes. */
  segments: DrawSegment[]
  /** Every shown entity (the picking handles and the overlays work on all of them). Same array while the entities are the same nodes. */
  entities: readonly EntityData[]
}

/**
 * The scene tree of a map as the canvas needs it: the index and the draw plan, both computed once per tree, with segments
 * and the entity list handed out as the same objects while nothing in them changed, so memoised Konva layers skip redrawing
 * when something else in the tree (another layer, a picture elsewhere) was edited.
 */
export function useDrawPlan(nodes: SceneNode[] | undefined): CanvasScene {
  const tree = nodes ?? NO_NODES
  const index = useMemo(() => sceneIndex(tree), [tree])
  const plan = drawPlan(index)
  const last = useRef<{ segments: Map<string, DrawSegment>; entities: readonly EntityData[] }>({ segments: new Map(), entities: [] })

  const segments = plan.segments.map((seg) => {
    const old = last.current.segments.get(seg.key)
    return old && sameSegment(old, seg) ? old : seg
  })
  const entities = sameItems(last.current.entities, plan.entities) ? last.current.entities : (plan.entities as unknown as EntityData[])
  last.current = { segments: new Map(segments.map((s) => [s.key, s])), entities }
  return { index, segments, entities }
}
