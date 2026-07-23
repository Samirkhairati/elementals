import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  accentColor: string
  setMode: (mode: ThemeMode) => void
  setAccentColor: (color: string) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark', // default to dark
      accentColor: 'blue', // default accent
      setMode: (mode) => {
        set({ mode })
        // Apply to document class for Tailwind dark mode
        if (mode === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },
      setAccentColor: (accentColor) => {
        set({ accentColor })
        // We will map these logical colors to CSS variables later
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.mode === 'dark') {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }
        }
      },
    }
  )
)
