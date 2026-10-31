import { useState, useEffect, useCallback } from 'react'
import { EntityData, ComponentType, MapData, EntityFolder } from '@/types/editor'
import { COMPONENT_REGISTRY } from '@/lib/componentRegistry'
import { cloneEntity, createDefaultComponent } from '../../../../shared/engine/components'
import { useSyncedState } from '@/hooks/useSyncedState'

interface UseEntityManagerOptions {
  /** Read-only: used to (re)synchronise local state when the active map changes. */
  activeMap: MapData | null
  /** Functional updates only: mutations never close over the current map. */
  setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
  /** Called once per committed entity mutation (not for folder-only changes), after `getEntities()` is up to date. */
  onCommitHistory?: (entities: EntityData[]) => void
}

export function useEntityManager(options: UseEntityManagerOptions) {
  const { activeMap, setActiveMap, onCommitHistory } = options

  const [entities, setEntities, entitiesRef] = useSyncedState<EntityData[]>(activeMap?.entities || [])
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [showEntities, setShowEntities] = useState<boolean>(true)
  const [entityFolders, setEntityFolders, foldersRef] = useSyncedState<EntityFolder[]>(activeMap?.entityFolders || [])

  /** Latest entities / folders, readable synchronously (history snapshots, tests). */
  const getEntities = useCallback(() => entitiesRef.current, [entitiesRef])
  const getFolders = useCallback(() => foldersRef.current, [foldersRef])

  const toggleShowEntities = useCallback(() => {
    setShowEntities(prev => !prev)
  }, [])

  // Synchronize local entities & folders when activeMap changes
  useEffect(() => {
    const mapEntities = activeMap?.entities || []
    setEntities(mapEntities)
    setEntityFolders(activeMap?.entityFolders || [])
    setSelectedEntityId(prev => {
      if (prev && !mapEntities.some(e => e.id === prev)) {
        return null
      }
      return prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMap?.fileName, activeMap?.folderPath, activeMap?.entities, activeMap?.entityFolders])

  // ── Unified Entity Mutation Pipeline ──────────────────────────────────────
  const commitNewEntities = useCallback(
    (updater: (prev: EntityData[]) => EntityData[], onAfter?: (next: EntityData[]) => void) => {
      // Computed from the ref, *outside* of any React updater: side effects below run exactly once.
      const prev = entitiesRef.current
      const next = updater(prev)
      if (next === prev) return
      setEntities(next)
      setActiveMap(m => (m ? { ...m, entities: next } : m))
      onCommitHistory?.(next)
      onAfter?.(next)
    },
    [entitiesRef, setEntities, setActiveMap, onCommitHistory]
  )

  const commitFolders = useCallback(
    (updater: (prev: EntityFolder[]) => EntityFolder[]) => {
      // Folders are deliberately not part of undo history (expand/collapse must not create steps).
      const prev = foldersRef.current
      const next = updater(prev)
      if (next === prev) return
      setEntityFolders(next)
      setActiveMap(m => (m ? { ...m, entityFolders: next } : m))
    },
    [foldersRef, setEntityFolders, setActiveMap]
  )

  const updateEntities = useCallback(
    (newEntities: EntityData[]) => {
      commitNewEntities(() => newEntities)
    },
    [commitNewEntities]
  )

  // ── Folder Management ─────────────────────────────────────────────────────
  const createEntityFolder = useCallback(
    (name?: string) => {
      commitFolders(prev => {
        let cleanName = (name || '').trim()
        if (!cleanName) {
          let counter = 1
          while (prev.some(f => f.name === `Folder ${counter}`)) {
            counter++
          }
          cleanName = `Folder ${counter}`
        }
        const newFolder: EntityFolder = {
          id: crypto.randomUUID(),
          name: cleanName,
          expanded: true,
          visible: true,
        }
        return [...prev, newFolder]
      })
    },
    [commitFolders]
  )

  const renameEntityFolder = useCallback(
    (folderId: string, newName: string) => {
      const cleanName = newName.trim()
      if (!cleanName) return
      commitFolders(prev => prev.map(f => (f.id === folderId ? { ...f, name: cleanName } : f)))
    },
    [commitFolders]
  )

  const deleteEntityFolder = useCallback(
    (folderId: string) => {
      commitFolders(prev => prev.filter(f => f.id !== folderId))
      commitNewEntities(prev => prev.map(e => (e.folder === folderId ? { ...e, folder: null } : e)))
    },
    [commitFolders, commitNewEntities]
  )

  const toggleEntityFolderVisibility = useCallback(
    (folderId: string) => {
      commitFolders(prev =>
        prev.map(f => (f.id === folderId ? { ...f, visible: f.visible !== false ? false : true } : f))
      )
    },
    [commitFolders]
  )

  const toggleEntityFolderExpanded = useCallback(
    (folderId: string) => {
      commitFolders(prev =>
        prev.map(f => (f.id === folderId ? { ...f, expanded: f.expanded === false ? true : false } : f))
      )
    },
    [commitFolders]
  )

  const toggleEntityVisibility = useCallback(
    (entityId: string) => {
      commitNewEntities(prev =>
        prev.map(e => (e.id === entityId ? { ...e, visible: e.visible !== false ? false : true } : e))
      )
    },
    [commitNewEntities]
  )

  const moveEntityToFolder = useCallback(
    (entityId: string, folderId: string | null) => {
      commitNewEntities(prev =>
        prev.map(e => (e.id === entityId ? { ...e, folder: folderId } : e))
      )
    },
    [commitNewEntities]
  )

  // ── Entity CRUD ───────────────────────────────────────────────────────────
  const createEntity = useCallback(
    (
      name: string,
      x: number = 0,
      y: number = 0,
      initialComponents?: Partial<Record<ComponentType, Record<string, any>>>,
      folderId?: string | null
    ) => {
      let createdId: string | null = null
      commitNewEntities(
        prev => {
          let cleanName = name.trim()
          if (!cleanName) {
            let counter = 1
            while (prev.some(e => e.name === `Entity ${counter}`)) {
              counter++
            }
            cleanName = `Entity ${counter}`
          }

          const defaultComponents: Partial<Record<ComponentType, Record<string, any>>> = {
            Transform: {
              ...COMPONENT_REGISTRY.Transform.defaultProps,
              x,
              y,
            },
            ...(initialComponents || {}),
          }
          // Entity position and Transform are one thing: prefabs carry a placeholder Transform.
          defaultComponents.Transform = { ...defaultComponents.Transform, x, y }

          const newEntity: EntityData = {
            id: crypto.randomUUID(),
            name: cleanName,
            x,
            y,
            visible: true,
            folder: folderId || null,
            components: JSON.parse(JSON.stringify(defaultComponents)),
          }
          createdId = newEntity.id
          return [...prev, newEntity]
        },
        () => {
          if (createdId) setSelectedEntityId(createdId)
        }
      )
    },
    [commitNewEntities]
  )

  const duplicateEntity = useCallback(
    (id: string) => {
      let createdId: string | null = null
      commitNewEntities(
        prev => {
          const targetIndex = prev.findIndex(e => e.id === id)
          if (targetIndex === -1) return prev
          const target = prev[targetIndex]

          const cloned: EntityData = {
            ...target,
            id: crypto.randomUUID(),
            name: `${target.name} Copy`,
            x: target.x + 16,
            y: target.y + 16,
            visible: target.visible !== false,
            folder: target.folder || null,
            // fresh event state / command ids so the copy is independent of the original
            components: cloneEntity(target as any, true).components as EntityData['components'],
          }

          if (cloned.components.Transform) {
            cloned.components.Transform.x = cloned.x
            cloned.components.Transform.y = cloned.y
          }

          createdId = cloned.id
          const next = [...prev]
          next.splice(targetIndex + 1, 0, cloned)
          return next
        },
        () => {
          if (createdId) setSelectedEntityId(createdId)
        }
      )
    },
    [commitNewEntities]
  )

  const deleteEntity = useCallback(
    (id: string) => {
      commitNewEntities(
        prev => prev.filter(e => e.id !== id),
        next => {
          setSelectedEntityId(current => (current === id ? (next.length > 0 ? next[0].id : null) : current))
        }
      )
    },
    [commitNewEntities]
  )

  const renameEntity = useCallback(
    (id: string, newName: string) => {
      const cleanName = newName.trim()
      if (!cleanName) return
      commitNewEntities(prev => prev.map(e => (e.id === id ? { ...e, name: cleanName } : e)))
    },
    [commitNewEntities]
  )

  const moveEntity = useCallback(
    (id: string, x: number, y: number) => {
      commitNewEntities(prev =>
        prev.map(e => {
          if (e.id !== id) return e
          const updatedComponents = { ...e.components }
          if (updatedComponents.Transform) {
            updatedComponents.Transform = {
              ...updatedComponents.Transform,
              x,
              y,
            }
          }
          return {
            ...e,
            x,
            y,
            components: updatedComponents,
          }
        })
      )
    },
    [commitNewEntities]
  )

  const reorderEntities = useCallback(
    (newEntities: EntityData[]) => {
      updateEntities(newEntities)
    },
    [updateEntities]
  )

  // ── Component Management on Selected Entity ───────────────────────────────
  const addComponent = useCallback(
    (entityId: string, type: ComponentType) => {
      commitNewEntities(prev =>
        prev.map(e => {
          if (e.id !== entityId) return e
          const schema = COMPONENT_REGISTRY[type]
          if (!schema) return e

          // Check singleton constraint
          if (schema.singleton && e.components[type]) {
            return e
          }

          const defaultProps = createDefaultComponent(type) as unknown as Record<string, any>
          if (type === 'Transform') {
            defaultProps.x = e.x
            defaultProps.y = e.y
          }

          return {
            ...e,
            components: {
              ...e.components,
              [type]: defaultProps,
            },
          }
        })
      )
    },
    [commitNewEntities]
  )

  const removeComponent = useCallback(
    (entityId: string, type: ComponentType) => {
      commitNewEntities(prev =>
        prev.map(e => {
          if (e.id !== entityId) return e
          const updated = { ...e.components }
          delete updated[type]
          return {
            ...e,
            components: updated,
          }
        })
      )
    },
    [commitNewEntities]
  )

  const updateComponentProp = useCallback(
    (entityId: string, type: ComponentType, key: string, value: any) => {
      commitNewEntities(prev =>
        prev.map(e => {
          if (e.id !== entityId) return e
          const currentCompProps = e.components[type] || {}
          const updatedCompProps = {
            ...currentCompProps,
            [key]: value,
          }

          // If updating position on Transform, keep entity.x and entity.y in sync
          let nextX = e.x
          let nextY = e.y
          if (type === 'Transform') {
            if (key === 'x') nextX = Number(value) || 0
            if (key === 'y') nextY = Number(value) || 0
          }

          return {
            ...e,
            x: nextX,
            y: nextY,
            components: {
              ...e.components,
              [type]: updatedCompProps,
            },
          }
        })
      )
    },
    [commitNewEntities]
  )

  /** Set several props of one component in a single commit (one history step, one save). */
  const updateComponentProps = useCallback(
    (entityId: string, type: ComponentType, props: Record<string, any>) => {
      commitNewEntities(prev =>
        prev.map(e => {
          if (e.id !== entityId) return e
          let nextX = e.x
          let nextY = e.y
          if (type === 'Transform') {
            if ('x' in props) nextX = Number(props.x) || 0
            if ('y' in props) nextY = Number(props.y) || 0
          }
          return {
            ...e,
            x: nextX,
            y: nextY,
            components: {
              ...e.components,
              [type]: { ...(e.components[type] || {}), ...props },
            },
          }
        })
      )
    },
    [commitNewEntities]
  )

  return {
    entities,
    getEntities,
    getFolders,
    setEntities,
    selectedEntityId,
    setSelectedEntityId,
    showEntities,
    setShowEntities,
    toggleShowEntities,
    entityFolders,
    setEntityFolders,
    createEntityFolder,
    renameEntityFolder,
    deleteEntityFolder,
    toggleEntityFolderVisibility,
    toggleEntityFolderExpanded,
    toggleEntityVisibility,
    moveEntityToFolder,
    createEntity,
    duplicateEntity,
    deleteEntity,
    renameEntity,
    moveEntity,
    reorderEntities,
    addComponent,
    removeComponent,
    updateComponentProp,
    updateComponentProps,
    updateEntities,
  }
}
