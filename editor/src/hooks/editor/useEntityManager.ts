import { useState, useRef, useEffect, useCallback } from 'react'
import { EntityData, ComponentType, MapData } from '@/types/editor'
import { COMPONENT_REGISTRY } from '@/lib/componentRegistry'

interface UseEntityManagerOptions {
  activeMap: MapData | null
  setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
  onCommitHistory?: (entities: EntityData[]) => void
}

export function useEntityManager(options: UseEntityManagerOptions) {
  const { activeMap, setActiveMap, onCommitHistory } = options

  const [entities, setEntities] = useState<EntityData[]>(activeMap?.entities || [])
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

  // Synchronize local entities when activeMap changes
  useEffect(() => {
    const mapEntities = activeMap?.entities || []
    setEntities(mapEntities)
    setSelectedEntityId(prev => {
      if (prev && !mapEntities.some(e => e.id === prev)) {
        return null
      }
      return prev
    })
  }, [activeMap?.fileName, activeMap?.folderPath, activeMap?.entities])

  // ── Unified Entity Mutation Pipeline ──────────────────────────────────────
  const commitNewEntities = useCallback(
    (updater: (prev: EntityData[]) => EntityData[], onAfter?: (next: EntityData[]) => void) => {
      setEntities(prev => {
        const next = updater(prev)
        if (next === prev) return prev
        if (activeMap) {
          const updatedMap = { ...activeMap, entities: next }
          setActiveMap(updatedMap)
          window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
        }
        onCommitHistory?.(next)
        onAfter?.(next)
        return next
      })
    },
    [activeMap, setActiveMap, onCommitHistory]
  )

  const updateEntities = useCallback(
    (newEntities: EntityData[]) => {
      commitNewEntities(() => newEntities)
    },
    [commitNewEntities]
  )

  // ── Entity CRUD ───────────────────────────────────────────────────────────
  const createEntity = useCallback(
    (
      name: string,
      x: number = 0,
      y: number = 0,
      initialComponents?: Partial<Record<ComponentType, Record<string, any>>>
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

          const newEntity: EntityData = {
            id: crypto.randomUUID(),
            name: cleanName,
            x,
            y,
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
            components: JSON.parse(JSON.stringify(target.components)),
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
          if (selectedEntityId === id) {
            setSelectedEntityId(next.length > 0 ? next[0].id : null)
          }
        }
      )
    },
    [commitNewEntities, selectedEntityId]
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

          const defaultProps = JSON.parse(JSON.stringify(schema.defaultProps))
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

  return {
    entities,
    setEntities,
    selectedEntityId,
    setSelectedEntityId,
    createEntity,
    duplicateEntity,
    deleteEntity,
    renameEntity,
    moveEntity,
    reorderEntities,
    addComponent,
    removeComponent,
    updateComponentProp,
    updateEntities,
  }
}
