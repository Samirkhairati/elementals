import { createRootRoute, Outlet } from '@tanstack/react-router'
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useThemeStore } from '@/store/themeStore'
import { useEffect } from 'react'

export function RootComponent() {
  const mode = useThemeStore(state => state.mode)
  const accentColor = useThemeStore(state => state.accentColor)

  useEffect(() => {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [mode])

  useEffect(() => {
    const root = document.documentElement
    if (accentColor === 'red') {
      root.style.setProperty('--primary', '0 84.2% 60.2%')
      root.style.setProperty('--primary-foreground', '0 100% 97%')
    } else if (accentColor === 'green') {
      root.style.setProperty('--primary', '142 71% 45%')
      root.style.setProperty('--primary-foreground', '142 100% 97%')
    } else if (accentColor === 'orange') {
      root.style.setProperty('--primary', '24.6 95% 53.1%')
      root.style.setProperty('--primary-foreground', '24.6 100% 97%')
    } else {
      root.style.setProperty('--primary', '250 65% 60%')
      root.style.setProperty('--primary-foreground', '250 100% 96%')
    }
  }, [accentColor])

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background text-foreground font-sans">
        <AppSidebar />
        <main className="flex-1 flex flex-col relative overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col relative">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export const rootRoute = createRootRoute({ component: RootComponent })
