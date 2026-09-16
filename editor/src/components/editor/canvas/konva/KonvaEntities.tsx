import React, { useRef, useState } from 'react'
import { Group, Rect, Text, Shape } from 'react-konva'
import Konva from 'konva'
import { EntityData, MapData } from '@/types/editor'
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

function getEntityColor(entity: EntityData): { bg: string; border: string; text: string } {
  const comps = entity.components
  if (comps.Tag?.tag === 'warp' || comps.Interactable?.targetMap) {
    return { bg: 'rgba(6, 182, 212, 0.45)', border: '#22d3ee', text: '#cffafe' }
  }
  if (comps.CharacterAnimation || comps.Tag?.tag === 'npc' || comps.AIWander) {
    return { bg: 'rgba(16, 185, 129, 0.45)', border: '#34d399', text: '#d1fae5' }
  }
  if (comps.Tag?.tag === 'sign') {
    return { bg: 'rgba(59, 130, 246, 0.45)', border: '#60a5fa', text: '#dbeafe' }
  }
  if (comps.Tag?.tag === 'chest') {
    return { bg: 'rgba(245, 158, 11, 0.45)', border: '#fbbf24', text: '#fef3c7' }
  }
  return { bg: 'rgba(168, 85, 247, 0.45)', border: '#c084fc', text: '#f3e8ff' }
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
  onContextMenuEntity,
  onRightClickEntity,
}: KonvaEntityNodeProps) {
  const collider = entity.components.Collider
  const interactable = entity.components.Interactable
  const spriteView = entity.components.SpriteView
  const colors = getEntityColor(entity)
  const colliderShapeRef = useRef<Konva.Rect | null>(null)

  const colliderW = collider?.width || 16
  const colliderH = collider?.height || 8
  const colliderOffX = collider?.offsetX || 0
  const colliderOffY = collider?.offsetY || 0

  return (
    <Group>
      {/* Collider Hitbox Overlay (when selected or resizing) */}
      {(isSelected || isResizingCollider) && collider && (
        <>
          <Rect
            ref={colliderShapeRef}
            x={entity.x + colliderOffX - colliderW / 2}
            y={entity.y + colliderOffY - colliderH}
            width={colliderW}
            height={colliderH}
            fill="rgba(248, 113, 113, 0.2)"
            stroke={isResizingCollider ? '#ef4444' : 'rgba(248, 113, 113, 0.8)'}
            strokeWidth={isResizingCollider ? 1.5 : 1}
            dash={isResizingCollider ? undefined : [3, 3]}
            listening={isResizingCollider}
          />

          {isResizingCollider && (
            <KonvaColliderTransformer
              targetNode={colliderShapeRef.current}
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
            stroke={isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.2)'}
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
            fill={isSelected ? '#60a5fa' : '#ffffff'}
            listening={false}
          />
        </Group>

        {/* Entity Icon Badge / Sprite */}
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
          <Group x={-14} y={-28}>
            <Rect
              width={28}
              height={28}
              fill={isSelected ? 'rgba(59, 130, 246, 0.6)' : colors.bg}
              stroke={isSelected ? '#60a5fa' : colors.border}
              strokeWidth={isSelected ? 2 : 1.5}
              cornerRadius={2}
              shadowColor="black"
              shadowBlur={3}
              shadowOpacity={0.3}
            />
            <Text
              text={entity.name.slice(0, 2).toUpperCase()}
              x={0}
              y={7}
              width={28}
              align="center"
              fontSize={11}
              fontStyle="bold"
              fontFamily="monospace"
              fill={colors.text}
              listening={false}
            />
          </Group>
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
}: KonvaEntitiesProps) {
  const mapWidthPx = activeMap.width * 32
  const mapHeightPx = activeMap.height * 32

  return (
    <Group>
      {entities.map(entity => (
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
