import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { StageDef } from '../../../../../shared/engine/types'
import type { CommonEvent } from '../../../../../shared/engine/common'
import { createGraph, createGraphNode, connect, findStart } from '../../../../../shared/engine/graph'
import { createDefaultEventState } from '../../../../../shared/engine/components'
import { scanCommonEventUsage, type UsageMap } from '@/lib/databaseUsage'
import { makeEnv } from '../events/eventTestUtils'
import { EventEnvProvider } from '../events/eventEnv'
import { DatabasePanel } from './DatabasePanel'

const noop = () => {}

function callGraph(target: string) {
  let g = createGraph()
  const node = createGraphNode('callCommonEvent', { params: { id: target }, id: 'call' })
  g = connect({ ...g, nodes: [...g.nodes, node] }, findStart(g)!.id, 'next', 'call')
  return g
}

const EVENTS: CommonEvent[] = [
  { version: 1, id: 'heal', name: 'Heal', graph: createGraph() },
  { version: 1, id: 'intro', name: 'Intro', graph: callGraph('heal') },
]

function maps(): UsageMap[] {
  const s = createDefaultEventState('Talk')
  s.graph = callGraph('heal')
  return [{ fileName: 'town.json', name: 'Town', entities: [{ id: 'e1', name: 'Guard', components: { Event: { states: [s] } } }] }]
}

describe('scanCommonEventUsage', () => {
  it('lists callers from maps and from other common events', () => {
    expect(scanCommonEventUsage(maps(), EVENTS)).toEqual({ heal: ['Town > Guard (Talk)', 'Common event: Intro'] })
    expect(scanCommonEventUsage([], [])).toEqual({})
  })
})

function setup(spies: Record<string, ReturnType<typeof vi.fn>> = {}) {
  render(
    <EventEnvProvider value={makeEnv({ commonEvents: EVENTS.map((e) => ({ id: e.id, name: e.name })) })}>
      <DatabasePanel
        switches={[]}
        variables={[]}
        stages={[] as StageDef[]}
        maps={maps()}
        addSwitch={() => ''}
        renameSwitch={noop}
        removeSwitch={noop}
        addVariable={() => ''}
        renameVariable={noop}
        setVariableInitial={noop}
        removeVariable={noop}
        addStage={() => ''}
        renameStage={noop}
        removeStage={noop}
        addStageValue={() => ''}
        renameStageValue={noop}
        removeStageValue={noop}
        moveStageValue={noop}
        setStageInitial={noop}
        setFolder={noop}
        commonEvents={EVENTS}
        addCommonEvent={spies.add ?? (() => 'x')}
        renameCommonEvent={spies.rename ?? noop}
        removeCommonEvent={spies.remove ?? noop}
        setCommonEventGraph={spies.graph ?? noop}
      />
    </EventEnvProvider>,
  )
  return within(screen.getByTestId('common-events-section'))
}

describe('Common events section', () => {
  it('lists events with their caller counts', () => {
    const s = setup()
    expect(s.getAllByLabelText('Common event name').map((i) => (i as HTMLInputElement).value)).toEqual(['Heal', 'Intro'])
    expect(s.getByText('2 callers')).toBeInTheDocument()
    expect(s.getByText('Unused')).toBeInTheDocument()
  })

  it('adds and renames', () => {
    const add = vi.fn(() => 'x')
    const rename = vi.fn()
    const s = setup({ add, rename })
    fireEvent.click(s.getByRole('button', { name: /Add common event/ }))
    expect(add).toHaveBeenCalled()
    const input = s.getAllByLabelText('Common event name')[0]
    fireEvent.change(input, { target: { value: 'Heal party' } })
    fireEvent.blur(input)
    expect(rename).toHaveBeenCalledWith('heal', 'Heal party')
  })

  it('rejects a duplicate name', () => {
    const rename = vi.fn()
    const s = setup({ rename })
    const input = s.getAllByLabelText('Common event name')[0]
    fireEvent.change(input, { target: { value: 'intro' } })
    expect(s.getByRole('alert')).toHaveTextContent(/already called/)
    fireEvent.blur(input)
    expect(rename).not.toHaveBeenCalled()
  })

  it('deleting an unused event is immediate, a used one asks and lists the callers', () => {
    const remove = vi.fn()
    const s = setup({ remove })
    fireEvent.click(s.getByRole('button', { name: 'Delete Intro' }))
    expect(remove).toHaveBeenCalledWith('intro')
    fireEvent.click(s.getByRole('button', { name: 'Delete Heal' }))
    expect(remove).toHaveBeenCalledTimes(1)
    expect(s.getByText('Town > Guard (Talk)')).toBeInTheDocument()
    fireEvent.click(s.getByRole('button', { name: 'Delete anyway' }))
    expect(remove).toHaveBeenLastCalledWith('heal')
  })

  it('opens the graph editor without state tabs', () => {
    const s = setup()
    fireEvent.click(s.getByRole('button', { name: 'Edit Heal' }))
    expect(screen.getByRole('dialog', { name: /Common event · Heal/ })).toBeInTheDocument()
    expect(screen.getByTestId('event-editor')).toBeInTheDocument()
    expect(screen.queryByText(/State 1/)).not.toBeInTheDocument()
  })
})
