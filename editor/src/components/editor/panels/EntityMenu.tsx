import { Plus, Sparkles, Users } from 'lucide-react'
import type { ComponentType, PropBag } from '@/types/editor'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
import { NamedIcon } from '../ui/icons'
import { ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from '@/components/ui/context-menu'

export type Components = Partial<Record<ComponentType, PropBag>>
export type Prefab = (typeof PRESET_PREFABS)[number]

/**
 * The "Entity" entry of a right-click menu: New (an empty entity) and Prefab (one of the presets), each placed with the
 * next click on the map. Shared by the Scene panel and the map canvas so every menu offers the same choices.
 */
export function EntitySubmenu({ onNew, onPrefab }: { onNew: () => void; onPrefab: (prefab: Prefab) => void }) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Users className="text-sky-400" />
        Entity
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <ContextMenuItem onClick={onNew} title="An empty entity, one tile in size: add the components you need">
          <Plus className="text-primary" />
          New
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Sparkles className="text-amber-400" />
            Prefab
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {PRESET_PREFABS.map((prefab) => (
              <ContextMenuItem key={prefab.id} onClick={() => onPrefab(prefab)} title={prefab.description}>
                <NamedIcon name={prefab.icon} className="text-muted-foreground" />
                {prefab.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

/**
 * New / Prefab placement for the Scene panel's menus: the next click on the map puts the entity there (`startPlacement`);
 * without it, entities are created at (0, 0) next to `anchorId` (default: the selection).
 */
export function entityCreators(props: {
  startPlacement?: (template: { name: string; components?: Components }) => void
  createEntity: (name: string, x?: number, y?: number, initialComponents?: Components, anchorId?: string | null) => void
}) {
  return {
    placeNew: (anchorId: string | null = null) => {
      if (props.startPlacement) props.startPlacement({ name: 'New Entity' })
      else props.createEntity('New Entity', 0, 0, undefined, anchorId)
    },
    placePrefab: (prefab: Prefab, anchorId: string | null = null) => {
      if (props.startPlacement) props.startPlacement({ name: prefab.name, components: prefab.components })
      else props.createEntity(prefab.name, 0, 0, prefab.components, anchorId)
    },
  }
}
