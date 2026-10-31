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
      className="ed-panel-head cursor-default justify-between hover:bg-sidebar-accent/50"
    >
      <div className="flex items-center gap-2">
        {collapsed ? <ChevronRight className="ed-icon" /> : <ChevronDown className="ed-icon" />}
        {icon}
        <h2>{title}</h2>
      </div>
      {actions && (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  )
}
