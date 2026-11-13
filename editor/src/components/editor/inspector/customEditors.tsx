import type { ComponentType as ReactComponentType } from 'react'
import { SpriteComponentEditor } from './SpriteComponentEditor'
import { ColliderComponentEditor } from './ColliderComponentEditor'
import { MovementComponentEditor } from './MovementComponentEditor'
import { TagComponentEditor } from './TagComponentEditor'
import type { PropBag } from '@/types/editor'
import { EventComponentEditor } from '../events/EventComponentEditor'

/** Props every custom component editor receives from the inspector's ComponentCard. */
export interface CustomEditorProps {
  entityId: string
  /** Current props of the component being edited. */
  value: PropBag
  /** Props of all of the entity's components (e.g. Sprite editor needs Transform/Collider). */
  components: Record<string, PropBag>
  /** Change one prop (history + autosave handled upstream). */
  onChange: (key: string, value: unknown) => void
  /** Change several props as one history step. */
  onChangeMany: (patch: PropBag) => void
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
  Tag: TagComponentEditor,
  Event: EventComponentEditor,
}
