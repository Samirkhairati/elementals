import React from 'react'
import { Group, Rect, Text } from 'react-konva'
import { PendingEntityPlacement } from '@/hooks/editor/useEntityPlacement'

interface KonvaGhostEntityProps {
  pendingPlacement: PendingEntityPlacement | null
  pointerPos: { x: number; y: number } | null
  snapToGrid: boolean
  snapEntityPos: (x: number, y: number) => { x: number; y: number }
}

export const KonvaGhostEntity = React.memo(function KonvaGhostEntity({
  pendingPlacement,
  pointerPos,
  snapToGrid,
  snapEntityPos,
}: KonvaGhostEntityProps) {
  if (!pendingPlacement || !pointerPos) return null

  const targetPos = snapToGrid
    ? snapEntityPos(pointerPos.x, pointerPos.y)
    : { x: Math.round(pointerPos.x), y: Math.round(pointerPos.y) }

  const collider = pendingPlacement.components?.Collider
  const colliderW = collider?.width || 16
  const colliderH = collider?.height || 8
  const colliderOffX = collider?.offsetX || 0
  const colliderOffY = collider?.offsetY || 0

  const nameText = `${pendingPlacement.name} (Click to place)`
  const labelWidth = Math.max(50, nameText.length * 6.5 + 14)

  return (
    <Group x={targetPos.x} y={targetPos.y} listening={false}>
      {/* Ghost Collider Box */}
      <Rect
        x={colliderOffX - colliderW / 2}
        y={colliderOffY - colliderH}
        width={colliderW}
        height={colliderH}
        fill="rgba(59, 130, 246, 0.15)"
        stroke="#60a5fa"
        strokeWidth={1}
        dash={[3, 3]}
        listening={false}
      />

      {/* Ghost Entity Name Badge */}
      <Group y={-46}>
        <Rect
          x={-labelWidth / 2}
          y={-2}
          width={labelWidth}
          height={16}
          fill="rgba(0, 0, 0, 0.85)"
          stroke="#60a5fa"
          strokeWidth={1}
          cornerRadius={2}
          dash={[3, 3]}
          listening={false}
        />
        <Text
          text={nameText}
          x={-labelWidth / 2}
          y={1}
          width={labelWidth}
          align="center"
          fontSize={10}
          fontFamily="monospace"
          fill="#93c5fd"
          listening={false}
        />
      </Group>

      {/* Ghost Square Badge */}
      <Group x={-14} y={-28}>
        <Rect
          width={28}
          height={28}
          fill="rgba(59, 130, 246, 0.35)"
          stroke="#3b82f6"
          strokeWidth={1.5}
          cornerRadius={2}
          dash={[4, 4]}
          listening={false}
        />
        <Text
          text={pendingPlacement.name.slice(0, 2).toUpperCase()}
          x={0}
          y={7}
          width={28}
          align="center"
          fontSize={11}
          fontStyle="bold"
          fontFamily="monospace"
          fill="#ffffff"
          listening={false}
        />
      </Group>
    </Group>
  )
})
