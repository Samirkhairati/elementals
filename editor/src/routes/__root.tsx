import { createRootRoute, Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useThemeStore } from '@/store/themeStore'
import { useEffect } from 'react'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const mode = useThemeStore(state => state.mode)
  
  useEffect(() => {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [mode])

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
        <AppSidebar />
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {/* Header area for trigger */}
          <header className="h-14 flex items-center px-4 shrink-0 absolute z-50">
            <SidebarTrigger className="opacity-70 hover:opacity-100" />
          </header>
          
          <div className="flex-1 overflow-auto p-12 max-w-[1200px] w-full mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
