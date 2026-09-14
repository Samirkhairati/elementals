import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  User,
  DoorOpen,
  MessageSquare,
  Package,
  Box,
} from 'lucide-react'
import { EntityData, MapData, TilesetData } from '@/types/editor'

interface CanvasEntitiesProps {
  entities: EntityData[]
  selectedEntityId: string | null
  setSelectedEntityId: (id: string | null) => void
  moveEntity: (id: string, x: number, y: number) => void
  activeMap: MapData
  tilesets: TilesetData[]
}

function getEntityDisplayIcon(entity: EntityData) {
  const comps = entity.components
  if (comps.Tag?.tag === 'warp' || comps.Interactable?.targetMap) {
    return <DoorOpen className="w-3.5 h-3.5 text-cyan-300" />
  }
  if (comps.CharacterAnimation || comps.Tag?.tag === 'npc' || comps.AIWander) {
    return <User className="w-3.5 h-3.5 text-emerald-300" />
  }
  if (comps.Tag?.tag === 'sign') {
    return <MessageSquare className="w-3.5 h-3.5 text-blue-300" />
  }
  if (comps.Tag?.tag === 'chest') {
    return <Package className="w-3.5 h-3.5 text-amber-300" />
  }
  return <Box className="w-3.5 h-3.5 text-purple-300" />
}

export const CanvasEntities = React.memo(function CanvasEntities({
  entities,
  selectedEntityId,
  setSelectedEntityId,
  moveEntity,
  activeMap,
  tilesets,
}: CanvasEntitiesProps) {
  const [draggingEntityId, setDraggingEntityId] = useState<string | null>(null)
  const dragStartRef = useRef<{
    entityId: string
    startX: number
    startY: number
    initEntityX: number
    initEntityY: number
  } | null>(null)

  const handlePointerDown = (e: React.PointerEvent, entity: EntityData) => {
    e.stopPropagation()
    setSelectedEntityId(entity.id)
    setDraggingEntityId(entity.id)

    dragStartRef.current = {
      entityId: entity.id,
      startX: e.clientX,
      startY: e.clientY,
      initEntityX: entity.x,
      initEntityY: entity.y,
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragStartRef.current) return
      const dx = moveEvent.clientX - dragStartRef.current.startX
      const dy = moveEvent.clientY - dragStartRef.current.startY

      let rawX = dragStartRef.current.initEntityX + dx
      let rawY = dragStartRef.current.initEntityY + dy

      // Snap to 16px/32px grid unless Shift is held
      if (!moveEvent.shiftKey) {
        rawX = Math.round(rawX / 32) * 32
        rawY = Math.round(rawY / 32) * 32
      }

      // Bound to map dimensions
      const maxX = activeMap.width * 32
      const maxY = activeMap.height * 32
      const boundedX = Math.max(0, Math.min(maxX, rawX))
      const boundedY = Math.max(0, Math.min(maxY, rawY))

      moveEntity(dragStartRef.current.entityId, boundedX, boundedY)
    }

    const handlePointerUp = () => {
      setDraggingEntityId(null)
      dragStartRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {entities.map(entity => {
        const isSelected = selectedEntityId === entity.id
        const isDragging = draggingEntityId === entity.id
        const collider = entity.components.Collider
        const interactable = entity.components.Interactable

        return (
          <React.Fragment key={entity.id}>
            {/* Collider Hitbox Overlay (when selected) */}
            {isSelected && collider && (
              <div
                className="absolute border border-dashed border-red-400/80 bg-red-400/10 pointer-events-none z-10"
                style={{
                  left: entity.x + (collider.offsetX || 0) - (collider.width || 16) / 2,
                  top: entity.y + (collider.offsetY || 0) - (collider.height || 8),
                  width: collider.width || 16,
                  height: collider.height || 8,
                }}
              />
            )}

            {/* Interactable Trigger Overlay (when selected) */}
            {isSelected && interactable && (
              <div
                className="absolute border border-dashed border-cyan-400/60 bg-cyan-400/10 pointer-events-none z-10"
                style={{
                  left: entity.x - 16,
                  top: entity.y - 32,
                  width: 32,
                  height: 32,
                }}
              />
            )}

            {/* Entity Marker on Canvas */}
            <div
              onPointerDown={e => handlePointerDown(e, entity)}
              className={`absolute pointer-events-auto cursor-move select-none -translate-x-1/2 -translate-y-full transition-none ${
                isDragging ? 'opacity-80 scale-105 z-30' : 'z-20'
              }`}
              style={{
                left: entity.x,
                top: entity.y,
              }}
            >
              {/* Entity Name Tooltip / Tag */}
              <div
                className={`absolute left-1/2 -translate-x-1/2 -top-5 px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap shadow-sm pointer-events-none ${
                  isSelected
                    ? 'bg-primary text-primary-foreground font-semibold shadow-primary/30 ring-1 ring-white/30'
                    : 'bg-black/70 text-white/90 backdrop-blur-sm border border-white/10'
                }`}
              >
                {entity.name}
              </div>

              {/* Entity Icon Badge */}
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shadow-md border ${
                  isSelected
                    ? 'bg-primary/40 border-primary ring-2 ring-primary/60 shadow-primary/40'
                    : 'bg-black/60 border-white/20 hover:border-primary/60 hover:bg-black/80'
                }`}
              >
                {getEntityDisplayIcon(entity)}
              </div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
})
