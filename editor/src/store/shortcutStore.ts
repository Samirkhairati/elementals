import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolveBindings, type Bindings, type Overrides } from '@/lib/shortcuts'

interface ShortcutState {
  /** Only what the author changed; everything else follows the defaults in lib/shortcuts. */
  overrides: Overrides
  setBindings: (id: string, keys: string[]) => void
  reset: (id: string) => void
  resetAll: () => void
}

// Editor preferences (this machine), not part of the project.
export const useShortcutStore = create<ShortcutState>()(
  persist(
    set => ({
      overrides: {},
      setBindings: (id, keys) => set(s => ({ overrides: { ...s.overrides, [id]: keys } })),
      reset: id =>
        set(s => {
          const { [id]: _removed, ...rest } = s.overrides
          return { overrides: rest }
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    { name: 'shortcut-bindings' }
  )
)

/** The bindings in force (defaults + overrides). Re-renders when the author rebinds something. */
export function useBindings(): Bindings {
  const overrides = useShortcutStore(s => s.overrides)
  return resolveBindings(overrides)
}
