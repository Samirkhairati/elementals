// Thin adapter over the shared engine definitions (shared/engine/components.ts, prefabs.ts).
// The editor UI consumes COMPONENT_REGISTRY / PRESET_PREFABS in this shape; the single source of truth
// for fields, defaults and prefabs lives in /shared.
import type { ComponentFieldDef, ComponentSchemaEntry, ComponentType } from '@/types/editor'
import { COMPONENT_SCHEMAS, COMPONENT_TYPES, createDefaultComponent } from '../../../shared/engine/components'
import { facingOptions } from '../../../shared/engine/constants'
import { PREFABS, instantiatePrefab } from '../../../shared/engine/prefabs'
import type { FieldDef } from '../../../shared/engine/types'

/** Maps a shared FieldDef onto the primitive field editors the inspector currently has. */
export function toEditorField(field: FieldDef): ComponentFieldDef {
  let type: ComponentFieldDef['type']
  switch (field.kind) {
    case 'number':
      type = 'number'
      break
    case 'boolean':
      type = 'boolean'
      break
    case 'select':
    case 'facing':
      type = 'select'
      break
    case 'textarea':
      type = 'textarea'
      break
    default:
      // text, color, sprite, map, switch, ... : edited as plain strings until a specialised editor exists
      type = 'string'
  }
  const out: ComponentFieldDef = { key: field.key, label: field.label, type, kind: field.kind }
  if (field.kind === 'facing') out.options = facingOptions()
  else if (field.options) out.options = field.options
  if (field.min !== undefined) out.min = field.min
  if (field.max !== undefined) out.max = field.max
  if (field.step !== undefined) out.step = field.step
  if (field.placeholder !== undefined) out.placeholder = field.placeholder
  if (field.help !== undefined) out.help = field.help
  if (field.unit !== undefined) out.unit = field.unit
  if (field.visibleWhen !== undefined) out.visibleWhen = field.visibleWhen
  return out
}

function buildRegistry(): Record<ComponentType, ComponentSchemaEntry> {
  const registry = {} as Record<ComponentType, ComponentSchemaEntry>
  for (const type of COMPONENT_TYPES) {
    const schema = COMPONENT_SCHEMAS[type]
    registry[type] = {
      label: schema.label,
      singleton: schema.singleton,
      // Event gets a real first page; everything else its schema defaults.
      defaultProps: createDefaultComponent(type) as unknown as Record<string, any>,
      fields: schema.fields.map(toEditorField),
      description: schema.description,
      icon: schema.icon,
      accent: schema.accent,
      category: schema.category,
      required: schema.required,
    }
  }
  return registry
}

export const COMPONENT_REGISTRY: Record<ComponentType, ComponentSchemaEntry> = buildRegistry()

/** Whether a field applies given the component's current props (`visibleWhen`). */
export function isFieldVisible(field: Pick<ComponentFieldDef, 'visibleWhen'>, props: Record<string, any>): boolean {
  if (!field.visibleWhen) return true
  return field.visibleWhen.in.includes(props[field.visibleWhen.key])
}

export interface PresetPrefab {
  id: string
  name: string
  description: string
  icon: string
  /** A fresh deep copy on every access (new event page/command ids), ready to attach to an entity. */
  readonly components: Partial<Record<ComponentType, Record<string, any>>>
}

export const PRESET_PREFABS: PresetPrefab[] = PREFABS.map((prefab) => ({
  id: prefab.id,
  name: prefab.name,
  description: prefab.description,
  icon: prefab.icon,
  get components() {
    return instantiatePrefab(prefab, { x: 0, y: 0 }).components as unknown as Partial<Record<ComponentType, Record<string, any>>>
  },
}))
