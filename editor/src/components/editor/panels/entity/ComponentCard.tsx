import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { ComponentType, type PropBag } from '@/types/editor'
import { COMPONENT_REGISTRY, isFieldVisible } from '@/lib/componentRegistry'
import { ComponentFieldEditor } from './ComponentFieldEditor'
import { CUSTOM_EDITORS } from '../../inspector/customEditors'
import { TransformFields } from '../../inspector/TransformFields'
import { IconButton } from '../../ui/controls'
import { accentVar, NamedIcon } from '../../ui/icons'

interface ComponentCardProps {
  type: ComponentType
  props: PropBag
  onUpdateProp: (key: string, value: unknown) => void
  /** Several props as one history step (custom editors use it). Falls back to per-key updates. */
  onUpdateProps?: (patch: PropBag) => void
  entityId?: string
  /** All components of the entity (custom editors may need siblings, e.g. Sprite + Collider). */
  components?: Record<string, PropBag>
  onRemove: () => void
}

/** One-line summary shown in the collapsed header (and next to the title). */
export function componentSummary(type: ComponentType, props: PropBag): string {
  switch (type) {
    case 'Sprite':
      return props.asset ? String(props.asset) : 'no sprite'
    case 'Collider':
      return `${props.width ?? 32}×${props.height ?? 32} ${props.isSolid === false ? 'trigger' : 'solid'}`
    case 'Movement':
      return String(props.controller ?? 'none')
    case 'Event': {
      const pages = Array.isArray(props.pages) ? props.pages.length : 0
      return `${pages} page${pages === 1 ? '' : 's'}`
    }
    case 'Tag':
      return String(props.tag ?? '')
    default:
      return ''
  }
}

export function ComponentCard({ type, props, onUpdateProp, onUpdateProps, entityId = '', components = {}, onRemove }: ComponentCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const schema = COMPONENT_REGISTRY[type]
  const CustomEditor = CUSTOM_EDITORS[type]

  if (!schema) return null

  const changeMany = (patch: PropBag) =>
    onUpdateProps ? onUpdateProps(patch) : Object.entries(patch).forEach(([k, v]) => onUpdateProp(k, v))
  const summary = componentSummary(type, props)

  return (
    <section
      className="ed-card text-left"
      style={{ ['--card-accent' as string]: accentVar(schema.accent) }}
      data-testid={`component-card-${type}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${schema.label} component`}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded((prev) => !prev)
          }
        }}
        className="ed-card-head cursor-default"
      >
        {isExpanded ? <ChevronDown className="ed-icon opacity-60" /> : <ChevronRight className="ed-icon opacity-60" />}
        <NamedIcon name={schema.icon} className="ed-icon" />
        <span className="shrink-0 text-ed-body font-medium text-foreground">{schema.label}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-ed-label font-normal text-muted-foreground">{summary}</span>}
        {!summary && <span className="flex-1" />}
        {!schema.required && (
          <IconButton
            tone="danger"
            title={`Remove ${schema.label}`}
            aria-label={`Remove ${schema.label}`}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <Trash2 />
          </IconButton>
        )}
      </div>

      {(isExpanded || type === 'Event') && (
        // The Event card stays mounted while collapsed: its dialog opens from window events (double-click on the canvas, "Edit event").
        <div className="ed-card-body" hidden={!isExpanded}>
          {CustomEditor ? (
            <CustomEditor entityId={entityId} value={props} components={components} onChange={onUpdateProp} onChangeMany={changeMany} />
          ) : type === 'Transform' ? (
            <TransformFields value={props} onChange={onUpdateProp} onChangeMany={changeMany} />
          ) : (
            schema.fields
              .filter((field) => isFieldVisible(field, props))
              .map((field) => <ComponentFieldEditor key={field.key} field={field} value={props[field.key]} onChange={(val) => onUpdateProp(field.key, val)} />)
          )}
        </div>
      )}
    </section>
  )
}
