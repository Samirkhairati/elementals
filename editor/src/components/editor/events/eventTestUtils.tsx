// Test helpers for the event editor (not shipped: only *.test files import this).

import React, { StrictMode, useState } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { Command, EventState, SpriteAssetInfo } from '../../../../../shared/engine/types'
import { createSequentialIdGenerator, setIdGenerator } from '../../../../../shared/engine/ids'
import { createCommand } from '../../../../../shared/engine/commands'
import { createDefaultEventState } from '../../../../../shared/engine/components'
import { commandsToGraph } from '../../../../../shared/engine/graph'
import { EventEnvProvider, type EventEnv } from './eventEnv'
import { PortalContainerProvider } from './primitives'

export function makeEnv(overrides: Partial<EventEnv> = {}): EventEnv {
  const chest: SpriteAssetInfo = {
    id: 'objects/chest',
    sheets: {},
    meta: {
      version: 1,
      name: 'Chest',
      kind: 'object',
      frameWidth: 32,
      frameHeight: 32,
      margin: 0,
      spacing: 0,
      pivotX: 0.5,
      pivotY: 1,
      sheet: 'sheet.png',
      animations: { open: { frames: [1, 2], fps: 8, loop: false } },
    },
  }
  return {
    entityId: 'self-1',
    entityName: 'Old man',
    switches: [
      { id: 'met', name: 'Met the guard' },
      { id: 'door', name: 'Door open' },
    ],
    variables: [{ id: 'badges', name: 'Badges earned', initial: 0 }],
    stages: [
      {
        id: 'cat',
        name: 'Lost cat',
        values: [
          { id: 'none', name: 'Not started' },
          { id: 'found', name: 'Found' },
          { id: 'done', name: 'Done' },
        ],
        initial: 'none',
      },
    ],
    maps: [
      { id: 'town', name: 'Town' },
      { id: 'cave', name: 'Cave' },
    ],
    sprites: [
      { id: 'characters/hero', name: 'Hero', kind: 'character' },
      { id: 'objects/chest', name: 'Chest', kind: 'object' },
    ],
    entities: [
      { id: 'self-1', name: 'Old man' },
      { id: 'e2', name: 'Guard' },
    ],
    addSwitch: vi.fn((name: string) => `sw_${name.toLowerCase().replace(/\W+/g, '_')}`),
    addVariable: vi.fn((name: string) => `var_${name.toLowerCase().replace(/\W+/g, '_')}`),
    addStage: vi.fn((name: string) => `stage_${name.toLowerCase().replace(/\W+/g, '_')}`),
    getSpriteAsset: (id: string) => (id === 'objects/chest' ? chest : undefined),
    ...overrides,
  }
}

/** Deterministic ids (`t-1`, `t-2` ...) for commands/states created during a test. */
export function sequentialIds(prefix = 't') {
  let previous: ReturnType<typeof setIdGenerator> | undefined
  return {
    start() {
      previous = setIdGenerator(createSequentialIdGenerator(prefix))
    },
    stop() {
      if (previous) setIdGenerator(previous)
    },
  }
}

export function cmd(id: string, type: string, params?: Record<string, unknown>, branches?: Record<string, Command[]>): Command {
  const c = createCommand(type, params, () => id)
  if (branches) c.branches = { ...(c.branches ?? {}), ...branches }
  return c
}

/** A state whose graph is built from a command list (flow commands nest their branches). */
export function state(id: string, commands: Command[] = [], extra: Partial<EventState> = {}): EventState {
  return { ...createDefaultEventState(), id, name: '', graph: commandsToGraph(commands, () => `start-${id}`), ...extra }
}

/** Flat list of `type` (or `type:id`) in depth-first order, for tree assertions. */
export function flat(commands: Command[], withIds = false): string[] {
  const out: string[] = []
  const walk = (list: Command[]) => {
    for (const c of list) {
      out.push(withIds ? `${c.type}:${c.id}` : c.type)
      for (const sub of Object.values(c.branches ?? {})) walk(sub)
    }
  }
  walk(commands)
  return out
}

export function EnvWrapper({ env, children }: { env: EventEnv; children: React.ReactNode }) {
  return (
    <StrictMode>
      <EventEnvProvider value={env}>
        <PortalContainerProvider value={null}>{children}</PortalContainerProvider>
      </EventEnvProvider>
    </StrictMode>
  )
}

/** Renders `ui` with an env (StrictMode, like the real app in development). */
export function renderWithEnv(ui: React.ReactElement, env: EventEnv = makeEnv()) {
  return render(ui, { wrapper: ({ children }) => <EnvWrapper env={env}>{children}</EnvWrapper> })
}

/** Holds a value in state and reports each change to `onChange`; renders `children(value, set)`. */
export function Stateful<T>({ initial, onChange, children }: { initial: T; onChange?: (next: T) => void; children: (value: T, set: (next: T) => void) => React.ReactNode }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      {children(value, (next) => {
        onChange?.(next)
        setValue(next)
      })}
    </>
  )
}
