import React, { useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import Konva from 'konva'

interface KonvaColliderTransformerProps {
  targetNode: Konva.Node | null
  snapToGrid: boolean
  onTransformEnd: (newWidth: number, newHeight: number, newOffsetX: number, newOffsetY: number) => void
  baseEntityX: number
  baseEntityY: number
}

const GRID_SIZE = 32

export function KonvaColliderTransformer({
  targetNode,
  snapToGrid,
  onTransformEnd,
  baseEntityX,
  baseEntityY,
}: KonvaColliderTransformerProps) {
  const trRef = useRef<Konva.Transformer | null>(null)

  useEffect(() => {
    if (!trRef.current) return
    if (targetNode) {
      trRef.current.nodes([targetNode])
      trRef.current.getLayer()?.batchDraw()
    } else {
      trRef.current.nodes([])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [targetNode])

  const handleTransformEnd = () => {
    if (!targetNode) return

    const scaleX = targetNode.scaleX()
    const scaleY = targetNode.scaleY()

    // Reset scales to 1 so dimensions are stored in width/height
    targetNode.scaleX(1)
    targetNode.scaleY(1)

    const rawWidth = targetNode.width() * scaleX
    const rawHeight = targetNode.height() * scaleY
    const currentBoxX = targetNode.x()
    const currentBoxY = targetNode.y()

    let newWidth: number
    let newHeight: number
    let newBoxX: number
    let newBoxY: number

    if (snapToGrid) {
      const left = Math.round(currentBoxX / GRID_SIZE) * GRID_SIZE
      const top = Math.round(currentBoxY / GRID_SIZE) * GRID_SIZE
      const right = Math.round((currentBoxX + rawWidth) / GRID_SIZE) * GRID_SIZE
      const bottom = Math.round((currentBoxY + rawHeight) / GRID_SIZE) * GRID_SIZE

      newWidth = Math.max(GRID_SIZE, right - left)
      newHeight = Math.max(GRID_SIZE, bottom - top)
      newBoxX = left
      newBoxY = top
    } else {
      newWidth = Math.max(4, Math.round(rawWidth))
      newHeight = Math.max(4, Math.round(rawHeight))
      newBoxX = currentBoxX
      newBoxY = currentBoxY
    }

    targetNode.width(newWidth)
    targetNode.height(newHeight)
    targetNode.x(newBoxX)
    targetNode.y(newBoxY)

    // Calculate new offsets relative to entity position (baseEntityX, baseEntityY)
    // Box left is at: baseEntityX + offsetX - width / 2
    // Box top is at: baseEntityY + offsetY - height
    const newOffsetX = Math.round(newBoxX + newWidth / 2 - baseEntityX)
    const newOffsetY = Math.round(newBoxY + newHeight - baseEntityY)

    onTransformEnd(newWidth, newHeight, newOffsetX, newOffsetY)
    targetNode.getLayer()?.batchDraw()
  }

  if (!targetNode) return null

  return (
    <Transformer
      ref={trRef}
      enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
      rotateEnabled={false}
      keepRatio={false}
      ignoreStroke={true}
      borderStroke="#ef4444"
      borderStrokeWidth={1.5}
      borderDash={[4, 4]}
      anchorFill="#ffffff"
      anchorStroke="#ef4444"
      anchorStrokeWidth={1.5}
      anchorSize={8}
      anchorCornerRadius={2}
      boundBoxFunc={(oldBox, newBox) => {
        if (!snapToGrid) {
          if (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4) {
            return oldBox
          }
          return newBox
        }

        // Snap all 4 edges to the 32px grid
        const left = Math.round(newBox.x / GRID_SIZE) * GRID_SIZE
        const top = Math.round(newBox.y / GRID_SIZE) * GRID_SIZE
        const right = Math.round((newBox.x + newBox.width) / GRID_SIZE) * GRID_SIZE
        const bottom = Math.round((newBox.y + newBox.height) / GRID_SIZE) * GRID_SIZE

        const width = Math.max(GRID_SIZE, right - left)
        const height = Math.max(GRID_SIZE, bottom - top)

        // Determine which edges moved
        const leftMoved = Math.abs(newBox.x - oldBox.x) > 0.01
        const topMoved = Math.abs(newBox.y - oldBox.y) > 0.01

        const x = leftMoved ? right - width : left
        const y = topMoved ? bottom - height : top

        return {
          ...newBox,
          x,
          y,
          width,
          height,
        }
      }}
      onTransformEnd={handleTransformEnd}
    />
  )
}
