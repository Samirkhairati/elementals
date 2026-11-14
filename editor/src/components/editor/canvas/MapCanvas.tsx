import { usePolygonEdit } from '@/lib/polygonEditStore'
import type { SelectMode } from '@/lib/imageSelection'
import type { ImageDrag } from './konva/imageDrag'
import React, { useCallback, useMemo, useRef } from 'react'
import type Konva from 'konva'
import { useMapLookPass } from '@/lib/look/useMapLookPass'
import type { ImagePick } from '@/lib/graphicAssets'
import { Stage, Layer as KonvaLayer, Rect, Group } from 'react-konva'
import {
  Layer,
  TilesetData,
  MapData,
  TileSelection,
  ActiveTool,
  PaintMode,
  Pos,
  EntityData,
  ComponentType,
  EntityFolder,
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
import { COMPONENT_SCHEMAS } from '../../../../../shared/engine/components'
import type { ColliderPatch } from '@/lib/entityVisuals'
import { withoutFolders } from '@/lib/layerFolders'
import { KonvaGhostImage, KonvaImageItems } from './konva/KonvaImageItems'
import { KonvaShapes } from './konva/KonvaShapes'
import { KonvaMaskEditor } from './konva/KonvaMaskEditor'
import { CanvasContextMenu } from './CanvasContextMenu'
import { CanvasNavigator, type ViewportHandle } from './CanvasNavigator'
import { PendingEntityPlacement } from '@/hooks/editor/useEntityPlacement'
import { useCanvasView } from '@/hooks/editor/canvas/canvasView'
import { clampEntitiesIndex } from '@/lib/layerOrder'
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
  activeMap: MapData | null
  layers: Layer[]
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
  entities?: EntityData[]
  selectedEntityId?: string | null
  setSelectedEntityId?: (id: string | null) => void
  moveEntity?: (id: string, x: number, y: number) => void
  showGrid?: boolean
  snapToGrid?: boolean
  /** Unused: entities snap with the magnet (`snapToGrid`) like pictures. */
  snapEntityPos?: (rawX: number, rawY: number) => { x: number; y: number }
  pendingPlacement?: PendingEntityPlacement | null
  commitPlacement?: (x: number, y: number) => void
  cancelPlacement?: () => void
  createEntity?: (name: string, x?: number, y?: number, initialComponents?: Partial<Record<ComponentType, PropBag>>) => void
  duplicateEntity?: (id: string) => void
  deleteEntity?: (id: string) => void
  updateComponentProp?: (entityId: string, type: ComponentType, key: string, value: unknown) => void
  /** Batch variant: applies several props in one commit (one undo step / one save). */
  updateComponentProps?: (entityId: string, type: ComponentType, props: PropBag) => void
  showEntities?: boolean
  entityFolders?: EntityFolder[]
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
  setSelectedImageId?: (id: string | null) => void
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
  /** Replaces the layer list (the collision-shape editor); absent on a map tab that is not the active map. */
  updateLayers?: (layers: Layer[]) => void
}

export function MapCanvas({
  activeMap,
  layers,
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
  entities = [],
  selectedEntityId = null,
  setSelectedEntityId,
  moveEntity,
  showGrid = true,
  snapToGrid = true,
  pendingPlacement = null,
  commitPlacement,
  cancelPlacement,
  createEntity,
  duplicateEntity,
  deleteEntity,
  updateComponentProp,
  updateComponentProps,
  showEntities = true,
  entityFolders = [],
  pinSelection = false,
  selectedLayerIds = [],
  pendingImage = null,
  commitImagePlacement,
  resizingImageId = null,
  resizeImage,
  cancelImagePlacement,
  selectedImageId = null,
  setSelectedImageId,
  pickedImageIds,
  selectImage,
  moveImages,
  onPlaceMultiple,
  placeMultipleKeys,
  activateLayer,
  moveImage,
  updateLayers,
}: MapCanvasProps) {
  // Preload and cache tileset image textures
  const images = useTilesetImages(tilesets)
  const { spriteAssets, setLook } = useEditorSelector(selectCanvasContext)
  const dropShadow = useDropShadow()
  const view = useCanvasView()

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
    layers,
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
    clearImageSelection: () => setSelectedImageId?.(null),
  })

  // Where the Entities row sits among the layers: the layers above it draw over the entities, the ones below under them.
  const entitiesAt = clampEntitiesIndex(activeMap?.entitiesIndex, layers.length)
  // Folder rows only group layers in the list; they draw nothing.
  const layersAboveEntities = useMemo(() => withoutFolders(layers.slice(0, entitiesAt)), [layers, entitiesAt])
  const layersBelowEntities = useMemo(() => withoutFolders(layers.slice(entitiesAt)), [layers, entitiesAt])
  const entityVisuals = useRef<Visuals>({ hoverId: null, dragId: null, dragX: 0, dragY: 0 })
  // The image being dragged, drawn at the mouse by the image layer itself (see KonvaImageItems).
  const imageDrag = useRef<ImageDrag | null>(null)

  const activeLayer = useMemo(() => layers.find((l) => l.id === activeLayerId) ?? null, [layers, activeLayerId])
  const isImageLayerActive = activeLayer?.type === 'image'
  const { brush: collisionBrush } = usePolygonEdit()
  // Entity placement and image placement both need clicks to land on the map, not on pictures.
  const placingAnything = !!pendingImage || !!pendingPlacement
  // Toolbar lock off: while no layer or an image layer is active (never a tile layer: painting wins) any image can be picked.
  const otherImageLayers = useMemo(
    () => (!view.lockImages && !placingAnything && (activeLayer === null || isImageLayerActive) ? layers.filter((l) => l.type === 'image') : []),
    [view.lockImages, placingAnything, activeLayer, isImageLayerActive, layers]
  )

  // The selected entity's area gets resize handles (see KonvaEntityResize); an entity without a Collider gets one with the new box.
  // Without a Collider the game neither blocks nor touches anything beyond the entity's own tile, so the added one is not solid.
  const resizableEntity = useMemo(() => {
    const entity = showEntities && !placingAnything ? entities.find((e) => e.id === selectedEntityId) : undefined
    if (!entity || entity.visible === false) return null
    if (entity.folder && entityFolders.some((f) => f.id === entity.folder && f.visible === false)) return null
    return entity
  }, [showEntities, placingAnything, entities, selectedEntityId, entityFolders])
  const handleResizeEntity = useCallback(
    (entityId: string, patch: ColliderPatch) => {
      const hasCollider = !!entities.find((e) => e.id === entityId)?.components.Collider
      const props: PropBag = hasCollider ? { ...patch } : { ...(COMPONENT_SCHEMAS.Collider.defaultProps as PropBag), isSolid: false, ...patch }
      if (updateComponentProps) updateComponentProps(entityId, 'Collider', props)
      else for (const [key, value] of Object.entries(props)) updateComponentProp?.(entityId, 'Collider', key, value)
    },
    [entities, updateComponentProps, updateComponentProp]
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

              {/* Layers below the Entities row, the entities, then the layers above them: the layer list's order.
                  "Clip to map" (top toolbar) only hides what is drawn past the map's edge; handles and overlays stay. */}
              <Group
                clipX={view.clip ? 0 : undefined}
                clipY={view.clip ? 0 : undefined}
                clipWidth={view.clip ? mapWidthPx : undefined}
                clipHeight={view.clip ? mapHeightPx : undefined}
              >
              <KonvaTilemapLayer
                layers={layersBelowEntities}
                images={images}
                activeMap={activeMap}
                spriteAssets={spriteAssets}
                dragRef={imageDrag}
              />

              <KonvaEntities
                part="sprites"
                visuals={entityVisuals}
                entities={entities}
                selectedEntityId={selectedEntityId}
                setSelectedEntityId={setSelectedEntityId || (() => {})}
                moveEntity={moveEntity || (() => {})}
                activeMap={activeMap}
                snapToGrid={snapToGrid}
                onRightClickEntity={handleRightClickEntity}
                showEntities={showEntities}
                entityFolders={entityFolders}
                spriteAssets={spriteAssets}
                view={view}
                onOpenEvent={openEventEditor}
              />

              <KonvaTilemapLayer
                layers={layersAboveEntities}
                images={images}
                activeMap={activeMap}
                spriteAssets={spriteAssets}
                dragRef={imageDrag}
              />
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
                layer={activeLayer}
                otherLayers={otherImageLayers}
                activateLayer={activateLayer}
                selectedImageId={selectedImageId}
                setSelectedImageId={setSelectedImageId || (() => {})}
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
                showEntities={showEntities}
                entityFolders={entityFolders}
                spriteAssets={spriteAssets}
                view={view}
                onOpenEvent={openEventEditor}
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
                showEntities={showEntities}
                entityFolders={entityFolders}
                spriteAssets={spriteAssets}
                view={view}
              />

              {/* Collision shapes of the collision layers, and their editor while one is active with the Shape brush (or an entity's polygon collider is drawn) */}
              <KonvaShapes
                layers={layers}
                activeLayerId={activeLayerId}
                entities={entities}
                selectedEntityId={selectedEntityId}
                mapWidth={activeMap.width}
                enabled={!!updateLayers}
                placing={placingAnything}
                updateLayers={updateLayers}
                updateComponentProps={updateComponentProps}
              />

              {/* Handles of the look mask component being edited in the Look panel (brush components paint here) */}
              <KonvaMaskEditor map={activeMap} layers={layers} spriteAssets={spriteAssets} viewStore={viewStore} setLook={setLook} />

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
            layers={layers}
            entities={entities}
            images={images}
          />
        )}
      </div>

      <CanvasContextMenu
        menuState={contextMenuState}
        onClose={closeContextMenu}
        onCreateEntity={(name, x, y, comps) => createEntity?.(name, x, y, comps)}
        onDuplicateEntity={duplicateEntity}
        onDeleteEntity={deleteEntity}
        onSetAreaColor={(id, color) => {
          const hasTag = !!entities.find((e) => e.id === id)?.components.Tag
          handleUpdateTag(id, hasTag ? { color } : { tag: 'entity', color })
        }}
        onSampleTile={sampleSingleTile}
        onPlaceMultiple={onPlaceMultiple}
        pictureShadow={(imageId) => {
          const layer = layers.find((l) => l.images?.some((i) => i.id === imageId))
          if (!layer) return null
          return { has: hasShadow(layer.images!.find((i) => i.id === imageId)!.look), add: () => dropShadow({ kind: 'picture', layerId: layer.id, imageId }) }
        }}
        placeMultipleKeys={placeMultipleKeys}
        snapToGrid={snapToGrid}
      />
    </>
  )
}
