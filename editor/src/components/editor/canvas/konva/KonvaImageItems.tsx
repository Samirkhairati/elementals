import React, { useMemo, useRef, useState } from 'react'
import { Group, Line, Rect, Shape } from 'react-konva'
import type { ImageItem, Layer } from '@/types/editor'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import { drawResolvedSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { flippedItemBounds, resolveImageItem } from '@/lib/imageItems'
import { snapPicture } from '@/lib/imageSnap'
import { sortedImages } from '@/lib/layerOrder'
import type { ImagePick } from '@/lib/graphicAssets'
import type { SelectMode } from '@/lib/imageSelection'
import { applyAxisLock, guideLines, type Axis, type AxisLock } from '@/lib/axisLock'
import { setStageCursor } from '../canvasUtils'

const NO_ASSETS: Record<string, SpriteAssetInfo> = {}
const NO_LAYERS: Layer[] = []
/** Guide lines are drawn this far to each side of the picture (further than any map). */
const GUIDE_EXTENT = 100000
const GUIDE_STROKE = '#38bdf8'

/** The two parallel lines that show which axis a Shift-locked picture moves along. */
function AxisGuides({ axis, bounds, anchor }: { axis: Axis; bounds: { x: number; y: number; w: number; h: number }; anchor: { x: number; y: number } }) {
  return (
    <>
      {guideLines(axis, bounds, anchor, GUIDE_EXTENT).map((l, i) => (
        <Line key={i} points={[l.x1, l.y1, l.x2, l.y2]} stroke={GUIDE_STROKE} strokeWidth={1} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
      ))}
    </>
  )
}

interface KonvaImageItemsProps {
  /** The active image layer: its images can always be picked and dragged. */
  layer: Layer | null
  /** Other image layers whose images can be picked too (the toolbar lock is off); picking one makes its layer the active one. */
  otherLayers?: Layer[]
  activateLayer?: (layerId: string) => void
  selectedImageId: string | null
  setSelectedImageId: (id: string | null) => void
  /** Everything picked (Ctrl/Cmd+click adds or removes a picture); falls back to `selectedImageId` alone. */
  pickedImageIds?: readonly string[]
  selectImage?: (layerId: string, imageId: string, mode: SelectMode) => void
  moveImage: (layerId: string, imageId: string, x: number, y: number) => void
  snapToGrid: boolean
  spriteAssets?: Record<string, SpriteAssetInfo>
  /** While an image waits to be placed the items stay out of the way so a click lands on the map. */
  placing?: boolean
  /** Written while an image is dragged so the layer that draws it can follow the mouse (see KonvaTilemapLayer). */
  dragRef?: React.MutableRefObject<{ id: string; x: number; y: number } | null>
}

/** Pick/drag handles and the selection frame for the images of the active image layer (and of the other image layers when the toolbar lock is off). */
export const KonvaImageItems = React.memo(function KonvaImageItems({
  layer,
  otherLayers = NO_LAYERS,
  activateLayer,
  selectedImageId,
  setSelectedImageId,
  pickedImageIds,
  selectImage,
  moveImage,
  snapToGrid,
  spriteAssets = NO_ASSETS,
  placing = false,
  dragRef,
}: KonvaImageItemsProps) {
  // Other layers first (bottom-up), the active layer last: what is on top is picked first, and the active layer wins.
  const layers = useMemo(() => [...otherLayers.filter((l) => l.type === 'image' && l.visible && !l.locked && l.id !== layer?.id).reverse(), ...(layer && layer.type === 'image' && layer.visible ? [layer] : [])], [otherLayers, layer])
  if (layers.length === 0) return null

  // Snapping puts the picture's edges on the grid, so the item's own size decides where its anchor goes.
  // Pictures may be dragged past the map's edge (scenery that runs off it); only the snap or the rounding applies.
  const place = (item: ImageItem, x: number, y: number) =>
    snapToGrid ? snapPicture(flippedItemBounds(item, spriteAssets, true), x, y) : { x: Math.round(x), y: Math.round(y) }

  return (
    <Group>
      {layers.map((l) => (
        <ImageLayerHandles
          key={l.id}
          layer={l}
          active={l.id === layer?.id}
          interactive={!l.locked && !placing}
          selectedImageId={selectedImageId}
          pickedImageIds={pickedImageIds}
          selectImage={selectImage}
          activateLayer={activateLayer}
          setSelectedImageId={setSelectedImageId}
          moveImage={moveImage}
          place={place}
          assets={spriteAssets}
          dragRef={dragRef}
        />
      ))}
    </Group>
  )
})

function ImageLayerHandles({
  layer,
  active,
  interactive,
  selectedImageId,
  pickedImageIds,
  selectImage,
  activateLayer,
  setSelectedImageId,
  moveImage,
  place,
  assets,
  dragRef,
}: {
  layer: Layer
  active: boolean
  interactive: boolean
  selectedImageId: string | null
  pickedImageIds?: readonly string[]
  selectImage?: (layerId: string, imageId: string, mode: SelectMode) => void
  activateLayer?: (layerId: string) => void
  setSelectedImageId: (id: string | null) => void
  moveImage: (layerId: string, imageId: string, x: number, y: number) => void
  place: (item: ImageItem, x: number, y: number) => { x: number; y: number }
  assets: Record<string, SpriteAssetInfo>
  dragRef?: React.MutableRefObject<{ id: string; x: number; y: number } | null>
}) {
  const items = useMemo(() => sortedImages(layer.images), [layer.images])
  // Picking an image of another layer makes that layer the active one (which clears the selection, so select after).
  // Ctrl/Cmd+click adds or removes a picture from the picked set (Shift+click is the canvas's own gesture).
  const pick = (id: string, mode: SelectMode = 'replace') => {
    if (!active) activateLayer?.(layer.id)
    if (active && selectImage) selectImage(layer.id, id, mode)
    else setSelectedImageId(id)
  }
  const picked = pickedImageIds ?? (selectedImageId ? [selectedImageId] : [])
  return (
    <Group>
      {items.map((item) => (
        <ImageHandle
          key={item.id}
          item={item}
          layerId={layer.id}
          assets={assets}
          selected={active && picked.includes(item.id)}
          interactive={interactive}
          place={place}
          pick={pick}
          moveImage={moveImage}
          dragRef={dragRef}
        />
      ))}
    </Group>
  )
}

function ImageHandle({
  item,
  layerId,
  assets,
  selected,
  interactive,
  place,
  pick,
  moveImage,
  dragRef,
}: {
  item: ImageItem
  layerId: string
  assets: Record<string, SpriteAssetInfo>
  selected: boolean
  interactive: boolean
  place: (item: ImageItem, x: number, y: number) => { x: number; y: number }
  pick: (id: string, mode?: SelectMode) => void
  moveImage: (layerId: string, imageId: string, x: number, y: number) => void
  dragRef?: React.MutableRefObject<{ id: string; x: number; y: number } | null>
}) {
  // Without the picture (deleted or still loading) itemBounds falls back to a tile-sized box so the item can still be picked.
  const bounds = flippedItemBounds(item, assets)
  // Holding Shift while dragging locks the picture to one axis (see lib/axisLock); the guides show which.
  const lockRef = useRef<AxisLock | null>(null)
  const [axis, setAxis] = useState<Axis | null>(null)

  return (
    <Group
      name="image-handle"
      imageId={item.id}
      x={item.x}
      y={item.y}
      listening={interactive}
      draggable={interactive}
      onMouseDown={(e) => {
        // Shift + left is the secondary button's gesture (see the canvas): it is left to the canvas.
        if (e.evt.button === 0 && !e.evt.shiftKey) {
          e.cancelBubble = true
          pick(item.id, e.evt.metaKey || e.evt.ctrlKey ? 'toggle' : 'replace')
        }
      }}
      onDragStart={(e) => {
        e.cancelBubble = true
        // A Ctrl/Cmd+click that turns into a drag keeps the picked set; a plain drag picks the dragged picture.
        if (!selected) pick(item.id)
        lockRef.current = null
        if (dragRef) dragRef.current = { id: item.id, x: item.x, y: item.y }
        setStageCursor(e.target.getStage(), 'grabbing')
      }}
      onDragMove={(e) => {
        e.cancelBubble = true
        const locked = applyAxisLock(lockRef.current, e.evt.shiftKey, e.target.x(), e.target.y())
        lockRef.current = locked.lock
        setAxis(locked.lock?.axis ?? null)
        const p = place(item, locked.x, locked.y)
        e.target.x(p.x)
        e.target.y(p.y)
        // The picture is drawn by its layer: tell it where the mouse has the image (Konva redraws while dragging).
        if (dragRef) dragRef.current = { id: item.id, x: p.x, y: p.y }
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        const p = place(item, e.target.x(), e.target.y())
        e.target.x(p.x)
        e.target.y(p.y)
        setStageCursor(e.target.getStage(), 'move')
        moveImage(layerId, item.id, p.x, p.y)
        lockRef.current = null
        setAxis(null)
        if (dragRef) dragRef.current = null
      }}
      onMouseEnter={(e) => interactive && setStageCursor(e.target.getStage(), 'move')}
      onMouseLeave={(e) => setStageCursor(e.target.getStage(), '')}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        e.cancelBubble = true
      }}
    >
      <Rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
        fill="rgba(0,0,0,0.001)"
        stroke={selected ? '#facc15' : undefined}
        strokeWidth={selected ? 1.5 : 0}
        strokeScaleEnabled={false}
        dash={selected ? [4, 3] : undefined}
      />
      {selected && <Rect x={-3} y={-3} width={6} height={6} fill="#facc15" listening={false} />}
      {axis && <AxisGuides axis={axis} bounds={bounds} anchor={{ x: 0, y: 0 }} />}
    </Group>
  )
}

interface KonvaGhostImageProps {
  pending: ImagePick | null
  pointerPos: { x: number; y: number } | null
  snapToGrid: boolean
  spriteAssets?: Record<string, SpriteAssetInfo>
  /** The axis a Shift-locked placement moves along, to draw its guide lines. */
  axis?: Axis | null
}

/** Translucent preview of the image about to be placed, snapped (or not) exactly like the placement itself. */
export const KonvaGhostImage = React.memo(function KonvaGhostImage({
  pending,
  pointerPos,
  snapToGrid,
  spriteAssets = NO_ASSETS,
  axis = null,
}: KonvaGhostImageProps) {
  const version = useSpriteImagesVersion()
  if (!pending || !pointerPos) return null
  const at = snapToGrid ? snapPicture(flippedItemBounds(pending, spriteAssets, true), pointerPos.x, pointerPos.y) : { x: Math.round(pointerPos.x), y: Math.round(pointerPos.y) }
  const resolved = resolveImageItem(pending, spriteAssets)
  return (
    <Group listening={false}>
      <Shape
        key={version}
        listening={false}
        sceneFunc={(context) => {
          if (resolved) drawResolvedSprite(context._context as CanvasRenderingContext2D, resolved, { anchorX: at.x, anchorY: at.y, opacity: 0.6 })
        }}
      />
      {axis && <AxisGuides axis={axis} bounds={flippedItemBounds(pending, spriteAssets)} anchor={at} />}
    </Group>
  )
})
