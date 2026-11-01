// Everything the event editor needs to know about the rest of the editor (switches, maps, sprites,
// entities ...), gathered into one plain object. The real editor builds it from the editor context;
// tests (and any other host) can provide their own through <EventEnvProvider>.

import React, { createContext, useContext, useMemo } from 'react'
import type { SpriteAssetInfo, SpriteKind, StageDef, SwitchDef, VariableDef } from '../../../../../shared/engine/types'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'

export interface EventEnv {
  /** Editor id of the entity that owns the event ("this event"). */
  entityId: string
  switches: SwitchDef[]
  variables: VariableDef[]
  stages: StageDef[]
  /** Maps of the project; `id` is the file name without `.json`. */
  maps: { id: string; name: string }[]
  sprites: { id: string; name: string; kind: SpriteKind }[]
  /** Common events of the project (`callCommonEvent` targets). */
  commonEvents?: { id: string; name: string }[]
  /** Entities of the active map (the owner included; pickers leave it out). */
  entities: { id: string; name: string }[]
  /** Creates a global switch / variable and returns its id ('' when the database is not loaded yet). */
  addSwitch: (name: string) => string
  addVariable: (name: string) => string
  /** Creates a global stage (with two default values) and returns its id. */
  addStage: (name: string) => string
  getSpriteAsset: (id: string) => SpriteAssetInfo | undefined
  /** Editor-wide undo/redo (the dialog is modal, so it offers its own buttons). */
  undo?: () => void
  redo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  /** Entity name for the dialog title. */
  entityName?: string
}

const EventEnvContext = createContext<EventEnv | null>(null)

export function EventEnvProvider({ value, children }: { value: EventEnv; children: React.ReactNode }) {
  return <EventEnvContext.Provider value={value}>{children}</EventEnvContext.Provider>
}

export function useEventEnv(): EventEnv {
  const env = useContext(EventEnvContext)
  if (!env) throw new Error('useEventEnv must be used inside an EventEnvProvider')
  return env
}

/** Map id = file name without its extension (what `warp.map` stores). */
export function mapIdOf(fileName: string): string {
  return fileName.replace(/\.json$/i, '')
}

const selectEnvInputs = (c: EditorContextValue) => ({
  switches: c.switches,
  variables: c.variables,
  stages: c.stages,
  maps: c.maps,
  entities: c.entities,
  commonEvents: c.commonEvents,
  spriteList: c.spriteList,
  getSpriteAsset: c.getSpriteAsset,
  addSwitch: c.addSwitch,
  addVariable: c.addVariable,
  addStage: c.addStage,
  handleUndo: c.handleUndo,
  handleRedo: c.handleRedo,
  historyIndex: c.historyIndex,
  historyLength: c.historyLength,
})

/**
 * Provides an EventEnv built from the editor context to its children. Falls back to an env supplied by a
 * parent <EventEnvProvider> (tests) so the editor can be rendered without the whole editor around it.
 */
export function EditorEventEnvProvider({ entityId, children }: { entityId: string; children: React.ReactNode }) {
  const injected = useContext(EventEnvContext)
  if (injected) return <>{children}</>
  return <ContextBackedEnv entityId={entityId}>{children}</ContextBackedEnv>
}

function ContextBackedEnv({ entityId, children }: { entityId: string; children: React.ReactNode }) {
  const c = useEditorSelector(selectEnvInputs)
  const env = useMemo<EventEnv>(
    () => ({
      entityId,
      entityName: c.entities.find((e) => e.id === entityId)?.name,
      switches: c.switches,
      variables: c.variables,
      stages: c.stages,
      maps: c.maps.map((m) => ({ id: mapIdOf(m.fileName), name: m.name || mapIdOf(m.fileName) })),
      sprites: c.spriteList.map((s) => ({ id: s.id, name: s.meta.name || s.id, kind: s.meta.kind })),
      entities: c.entities.map((e) => ({ id: e.id, name: e.name })),
      commonEvents: (c.commonEvents ?? []).map((e) => ({ id: e.id, name: e.name })),
      addSwitch: (name) => c.addSwitch(name),
      addVariable: (name) => c.addVariable(name),
      addStage: (name) => c.addStage(name),
      getSpriteAsset: (id) => c.getSpriteAsset(id),
      undo: c.handleUndo,
      redo: c.handleRedo,
      canUndo: c.historyIndex > 0,
      canRedo: c.historyIndex < c.historyLength - 1,
    }),
    [entityId, c],
  )
  return <EventEnvContext.Provider value={env}>{children}</EventEnvContext.Provider>
}
