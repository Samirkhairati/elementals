import { useState, useCallback } from 'react'

export interface GridSettings {
  showGrid: boolean
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>
  snapToGrid: boolean
  setSnapToGrid: React.Dispatch<React.SetStateAction<boolean>>
  toggleShowGrid: () => void
  toggleSnapToGrid: () => void
  snapEntityPos: (rawX: number, rawY: number) => { x: number; y: number }
  snapCoord: (val: number, step?: number) => number
  snapDimension: (dim: number, step?: number) => number
}

export function useGridSettings(): GridSettings {
  const [showGrid, setShowGrid] = useState<boolean>(true)
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true)

  const toggleShowGrid = useCallback(() => {
    setShowGrid(prev => !prev)
  }, [])

  const toggleSnapToGrid = useCallback(() => {
    setSnapToGrid(prev => !prev)
  }, [])

  /**
   * Snaps entity coordinates to tile bottom-center:
   * x = tileX * 32 + 16
   * y = tileY * 32 + 32
   */
  const snapEntityPos = useCallback((rawX: number, rawY: number) => {
    const tileX = Math.floor(rawX / 32)
    // Offset by -16 so tile bounds center vertically around the bottom edge
    const tileY = Math.floor((rawY - 16) / 32)
    return {
      x: tileX * 32 + 16,
      y: (tileY + 1) * 32,
    }
  }, [])

  const snapCoord = useCallback((val: number, step: number = 32) => {
    return Math.round(val / step) * step
  }, [])

  const snapDimension = useCallback((dim: number, step: number = 8) => {
    return Math.max(step, Math.round(dim / step) * step)
  }, [])

  return {
    showGrid,
    setShowGrid,
    snapToGrid,
    setSnapToGrid,
    toggleShowGrid,
    toggleSnapToGrid,
    snapEntityPos,
    snapCoord,
    snapDimension,
  }
}
