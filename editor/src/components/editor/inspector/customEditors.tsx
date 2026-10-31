import type { ComponentType as ReactComponentType } from 'react'
import { SpriteComponentEditor } from './SpriteComponentEditor'
import { ColliderComponentEditor } from './ColliderComponentEditor'
import { MovementComponentEditor } from './MovementComponentEditor'
import { EventComponentEditor } from '../events/EventComponentEditor'

/** Props every custom component editor receives from the inspector's ComponentCard. */
export interface CustomEditorProps {
  entityId: string
  /** Current props of the component being edited. */
  value: Record<string, any>
  /** Props of all of the entity's components (e.g. Sprite editor needs Transform/Collider). */
  components: Record<string, Record<string, any>>
  /** Change one prop (history + autosave handled upstream). */
  onChange: (key: string, value: any) => void
  /** Change several props as one history step. */
  onChangeMany: (patch: Record<string, any>) => void
}

/**
 * Component type -> custom editor. ComponentCard renders the editor for a component when one is
 * registered here and falls back to the schema-driven field list for everything else (and for any
 * `FieldDef` not covered by the custom editor if it chooses to render <ComponentFieldList/> itself).
 */
export const CUSTOM_EDITORS: Partial<Record<string, ReactComponentType<CustomEditorProps>>> = {
  Sprite: SpriteComponentEditor,
  Collider: ColliderComponentEditor,
  Movement: MovementComponentEditor,
  Event: EventComponentEditor,
}
