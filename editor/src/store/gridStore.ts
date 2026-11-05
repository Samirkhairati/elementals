import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_GRID, normalizeGrid, type GridSpec } from '@/lib/grid'

interface GridState {
  grid: GridSpec
  setGrid: (patch: Partial<GridSpec>) => void
  resetGrid: () => void
}

// The picture grid is an editor preference (this machine), shared by every map.
export const useGridStore = create<GridState>()(
  persist(
    (set) => ({
      grid: DEFAULT_GRID,
      setGrid: (patch) => set((s) => ({ grid: normalizeGrid({ ...s.grid, ...patch }) })),
      resetGrid: () => set({ grid: DEFAULT_GRID }),
    }),
    { name: 'picture-grid' }
  )
)

/** The grid in force right now, for code that is not a component. */
export const currentGrid = (): GridSpec => useGridStore.getState().grid
