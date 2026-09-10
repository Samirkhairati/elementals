import React from "react"
import { Layout, Eye, RotateCcw, ChevronDown } from "lucide-react"
import { useEditorContext } from "./EditorContext"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"

export function ViewMenu() {
  const ctx = useEditorContext()
  const openPanels: string[] = ctx.openPanels || []

  const isPanelOpen = (id: string) => openPanels.includes(id)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium rounded text-foreground/80 hover:text-foreground hover:bg-muted/70 transition-colors outline-none focus:bg-muted/80"
          title="View & Appearance Settings"
        >
          <span>View</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 font-mono text-xs shadow-xl">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            <Eye className="w-3.5 h-3.5 mr-2 opacity-70" />
            <span>Appearance</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56 font-mono text-xs shadow-xl">
            {/* View > Appearance > Select Tabs */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer font-medium">
                <Layout className="w-3.5 h-3.5 mr-2 opacity-70" />
                <span>Select Tabs</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 font-mono text-xs shadow-xl">
                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Left Sidebar
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={isPanelOpen("maps")}
                  onCheckedChange={() => ctx.togglePanel?.("maps")}
                  className="cursor-pointer"
                >
                  Maps
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={isPanelOpen("layers")}
                  onCheckedChange={() => ctx.togglePanel?.("layers")}
                  className="cursor-pointer"
                >
                  Layers
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={isPanelOpen("properties")}
                  onCheckedChange={() => ctx.togglePanel?.("properties")}
                  className="cursor-pointer"
                >
                  Properties
                </DropdownMenuCheckboxItem>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Right Sidebar
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={isPanelOpen("tilesets")}
                  onCheckedChange={() => ctx.togglePanel?.("tilesets")}
                  className="cursor-pointer"
                >
                  Tileset Browser
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={isPanelOpen("preview")}
                  onCheckedChange={() => ctx.togglePanel?.("preview")}
                  className="cursor-pointer"
                >
                  Tileset Preview
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={isPanelOpen("activeSelection")}
                  onCheckedChange={() => ctx.togglePanel?.("activeSelection")}
                  className="cursor-pointer"
                >
                  Active Selection
                </DropdownMenuCheckboxItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => ctx.resetLayout?.()}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-2 opacity-70" />
                  Reset Layout
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* Quick access toggles under Appearance directly */}
            <DropdownMenuCheckboxItem
              checked={isPanelOpen("maps")}
              onCheckedChange={() => ctx.togglePanel?.("maps")}
              className="cursor-pointer"
            >
              Maps Panel
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={isPanelOpen("layers")}
              onCheckedChange={() => ctx.togglePanel?.("layers")}
              className="cursor-pointer"
            >
              Layers Panel
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={isPanelOpen("properties")}
              onCheckedChange={() => ctx.togglePanel?.("properties")}
              className="cursor-pointer"
            >
              Properties Panel
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            <DropdownMenuCheckboxItem
              checked={isPanelOpen("tilesets")}
              onCheckedChange={() => ctx.togglePanel?.("tilesets")}
              className="cursor-pointer"
            >
              Tileset Browser
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={isPanelOpen("preview")}
              onCheckedChange={() => ctx.togglePanel?.("preview")}
              className="cursor-pointer"
            >
              Tileset Preview
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={isPanelOpen("activeSelection")}
              onCheckedChange={() => ctx.togglePanel?.("activeSelection")}
              className="cursor-pointer"
            >
              Active Selection
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => ctx.resetLayout?.()}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-2 opacity-70" />
              Reset to Default Layout
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
