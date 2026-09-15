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

    let newWidth = Math.max(8, Math.round(targetNode.width() * scaleX))
    let newHeight = Math.max(8, Math.round(targetNode.height() * scaleY))

    if (snapToGrid) {
      newWidth = Math.max(8, Math.round(newWidth / 8) * 8)
      newHeight = Math.max(8, Math.round(newHeight / 8) * 8)
    }

    targetNode.width(newWidth)
    targetNode.height(newHeight)

    // Calculate new offsets relative to entity position (baseEntityX, baseEntityY)
    // Box left is at: baseEntityX + offsetX - width / 2
    // Box top is at: baseEntityY + offsetY - height
    const currentBoxX = targetNode.x()
    const currentBoxY = targetNode.y()

    let newOffsetX = Math.round(currentBoxX + newWidth / 2 - baseEntityX)
    let newOffsetY = Math.round(currentBoxY + newHeight - baseEntityY)

    if (snapToGrid) {
      newOffsetX = Math.round(newOffsetX / 8) * 8
      newOffsetY = Math.round(newOffsetY / 8) * 8
    }

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
      borderStroke="#3b82f6"
      borderStrokeWidth={1.5}
      borderDash={[4, 4]}
      anchorFill="#ffffff"
      anchorStroke="#3b82f6"
      anchorStrokeWidth={1.5}
      anchorSize={8}
      anchorCornerRadius={2}
      boundBoxFunc={(oldBox, newBox) => {
        if (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8) {
          return oldBox
        }
        return newBox
      }}
      onTransformEnd={handleTransformEnd}
    />
  )
}
