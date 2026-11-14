// The entities of the open map: `entity` nodes anywhere in the scene tree. This manager creates, edits, copies and deletes
// them through the tree's `commit` (one undo step each) and exposes the selected one. Where an entity sits in the tree is
// where it draws (see lib/sceneIndex `drawPlan`); groups, order and visibility are the tree's own.

import { useCallback, useMemo } from 'react'
import type { EntityData, ComponentType, PropBag } from '@/types/editor'
import { COMPONENT_REGISTRY } from '@/lib/componentRegistry'
import { createDefaultComponent } from '../../../../shared/engine/components'
import { withDerivedFree } from '../../../../shared/engine/placement'
import { withCharacterDepth } from '@/lib/entityDepth'
import { addEntity, deleteNodes, duplicateNodes, patchNode, renameNode, setVisible } from '@/lib/sceneOps'
import { sceneIndex } from '@/lib/sceneIndex'
import { pruneSelection } from '@/lib/sceneSelection'
import { updateNode, type EntityNode } from '../../../../shared/sceneTree'
import { useStableArray } from '@/hooks/useShallowStable'
import type { SceneTreeApi } from './useSceneTree'

const newId = () => crypto.randomUUID()

export function useEntityManager(tree: SceneTreeApi) {
  const { commit, index, view, getSelection, getIndex, select, selectMany, setSelection } = tree

  /** Every entity of the map, in tree order. */
  const entities = useStableArray(index.entities) as unknown as EntityData[]
  const selectedEntityId = view.selectedEntityId

  /** Picks an entity; `null` lets go of it (the layer that was active before comes back). */
  const setSelectedEntityId = useCallback(
    (id: string | null) => {
      if (id) {
        select(id)
        return
      }
      const sel = getSelection()
      if (getIndex().byId.get(sel.primary ?? '')?.node.type !== 'entity') return
      const back = sel.lastLayerId && getIndex().byId.has(sel.lastLayerId) ? sel.lastLayerId : null
      if (back) select(back)
      else setSelection((s) => ({ ...s, ids: [], primary: null, anchor: null, openGroupId: null }))
    },
    [select, getSelection, getIndex, setSelection]
  )

  /** Applies `fn` to one entity (not to anything else with that id). */
  const editEntity = useCallback(
    (id: string, fn: (entity: EntityData) => EntityData) => {
      commit((prev) =>
        updateNode(prev, id, (n) => {
          if (n.type !== 'entity') return n
          const next = fn(n as unknown as EntityData)
          return next === (n as unknown as EntityData) ? n : (next as unknown as EntityNode)
        })
      )
    },
    [commit]
  )

  // ── Entity CRUD ───────────────────────────────────────────────────────────
  /** Makes an entity at (x, y): inside the selected group, after the selected entity, else in the "Entities" group (see `addEntity`). */
  const createEntity = useCallback(
    (name: string, x: number = 0, y: number = 0, initialComponents?: Partial<Record<ComponentType, PropBag>>, anchorId?: string | null) => {
      let createdId: string | null = null
      commit(
        (prev) => {
          let cleanName = name.trim()
          if (!cleanName) {
            let counter = 1
            const names = new Set(sceneIndex(prev).entities.map((e) => e.name))
            while (names.has(`Entity ${counter}`)) counter++
            cleanName = `Entity ${counter}`
          }

          const defaultComponents: Partial<Record<ComponentType, PropBag>> = {
            Transform: {
              ...COMPONENT_REGISTRY.Transform.defaultProps,
              x,
              y,
            },
            ...(initialComponents || {}),
          }
          // Entity position and Transform are one thing: prefabs carry a placeholder Transform.
          defaultComponents.Transform = { ...defaultComponents.Transform, x, y }

          const entity = withDerivedFree({
            id: crypto.randomUUID(),
            type: 'entity',
            name: cleanName,
            x,
            y,
            components: JSON.parse(JSON.stringify(defaultComponents)),
          } as EntityNode)
          const next = addEntity(prev, entity, anchorId === undefined ? getSelection().primary : anchorId)
          if (next !== prev) createdId = entity.id
          return next
        },
        () => {
          if (createdId) select(createdId)
        }
      )
    },
    [commit, getSelection, select]
  )

  /** A copy of an entity right after the original, one tile down-right, with fresh event state; it is picked. */
  const duplicateEntity = useCallback(
    (id: string) => {
      let made: string[] = []
      commit(
        (prev) => {
          const result = duplicateNodes(prev, [id], newId)
          made = result.ids
          return result.nodes
        },
        () => {
          if (made.length > 0) selectMany(made[made.length - 1], made)
        }
      )
    },
    [commit, selectMany]
  )

  const deleteEntity = useCallback(
    (id: string) => {
      commit(
        (prev) => deleteNodes(prev, [id]),
        (next) => setSelection((sel) => pruneSelection(sel, sceneIndex(next)))
      )
    },
    [commit, setSelection]
  )

  const renameEntity = useCallback((id: string, newName: string) => commit((prev) => renameNode(prev, id, newName)), [commit])

  const toggleEntityVisibility = useCallback(
    (id: string) => {
      commit((prev) => {
        const node = sceneIndex(prev).byId.get(id)?.node
        return node ? setVisible(prev, id, node.visible === false) : prev
      })
    },
    [commit]
  )

  const moveEntity = useCallback(
    (id: string, x: number, y: number) => {
      editEntity(id, (e) => {
        const components = { ...e.components }
        if (components.Transform) components.Transform = { ...components.Transform, x, y }
        return withDerivedFree({ ...e, x, y, components } as unknown as EntityNode) as unknown as EntityData
      })
    },
    [editEntity]
  )

  // ── Component Management on Selected Entity ───────────────────────────────
  const addComponent = useCallback(
    (entityId: string, type: ComponentType) => {
      editEntity(entityId, (e) => {
        const schema = COMPONENT_REGISTRY[type]
        if (!schema) return e

        // Check singleton constraint
        if (schema.singleton && e.components[type]) return e

        const defaultProps = createDefaultComponent(type) as unknown as PropBag
        if (type === 'Transform') {
          defaultProps.x = e.x
          defaultProps.y = e.y
        }
        return { ...e, components: { ...e.components, [type]: defaultProps } }
      })
    },
    [editEntity]
  )

  const removeComponent = useCallback(
    (entityId: string, type: ComponentType) => {
      editEntity(entityId, (e) => {
        const updated = { ...e.components }
        delete updated[type]
        return { ...e, components: updated }
      })
    },
    [editEntity]
  )

  const updateComponentProp = useCallback(
    (entityId: string, type: ComponentType, key: string, value: unknown) => {
      editEntity(entityId, (e) => {
        const updatedCompProps = { ...(e.components[type] || {}), [key]: value }

        // If updating position on Transform, keep entity.x and entity.y in sync
        let nextX = e.x
        let nextY = e.y
        if (type === 'Transform') {
          if (key === 'x') nextX = Number(value) || 0
          if (key === 'y') nextY = Number(value) || 0
        }

        const components = { ...e.components, [type]: updatedCompProps }
        return withDerivedFree({
          ...e,
          x: nextX,
          y: nextY,
          components: type === 'Sprite' && key === 'asset' ? withCharacterDepth(components, value) : components,
        } as unknown as EntityNode) as unknown as EntityData
      })
    },
    [editEntity]
  )

  /** Set several props of one component in a single commit (one history step, one save). */
  const updateComponentProps = useCallback(
    (entityId: string, type: ComponentType, props: PropBag) => {
      editEntity(entityId, (e) => {
        let nextX = e.x
        let nextY = e.y
        if (type === 'Transform') {
          if ('x' in props) nextX = Number(props.x) || 0
          if ('y' in props) nextY = Number(props.y) || 0
        }
        const components = { ...e.components, [type]: { ...(e.components[type] || {}), ...props } }
        return withDerivedFree({
          ...e,
          x: nextX,
          y: nextY,
          components: type === 'Sprite' && 'asset' in props ? withCharacterDepth(components, props.asset) : components,
        } as unknown as EntityNode) as unknown as EntityData
      })
    },
    [editEntity]
  )

  /** A patch of node fields (`name`, `x`, ...) for an entity. */
  const patchEntity = useCallback((id: string, patch: Record<string, unknown>) => commit((prev) => patchNode(prev, id, patch)), [commit])

  const getEntities = useCallback(() => getIndex().entities as unknown as EntityData[], [getIndex])

  return useMemo(
    () => ({
      entities,
      getEntities,
      selectedEntityId,
      setSelectedEntityId,
      createEntity,
      duplicateEntity,
      deleteEntity,
      renameEntity,
      toggleEntityVisibility,
      moveEntity,
      addComponent,
      removeComponent,
      updateComponentProp,
      updateComponentProps,
      patchEntity,
    }),
    [entities, getEntities, selectedEntityId, setSelectedEntityId, createEntity, duplicateEntity, deleteEntity, renameEntity, toggleEntityVisibility, moveEntity, addComponent, removeComponent, updateComponentProp, updateComponentProps, patchEntity]
  )
}
