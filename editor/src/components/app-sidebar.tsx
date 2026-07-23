import { Link, useLocation } from "@tanstack/react-router"
import { Home, Map, Settings } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const mainItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Map Editor", url: "/editor", icon: Map },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar-background">
      <SidebarHeader className="h-14 border-b border-sidebar-border flex flex-row items-center justify-between px-4 shrink-0 group-data-[collapsible=icon]:justify-center">
        <span className="text-xs font-semibold tracking-wider uppercase font-mono text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          ELEMENTALS
        </span>
        <SidebarTrigger className="opacity-70 hover:opacity-100" />
      </SidebarHeader>
      <SidebarContent className="py-2">
        {/* MAIN Section */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => {
                const isActive = location.pathname === item.url
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      tooltip={item.title}
                      className={`rounded-lg px-3 py-4 transition-colors font-mono ${isActive ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/30' : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'}`}
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4 opacity-80" />
                        <span className="text-xs font-medium">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {/* SETTINGS (Bottom) */}
        <SidebarGroup className="mt-auto pt-4 pb-2">
          <SidebarGroupContent>
             <SidebarMenu>
               <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Settings" className="rounded-lg px-3 py-4 text-sidebar-foreground hover:bg-sidebar-accent/50 font-mono">
                    <Link to="/settings">
                      <Settings className="h-4 w-4 opacity-70" />
                      <span className="text-xs font-medium">Settings</span>
                    </Link>
                  </SidebarMenuButton>
               </SidebarMenuItem>
             </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
