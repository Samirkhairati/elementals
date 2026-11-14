import React, { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ComponentType, type PropBag } from '@/types/editor'
import { COMPONENT_REGISTRY, isFieldVisible } from '@/lib/componentRegistry'
import { ComponentFieldEditor } from './ComponentFieldEditor'
import { CUSTOM_EDITORS } from '../../inspector/customEditors'
import { TransformFields } from '../../inspector/TransformFields'
import { Card, IconButton } from '../../ui/controls'
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
      const states = Array.isArray(props.states) ? props.states.length : 0
      return `${states} state${states === 1 ? '' : 's'}`
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
    <Card
      collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      // The Event card stays mounted while collapsed: its dialog opens from window events (double-click on the canvas, "Edit event").
      keepMounted={type === 'Event'}
      accent={accentVar(schema.accent)}
      icon={<NamedIcon name={schema.icon} />}
      title={schema.label}
      summary={summary}
      className="text-left"
      data-testid={`component-card-${type}`}
      actions={
        !schema.required && (
          <IconButton tone="danger" title={`Remove ${schema.label}`} aria-label={`Remove ${schema.label}`} onClick={onRemove}>
            <Trash2 />
          </IconButton>
        )
      }
    >
      {CustomEditor ? (
        <CustomEditor entityId={entityId} value={props} components={components} onChange={onUpdateProp} onChangeMany={changeMany} />
      ) : type === 'Transform' ? (
        <TransformFields value={props} onChange={onUpdateProp} onChangeMany={changeMany} />
      ) : (
        schema.fields
          .filter((field) => isFieldVisible(field, props))
          .map((field) => <ComponentFieldEditor key={field.key} field={field} value={props[field.key]} onChange={(val) => onUpdateProp(field.key, val)} />)
      )}
    </Card>
  )
}
