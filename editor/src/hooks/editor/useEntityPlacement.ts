import { useState, useCallback, useEffect } from 'react'
import { ComponentType } from '@/types/editor'

export interface PendingEntityPlacement {
  name: string
  components?: Partial<Record<ComponentType, Record<string, any>>>
}

export interface EntityPlacementManager {
  pendingPlacement: PendingEntityPlacement | null
  startPlacement: (template: PendingEntityPlacement) => void
  cancelPlacement: () => void
}

export function useEntityPlacement(): EntityPlacementManager {
  const [pendingPlacement, setPendingPlacement] = useState<PendingEntityPlacement | null>(null)

  const startPlacement = useCallback((template: PendingEntityPlacement) => {
    setPendingPlacement(template)
  }, [])

  const cancelPlacement = useCallback(() => {
    setPendingPlacement(null)
  }, [])

  // Cancel placement on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pendingPlacement) {
        cancelPlacement()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingPlacement, cancelPlacement])

  return {
    pendingPlacement,
    startPlacement,
    cancelPlacement,
  }
}
