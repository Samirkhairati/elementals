import { usePolygonEdit } from '@/lib/polygonEditStore'
import type { SelectMode } from '@/lib/sceneSelection'
import type { ImageDrag } from './konva/imageDrag'
import React, { useCallback, useMemo, useRef } from 'react'
import type Konva from 'konva'
import { useMapLookPass } from '@/lib/look/useMapLookPass'
import type { ImagePick } from '@/lib/graphicAssets'
import { Stage, Layer as KonvaLayer, Rect, Group } from 'react-konva'
import {
  TilesetData,
  MapData,
  TileSelection,
  ActiveTool,
  PaintMode,
  Pos,
  EntityData,
  ComponentType,
  CollisionShape,
  type PropBag,
} from '@/types/editor'
import { useTilesetImages } from '@/hooks/editor/useTilesetImages'
import { useCanvasViewport } from '@/hooks/editor/canvas/useCanvasViewport'
import { useCanvasInteraction } from '@/hooks/editor/canvas/useCanvasInteraction'
import { KonvaTilemapLayer } from './konva/KonvaTilemapLayer'
import { KonvaOverlays } from './konva/KonvaOverlays'
import { KonvaEntities, type Visuals } from './konva/KonvaEntities'
import { KonvaGhostEntity } from './konva/KonvaGhostEntity'
import { KonvaEntityResize } from './konva/KonvaEntityResize'
import { KonvaNodeAnchor } from './konva/KonvaNodeAnchor'
import { COMPONENT_SCHEMAS } from '../../../../../shared/engine/components'
import type { ColliderPatch } from '@/lib/entityVisuals'
import { useDrawPlan } from '@/hooks/editor/canvas/useDrawPlan'
import { KonvaGhostImage, KonvaImageItems } from './konva/KonvaImageItems'
import { KonvaShapes } from './konva/KonvaShapes'
import { KonvaMaskEditor } from './konva/KonvaMaskEditor'
import { CanvasContextMenu } from './CanvasContextMenu'
import { CanvasNavigator, type ViewportHandle } from './CanvasNavigator'
import { PendingEntityPlacement } from '@/hooks/editor/useEntityPlacement'
import { useCanvasView } from '@/hooks/editor/canvas/canvasView'
import { isBranch, ownLook, type BranchNode, type SceneNode } from '../../../../../shared/sceneTree'
import { entityView, lockedNode, type SceneIndex } from '@/lib/sceneIndex'
import { mapPixelSize } from '../../../../../shared/mapSize'
import { useEditorSelector, type EditorContextValue } from '@/components/editor/layout/EditorContext'
import { useDropShadow } from '@/components/editor/look/DropShadowMenuItem'
import { hasShadow } from '@/lib/look/lookEdit'
import { openEventEditor } from '@/lib/openEventEditor'

const selectCanvasContext = (c: EditorContextValue) => ({
  spriteAssets: c.spriteAssets,
  setLook: c.setLook,
})

interface MapCanvasProps {
  /** The map to draw (its scene tree is `nodes`). */
  activeMap: MapData | null
  tilesets: TilesetData[]
  tileSelection: TileSelection | null
  setTileSelection: (s: TileSelection | null) => void
  activeTool: ActiveTool
  paintMode: PaintMode
  activeLayerId: string | null
  isPainting: boolean
  setIsPainting: (v: boolean) => void
  paintStartPos: Pos | null
  setPaintStartPos: (v: Pos | null) => void
  handlePaint: (x: number, y: number) => void
  handlePaintBucket: (x: number, y: number) => void
  handleRectangleFill: (start: Pos, end: Pos) => void
  handleCommit: () => void
  selectedEntityId?: string | null
  setSelectedEntityId?: (id: string | null) => void
  /** Moves a node's anchor; `carry` = what it holds moves along. */
  moveEntity?: (id: string, x: number, y: number, carry: boolean) => void
  showGrid?: boolean
  snapToGrid?: boolean
  /** Unused: entities snap with the magnet (`snapToGrid`) like pictures. */
  snapEntityPos?: (rawX: number, rawY: number) => { x: number; y: number }
  pendingPlacement?: PendingEntityPlacement | null
  commitPlacement?: (x: number, y: number) => void
  cancelPlacement?: () => void
  createEntity?: (name: string, x?: number, y?: number, initialComponents?: Partial<Record<ComponentType, PropBag>>) => void
  /** Puts a new node (a plain Node, a placed prefab) on the map. */
  placeNode?: (make: (newId: () => string) => SceneNode) => void
  duplicateEntity?: (id: string) => void
  deleteEntity?: (id: string) => void
  updateComponentProp?: (entityId: string, type: ComponentType, key: string, value: unknown) => void
  /** Batch variant: applies several props in one commit (one undo step / one save). */
  updateComponentProps?: (entityId: string, type: ComponentType, props: PropBag) => void
  /** Pinned: a right-drag samples every selected layer. */
  pinSelection?: boolean
  selectedLayerIds?: readonly string[]
  /** Image layers */
  pendingImage?: ImagePick | null
  commitImagePlacement?: (x: number, y: number) => void
  /** The picture whose resize handles show on the canvas (Images panel › Resize), and what a corner drag applies. */
  resizingImageId?: string | null
  resizeImage?: (layerId: string, imageId: string, change: { scale: number; x: number; y: number }) => void
  cancelImagePlacement?: () => void
  selectedImageId?: string | null
  /** A click on empty canvas while an image layer is active: lets go of the picked pictures. */
  clearImageSelection?: () => void
  pickedImageIds?: readonly string[]
  selectImage?: (layerId: string, imageId: string, mode: SelectMode) => void
  /** A dragged picked set (a group) moves as a whole. */
  moveImages?: (layerId: string, imageIds: readonly string[], dx: number, dy: number) => void
  /** "Place multiple" from the menu of a right-clicked picture, and the keys to show beside it. */
  onPlaceMultiple?: (imageId: string) => void
  placeMultipleKeys?: string
  /** Picking an image of another layer (toolbar lock off) makes that layer the active one. */
  activateLayer?: (layerId: string) => void
  moveImage?: (layerId: string, imageId: string, x: number, y: number) => void
  /** Replaces the shapes of a collision layer (the collision-shape editor); absent on a map tab that is not the active map. */
  setCollisionShapes?: (layerId: string, shapes: readonly CollisionShape[]) => void
  /** Removes an item (tiles item or shape) of the active collision layer. */
  deleteCollisionItem?: (itemId: string) => void
}

/** The sprite hosts that are not inside another one of the list (picking a host's handles covers the hosts inside it). */
function outermostHosts(hosts: readonly BranchNode[], index: SceneIndex): BranchNode[] {
  const ids = new Set(hosts.map((h) => h.id))
  return hosts.filter((h) => !index.byId.get(h.id)?.ancestors.some((a) => ids.has(a.id)))
}

export function MapCanvas({
  activeMap,
  tilesets,
  tileSelection,
  setTileSelection,
  activeTool,
  paintMode,
  activeLayerId,
  isPainting,
  setIsPainting,
  paintStartPos: _paintStartPos,
  setPaintStartPos,
  handlePaint,
  handlePaintBucket,
  handleRectangleFill,
  handleCommit,
  selectedEntityId = null,
  setSelectedEntityId,
  moveEntity,
  showGrid = true,
  snapToGrid = true,
  pendingPlacement = null,
  commitPlacement,
  cancelPlacement,
  createEntity,
  placeNode,
  duplicateEntity,
  deleteEntity,
  updateComponentProp,
  updateComponentProps,
  pinSelection = false,
  selectedLayerIds = [],
  pendingImage = null,
  commitImagePlacement,
  resizingImageId = null,
  resizeImage,
  cancelImagePlacement,
  selectedImageId = null,
  clearImageSelection,
  pickedImageIds,
  selectImage,
  moveImages,
  onPlaceMultiple,
  placeMultipleKeys,
  activateLayer,
  moveImage,
  setCollisionShapes,
  deleteCollisionItem,
}: MapCanvasProps) {
  // Preload and cache tileset image textures
  const images = useTilesetImages(tilesets)
  const { spriteAssets, setLook } = useEditorSelector(selectCanvasContext)
  const dropShadow = useDropShadow()
  const view = useCanvasView()
  // The scene tree: the index, and what draws in which order (computed once per tree, see useDrawPlan).
  const { index, segments, entities } = useDrawPlan(activeMap?.nodes)

  // Viewport, zoom, pan, and stage coordinate translation
  const {
    containerRef,
    stageRef,
    dimensions,
    isPanningRef,
    isZoomingRef,
    handleWheel,
    startPan,
    movePan,
    endPan,
    getTileCoordsFromPointer,
    centerMap,
    viewStore,
    zoomTo,
    zoomBy,
    panToWorld,
  } = useCanvasViewport({ activeMap })
  const viewportHandle = useMemo<ViewportHandle>(
    () => ({ viewStore, zoomTo, zoomBy, panToWorld, reset: centerMap }),
    [viewStore, zoomTo, zoomBy, panToWorld, centerMap]
  )

  // Tools, painting, eraser, bucket, rectangle fill, copy/sampler, placement, context menu
  const {
    canvasHover,
    canvasCopyStart,
    canvasCopyCurrent,
    rectStart,
    rectCurrent,
    isSpaceDown,
    isPanning,
    stagePointerPos,
    placementAxis,
    contextMenuState,
    closeContextMenu,
    sampleSingleTile,
    handleRightClickEntity,
    handleStageMouseDown,
    handleStageMouseMove,
  } = useCanvasInteraction({
    activeMap,
    index,
    activeTool,
    paintMode,
    activeLayerId,
    isPainting,
    setIsPainting,
    setPaintStartPos,
    setTileSelection,
    handlePaint,
    handlePaintBucket,
    handleRectangleFill,
    handleCommit,
    getTileCoordsFromPointer,
    isPanningRef,
    isZoomingRef,
    startPan,
    movePan,
    endPan,
    stageRef,
    pendingPlacement,
    commitPlacement,
    cancelPlacement,
    snapToGrid,
    selectedEntityId,
    setSelectedEntityId,
    pinSelection,
    selectedLayerIds,
    pendingImage,
    spriteAssets,
    commitImagePlacement,
    cancelImagePlacement,
    clearImageSelection,
  })

  const entityVisuals = useRef<Visuals>({ hoverId: null, dragId: null, dragX: 0, dragY: 0 })
  // The image being dragged, drawn at the mouse by the image layer itself (see KonvaImageItems).
  const imageDrag = useRef<ImageDrag | null>(null)

  const activeLayer = useMemo(() => index.byId.get(activeLayerId ?? '')?.node ?? null, [index, activeLayerId])
  // A Node is the "image layer" of the sprites inside it: while it is active they can be picked and placed.
  const activeImageLayer = activeLayer && isBranch(activeLayer) ? activeLayer : null
  const isImageLayerActive = activeImageLayer !== null
  const { brush: collisionBrush } = usePolygonEdit()
  // Entity placement and image placement both need clicks to land on the map, not on pictures.
  const placingAnything = !!pendingImage || !!pendingPlacement
  // Toolbar lock off: while no layer or an image layer is active (never a tile layer: painting wins) any image can be picked.
  const otherImageLayers = useMemo(
    () => (!view.lockImages && !placingAnything && (activeLayer === null || isImageLayerActive) ? outermostHosts(index.spriteHosts, index) : []),
    [view.lockImages, placingAnything, activeLayer, isImageLayerActive, index]
  )

  // The selected node's area gets resize handles (see KonvaEntityResize) once it has one: a StaticBody or Area holding a
  // CollisionShape. A Node without either has only its anchor.
  const resizableEntity = useMemo(() => {
    const entity = !placingAnything ? entities.find((e) => e.id === selectedEntityId) : undefined
    // Entities listed here are the shown ones (the node and every group above it are visible).
    return entity?.components.Collider ? entity : null
  }, [placingAnything, entities, selectedEntityId])
  const handleResizeEntity = useCallback(
    (entityId: string, patch: ColliderPatch) => {
      const node = index.byId.get(entityId)?.node
      const hasCollider = node?.type === 'entity' && !!entityView(node).components.Collider
      const props: PropBag = hasCollider ? { ...patch } : { ...(COMPONENT_SCHEMAS.Collider.defaultProps as PropBag), isSolid: false, ...patch }
      if (updateComponentProps) updateComponentProps(entityId, 'Collider', props)
      else for (const [key, value] of Object.entries(props)) updateComponentProp?.(entityId, 'Collider', key, value)
    },
    [index, updateComponentProps, updateComponentProp]
  )

  const handleUpdateTag = useCallback(
    (entityId: string, patch: PropBag) => {
      if (updateComponentProps) updateComponentProps(entityId, 'Tag', patch)
      else for (const [key, value] of Object.entries(patch)) updateComponentProp?.(entityId, 'Tag', key, value)
    },
    [updateComponentProp, updateComponentProps]
  )

  // The map's real size: pixels when it is not a whole number of tiles (the tile grid covers it).
  const mapPx = activeMap ? mapPixelSize(activeMap) : { width: 0, height: 0 }
  const mapWidthPx = mapPx.width
  const mapHeightPx = mapPx.height

  // The map's look: graded after the content layer draws; redrawn when the look or the view of looks changes.
  const contentLayerRef = useRef<Konva.Layer>(null)
  useMapLookPass(contentLayerRef, activeMap?.look, mapWidthPx, mapHeightPx)

  return (
    <>
      <div
        ref={containerRef}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex-1 overflow-hidden relative min-w-0 min-h-0 bg-[#1a1a1a] ${
          isPanning
            ? 'cursor-grabbing'
            : isSpaceDown
              ? 'cursor-grab'
              : pendingPlacement || pendingImage
                ? 'cursor-crosshair'
                : ''
        }`}
      >
        {activeMap ? (
          <Stage
            ref={stageRef}
            width={dimensions.width || 1}
            height={dimensions.height || 1}
            onWheel={handleWheel}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
          >
            {/* The map content: graded with the map's look (when it has one) right after it draws, see lookMapPass */}
            <KonvaLayer ref={contentLayerRef}>
              {/* Map background */}
              <Rect
                x={0}
                y={0}
                width={mapWidthPx}
                height={mapHeightPx}
                fill="#222222"
                shadowColor="black"
                shadowBlur={10}
                shadowOpacity={0.5}
                listening={false}
              />

              {/* The tree in draw order: runs of layers and runs of entities, each where it sits in the tree.
                  "Clip to map" (top toolbar) only hides what is drawn past the map's edge; handles and overlays stay. */}
              <Group
                clipX={view.clip ? 0 : undefined}
                clipY={view.clip ? 0 : undefined}
                clipWidth={view.clip ? mapWidthPx : undefined}
                clipHeight={view.clip ? mapHeightPx : undefined}
              >
                {segments.map((seg) =>
                  seg.kind === 'layers' ? (
                    <KonvaTilemapLayer
                      key={seg.key}
                      layers={seg.layers}
                      images={images}
                      activeMap={activeMap}
                      spriteAssets={spriteAssets}
                      dragRef={imageDrag}
                    />
                  ) : (
                    <KonvaEntities
                      key={seg.key}
                      part="sprites"
                      visuals={entityVisuals}
                      entities={seg.entities as unknown as EntityData[]}
                      selectedEntityId={selectedEntityId}
                      setSelectedEntityId={setSelectedEntityId || (() => {})}
                      moveEntity={moveEntity || (() => {})}
                      activeMap={activeMap}
                      snapToGrid={snapToGrid}
                      onRightClickEntity={handleRightClickEntity}
                      spriteAssets={spriteAssets}
                      view={view}
                      onOpenEvent={openEventEditor}
                    />
                  )
                )}
              </Group>
            </KonvaLayer>

            {/* Grid, handles and overlays: above the map content and never graded by the map's look */}
            <KonvaLayer>
              {/* Grid and tool previews */}
              <KonvaOverlays
                activeMap={activeMap}
                activeTool={activeTool}
                tileSelection={tileSelection}
                canvasHover={canvasHover}
                canvasCopyStart={canvasCopyStart}
                canvasCopyCurrent={canvasCopyCurrent}
                rectStart={rectStart}
                rectCurrent={rectCurrent}
                showGrid={showGrid}
                paintingEnabled={!isImageLayerActive && !(activeLayer?.type === 'collision' && collisionBrush === 'shape')}
              />

              {/* Pick / drag handles of the active image layer (above the art; the entities' own handles are above these) */}
              <KonvaImageItems
                index={index}
                layer={activeImageLayer}
                otherLayers={otherImageLayers}
                activateLayer={activateLayer}
                selectedImageId={selectedImageId}
                pickedImageIds={pickedImageIds}
                selectImage={selectImage}
                moveImages={moveImages}
                moveImage={moveImage || (() => {})}
                snapToGrid={snapToGrid}
                spriteAssets={spriteAssets}
                placing={placingAnything}
                dragRef={imageDrag}
                resizingImageId={resizingImageId}
                resizeImage={resizeImage}
              />

              {/* What the entities listen to (picking, dragging, right-click): above the picture handles, so an entity over a picture is the one you get */}
              <KonvaEntities
                part="hits"
                visuals={entityVisuals}
                entities={entities}
                selectedEntityId={selectedEntityId}
                setSelectedEntityId={setSelectedEntityId || (() => {})}
                moveEntity={moveEntity || (() => {})}
                activeMap={activeMap}
                snapToGrid={snapToGrid}
                onRightClickEntity={handleRightClickEntity}
                spriteAssets={spriteAssets}
                view={view}
                onOpenEvent={openEventEditor}
              />

              {/* The anchor of the active plain Node: drag it to move the Node (Alt: the anchor only) */}
              <KonvaNodeAnchor
                node={!placingAnything && activeLayer?.type === 'group' ? activeLayer : null}
                locked={!!activeLayer && lockedNode(index, activeLayer.id)}
                snapToGrid={snapToGrid}
                moveNode={moveEntity || (() => {})}
              />

              {/* The selected entity's area with its resize handles (above the entities' own handles, so a handle wins) */}
              <KonvaEntityResize entity={resizableEntity} snapToGrid={snapToGrid} onResize={handleResizeEntity} />

              {/* Entity areas, selection, badges and labels stay on top of every layer so they remain readable */}
              <KonvaEntities
                part="overlays"
                visuals={entityVisuals}
                entities={entities}
                selectedEntityId={selectedEntityId}
                setSelectedEntityId={setSelectedEntityId || (() => {})}
                moveEntity={moveEntity || (() => {})}
                activeMap={activeMap}
                snapToGrid={snapToGrid}
                spriteAssets={spriteAssets}
                view={view}
              />

              {/* Collision shapes of the collision layers, and their editor while one is active with the Shape brush (or an entity's polygon collider is drawn) */}
              <KonvaShapes
                index={index}
                activeLayerId={activeLayerId}
                entities={entities}
                selectedEntityId={selectedEntityId}
                mapWidth={activeMap.width}
                enabled={!!setCollisionShapes}
                placing={placingAnything}
                setShapes={setCollisionShapes}
                deleteItem={deleteCollisionItem}
                updateComponentProps={updateComponentProps}
              />

              {/* Handles of the look mask component being edited in the Look panel (brush components paint here) */}
              <KonvaMaskEditor map={activeMap} nodes={activeMap.nodes} spriteAssets={spriteAssets} viewStore={viewStore} setLook={setLook} />

              {/* The image waiting to be placed follows the mouse, snapped (or not) exactly like the placement */}
              <KonvaGhostImage
                pending={pendingImage && isImageLayerActive ? pendingImage : null}
                pointerPos={stagePointerPos}
                snapToGrid={snapToGrid}
                spriteAssets={spriteAssets}
                axis={placementAxis}
              />

              {/* Ghost entity preview during placement mode */}
              <KonvaGhostEntity
                pendingPlacement={pendingPlacement}
                pointerPos={stagePointerPos}
                snapToGrid={snapToGrid}
                spriteAssets={spriteAssets}
              />
            </KonvaLayer>
          </Stage>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground font-mono text-xs tracking-wider opacity-50">
            Select or create a map to start editing
          </div>
        )}

        {activeMap && (
          <CanvasNavigator
            viewport={viewportHandle}
            dimensions={dimensions}
            mapWidth={activeMap.width}
            mapHeight={activeMap.height}
            nodes={activeMap.nodes}
            images={images}
          />
        )}
      </div>

      <CanvasContextMenu
        menuState={contextMenuState}
        onClose={closeContextMenu}
        onCreateEntity={(name, x, y, comps) => createEntity?.(name, x, y, comps)}
        onPlaceNode={placeNode}
        onDuplicateEntity={duplicateEntity}
        onDeleteEntity={deleteEntity}
        onSetAreaColor={(id, color) => {
          const hasTag = !!entities.find((e) => e.id === id)?.components.Tag
          handleUpdateTag(id, hasTag ? { color } : { tag: 'entity', color })
        }}
        onSampleTile={sampleSingleTile}
        onPlaceMultiple={onPlaceMultiple}
        pictureShadow={(imageId) => {
          const entry = index.byId.get(imageId)
          const layer = entry && [...entry.ancestors].reverse().find(isBranch)
          if (!entry || entry.node.type !== 'picture' || !layer) return null
          return { has: hasShadow(ownLook(entry.node)), add: () => dropShadow({ kind: 'picture', layerId: layer.id, imageId }) }
        }}
        placeMultipleKeys={placeMultipleKeys}
        snapToGrid={snapToGrid}
      />
    </>
  )
}
