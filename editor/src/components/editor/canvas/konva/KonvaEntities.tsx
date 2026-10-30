import React, { useRef, useState } from 'react'
import { Group, Rect, Text, Shape } from 'react-konva'
import Konva from 'konva'
import { EntityData, MapData, EntityFolder } from '@/types/editor'
import { KonvaColliderTransformer } from './KonvaColliderTransformer'

interface KonvaEntitiesProps {
  entities: EntityData[]
  selectedEntityId: string | null
  setSelectedEntityId: (id: string | null) => void
  moveEntity: (id: string, x: number, y: number) => void
  activeMap: MapData
  images: Record<string, HTMLImageElement>
  snapToGrid?: boolean
  snapEntityPos?: (x: number, y: number) => { x: number; y: number }
  resizingColliderEntityId?: string | null
  setResizingColliderEntityId?: (id: string | null) => void
  onUpdateCollider?: (entityId: string, width: number, height: number, offsetX: number, offsetY: number) => void
  onContextMenuEntity?: (entity: EntityData, clientX: number, clientY: number) => void
  onRightClickEntity?: (entity: EntityData, clientX: number, clientY: number) => void
  showEntities?: boolean
  entityFolders?: EntityFolder[]
}

interface KonvaEntityNodeProps {
  entity: EntityData
  isSelected: boolean
  isResizingCollider: boolean
  mapWidthPx: number
  mapHeightPx: number
  setSelectedEntityId: (id: string | null) => void
  moveEntity: (id: string, x: number, y: number) => void
  images: Record<string, HTMLImageElement>
  snapToGrid: boolean
  snapEntityPos: (x: number, y: number) => { x: number; y: number }
  onUpdateCollider?: (entityId: string, width: number, height: number, offsetX: number, offsetY: number) => void
  onContextMenuEntity?: (entity: EntityData, clientX: number, clientY: number) => void
  onRightClickEntity?: (entity: EntityData, clientX: number, clientY: number) => void
}

const KonvaEntityNode = React.memo(function KonvaEntityNode({
  entity,
  isSelected,
  isResizingCollider,
  mapWidthPx,
  mapHeightPx,
  setSelectedEntityId,
  moveEntity,
  images,
  snapToGrid,
  snapEntityPos,
  onUpdateCollider,
  onContextMenuEntity: _onContextMenuEntity,
  onRightClickEntity,
}: KonvaEntityNodeProps) {
  const collider = entity.components.Collider
  const interactable = entity.components.Interactable
  const spriteView = entity.components.SpriteView
  const [colliderNode, setColliderNode] = useState<Konva.Rect | null>(null)

  const colliderW = collider?.width || 32
  const colliderH = collider?.height || 32
  const colliderOffX = collider?.offsetX || 0
  const colliderOffY = collider?.offsetY || 0

  return (
    <Group>
      {/* Collider Hitbox Overlay (when selected or resizing) */}
      {(isSelected || isResizingCollider) && collider && (
        <>
          <Rect
            ref={setColliderNode}
            x={entity.x + colliderOffX - colliderW / 2}
            y={entity.y + colliderOffY - colliderH}
            width={colliderW}
            height={colliderH}
            fill="rgba(239, 68, 68, 0.2)"
            stroke={isResizingCollider ? '#ef4444' : 'rgba(239, 68, 68, 0.8)'}
            strokeWidth={isResizingCollider ? 1.5 : 1}
            dash={isResizingCollider ? undefined : [3, 3]}
            listening={isResizingCollider}
          />

          {isResizingCollider && (
            <KonvaColliderTransformer
              targetNode={colliderNode}
              snapToGrid={snapToGrid}
              baseEntityX={entity.x}
              baseEntityY={entity.y}
              onTransformEnd={(w, h, ox, oy) => {
                onUpdateCollider?.(entity.id, w, h, ox, oy)
              }}
            />
          )}
        </>
      )}

      {/* Interactable Trigger Overlay (when selected) */}
      {isSelected && !isResizingCollider && interactable && (
        <Rect
          x={entity.x - 16}
          y={entity.y - 32}
          width={32}
          height={32}
          fill="rgba(34, 211, 238, 0.15)"
          stroke="rgba(34, 211, 238, 0.7)"
          strokeWidth={1}
          dash={[3, 3]}
          listening={false}
        />
      )}

      {/* Draggable Entity Marker */}
      <Group
        x={entity.x}
        y={entity.y}
        draggable={!isResizingCollider}
        onDragStart={e => {
          e.cancelBubble = true
          setSelectedEntityId(entity.id)
        }}
        onDragMove={e => {
          e.cancelBubble = true
          const boundedX = Math.max(0, Math.min(mapWidthPx, e.target.x()))
          const boundedY = Math.max(0, Math.min(mapHeightPx, e.target.y()))
          if (snapToGrid) {
            const snapped = snapEntityPos(boundedX, boundedY)
            e.target.x(snapped.x)
            e.target.y(snapped.y)
          } else {
            e.target.x(boundedX)
            e.target.y(boundedY)
          }
        }}
        onDragEnd={e => {
          e.cancelBubble = true
          let finalX = Math.max(0, Math.min(mapWidthPx, e.target.x()))
          let finalY = Math.max(0, Math.min(mapHeightPx, e.target.y()))
          if (snapToGrid) {
            const snapped = snapEntityPos(finalX, finalY)
            finalX = snapped.x
            finalY = snapped.y
            e.target.x(finalX)
            e.target.y(finalY)
          }
          moveEntity(entity.id, finalX, finalY)
        }}
        onClick={e => {
          e.cancelBubble = true
          setSelectedEntityId(entity.id)
        }}
        onTap={e => {
          e.cancelBubble = true
          setSelectedEntityId(entity.id)
        }}
        onMouseDown={e => {
          if (e.evt.button === 0) {
            e.cancelBubble = true
            setSelectedEntityId(entity.id)
          } else if (e.evt.button === 2) {
            e.cancelBubble = true
            e.evt.preventDefault()
            setSelectedEntityId(entity.id)
            onRightClickEntity?.(entity, e.evt.clientX, e.evt.clientY)
          }
        }}
        onContextMenu={e => {
          e.evt.preventDefault()
          e.cancelBubble = true
        }}
      >
        {/* Entity Name Tooltip / Label */}
        <Group y={-46}>
          <Rect
            x={-Math.max(20, entity.name.length * 3.5 + 8)}
            y={-2}
            width={Math.max(40, entity.name.length * 7 + 16)}
            height={15}
            fill="rgba(0, 0, 0, 0.85)"
            stroke={isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.25)'}
            strokeWidth={1}
            cornerRadius={2}
            listening={false}
          />
          <Text
            text={entity.name}
            x={-Math.max(20, entity.name.length * 3.5 + 8)}
            y={0}
            width={Math.max(40, entity.name.length * 7 + 16)}
            align="center"
            fontSize={10}
            fontFamily="monospace"
            fill={isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.85)'}
            listening={false}
          />
        </Group>

        {/* Entity Box or Sprite: Centered 32x32 tile box */}
        {spriteView && spriteView.tilesetId && images[spriteView.tilesetId] ? (
          <Shape
            x={-16}
            y={-32}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            sceneFunc={(context) => {
              const ctx = context._context as CanvasRenderingContext2D
              const img = images[spriteView.tilesetId]
              if (img && img.complete) {
                ctx.imageSmoothingEnabled = false
                ctx.drawImage(
                  img,
                  (spriteView.tileX || 0) * 32,
                  (spriteView.tileY || 0) * 32,
                  32,
                  32,
                  0,
                  0,
                  32,
                  32
                )
              }
            }}
          />
        ) : (
          <Rect
            x={-16}
            y={-32}
            width={32}
            height={32}
            fill={isSelected ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.12)'}
            stroke={isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.4)'}
            strokeWidth={isSelected ? 1.5 : 1}
            cornerRadius={3}
            shadowColor={isSelected ? '#ffffff' : 'black'}
            shadowBlur={isSelected ? 6 : 2}
            shadowOpacity={isSelected ? 0.4 : 0.2}
          />
        )}
      </Group>
    </Group>
  )
})

export const KonvaEntities = React.memo(function KonvaEntities({
  entities,
  selectedEntityId,
  setSelectedEntityId,
  moveEntity,
  activeMap,
  images,
  snapToGrid = true,
  snapEntityPos = (x, y) => ({ x: Math.floor(x / 32) * 32 + 16, y: Math.floor((y - 16) / 32 + 1) * 32 }),
  resizingColliderEntityId = null,
  onUpdateCollider,
  onContextMenuEntity,
  onRightClickEntity,
  showEntities = true,
  entityFolders = [],
}: KonvaEntitiesProps) {
  if (showEntities === false) return null

  const mapWidthPx = activeMap.width * 32
  const mapHeightPx = activeMap.height * 32

  // Collect hidden folder IDs
  const hiddenFolderIds = new Set(
    (entityFolders || []).filter(f => f.visible === false).map(f => f.id)
  )

  // Filter out invisible entities
  const visibleEntities = entities.filter(entity => {
    if (entity.visible === false) return false
    if (entity.folder && hiddenFolderIds.has(entity.folder)) return false
    return true
  })

  return (
    <Group>
      {visibleEntities.map(entity => (
        <KonvaEntityNode
          key={entity.id}
          entity={entity}
          isSelected={selectedEntityId === entity.id}
          isResizingCollider={resizingColliderEntityId === entity.id}
          mapWidthPx={mapWidthPx}
          mapHeightPx={mapHeightPx}
          setSelectedEntityId={setSelectedEntityId}
          moveEntity={moveEntity}
          images={images}
          snapToGrid={snapToGrid}
          snapEntityPos={snapEntityPos}
          onUpdateCollider={onUpdateCollider}
          onContextMenuEntity={onContextMenuEntity}
          onRightClickEntity={onRightClickEntity}
        />
      ))}
    </Group>
  )
})

