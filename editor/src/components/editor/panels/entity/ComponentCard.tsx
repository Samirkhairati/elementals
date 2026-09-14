import React, { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Move,
  Image as ImageIcon,
  BoxSelect,
  Footprints,
  Navigation,
  Gamepad2,
  Film,
  MessageSquare,
  Compass,
  Tag as TagIcon,
  Layers,
} from 'lucide-react'
import { ComponentType } from '@/types/editor'
import { COMPONENT_REGISTRY } from '@/lib/componentRegistry'
import { ComponentFieldEditor } from './ComponentFieldEditor'

interface ComponentCardProps {
  type: ComponentType
  props: Record<string, any>
  onUpdateProp: (key: string, value: any) => void
  onRemove: () => void
}

function getComponentIcon(type: ComponentType) {
  switch (type) {
    case 'Transform':
      return <Move className="w-3.5 h-3.5 text-blue-400" />
    case 'SpriteView':
      return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
    case 'Collider':
      return <BoxSelect className="w-3.5 h-3.5 text-red-400" />
    case 'GridMovement':
      return <Footprints className="w-3.5 h-3.5 text-amber-400" />
    case 'FreeMovement':
      return <Navigation className="w-3.5 h-3.5 text-yellow-400" />
    case 'PlayerControl':
      return <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />
    case 'CharacterAnimation':
      return <Film className="w-3.5 h-3.5 text-pink-400" />
    case 'Interactable':
      return <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
    case 'AIWander':
      return <Compass className="w-3.5 h-3.5 text-teal-400" />
    case 'Tag':
      return <TagIcon className="w-3.5 h-3.5 text-orange-400" />
    default:
      return <Layers className="w-3.5 h-3.5 text-gray-400" />
  }
}

export function ComponentCard({ type, props, onUpdateProp, onRemove }: ComponentCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const schema = COMPONENT_REGISTRY[type]

  if (!schema) return null

  return (
    <div className="rounded-md border border-border/70 bg-card/60 overflow-hidden text-left font-mono">
      {/* Header */}
      <div
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex items-center justify-between px-2.5 py-1.5 bg-sidebar-accent/50 cursor-pointer select-none hover:bg-sidebar-accent/80 transition-none"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
          )}
          <div className="shrink-0">{getComponentIcon(type)}</div>
          <span className="text-xs font-medium text-foreground">{schema.label}</span>
        </div>

        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 opacity-60 hover:opacity-100 transition-none"
          title={`Remove ${schema.label}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="p-2.5 space-y-1.5 border-t border-border/40 bg-background/30">
          {schema.fields.map(field => (
            <ComponentFieldEditor
              key={field.key}
              field={field}
              value={props[field.key]}
              onChange={val => onUpdateProp(field.key, val)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
