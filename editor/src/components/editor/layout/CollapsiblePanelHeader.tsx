import React from 'react'
import { ChevronRight, ChevronDown } from "lucide-react"

interface CollapsiblePanelHeaderProps {
  collapsed: boolean
  onToggle: () => void
  icon: React.ReactNode
  title: string
  actions?: React.ReactNode
}

export function CollapsiblePanelHeader({
  collapsed,
  onToggle,
  icon,
  title,
  actions
}: CollapsiblePanelHeaderProps) {
  return (
    <div
      onClick={onToggle}
      className="h-10 border-b border-sidebar-border flex items-center justify-between px-3 shrink-0 bg-sidebar-background cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none"
    >
      <div className="flex items-center gap-1 text-sidebar-foreground/70">
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {icon}
        <h2 className="text-xs font-semibold font-mono tracking-wider uppercase ml-1">{title}</h2>
      </div>
      {actions && (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  )
}
