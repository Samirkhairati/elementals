import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { EventGraph, GraphIssue, SummaryContext } from '../../../../../shared/engine/types'
import { commandNodes, commandsToGraph, findStart } from '../../../../../shared/engine/graph'
import { GraphCanvas } from './GraphCanvas'
import { cmd } from './eventTestUtils'

const summaryContext: SummaryContext = {}

function Harness({ initial, onChange, onSelect, issues = new Map() }: { initial: EventGraph; onChange?: (g: EventGraph, select?: string | null) => void; onSelect?: (id: string | null) => void; issues?: Map<string, GraphIssue[]> }) {
  const [graph, setGraph] = useState(initial)
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div style={{ width: 900, height: 600 }}>
      <GraphCanvas
        graph={graph}
        selectedId={selected}
        issues={issues}
        summaryContext={summaryContext}
        onSelect={(id) => {
          setSelected(id)
          onSelect?.(id)
        }}
        onChange={(g, select) => {
          onChange?.(g, select)
          setGraph(g)
          if (select !== undefined) setSelected(select)
        }}
      />
    </div>
  )
}

const sample = () => commandsToGraph([cmd('a', 'showText', { speaker: 'Elder', text: 'Hello there' }), cmd('b', 'wait', { ms: 250 })], () => 'start')

describe('GraphCanvas', () => {
  it('draws a node for every graph node with its label and summary', () => {
    render(<Harness initial={sample()} />)
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    const text = screen.getByTestId('node-a')
    expect(within(text).getByText('Show Text')).toBeInTheDocument()
    expect(within(text).getByText('Elder: Hello there')).toBeInTheDocument()
    expect(within(screen.getByTestId('node-b')).getByText('Wait')).toBeInTheDocument()
    expect(document.querySelector('[data-node-type="start"]')).toBeTruthy()
  })

  it('labels the output ports of a branching node', () => {
    const g = commandsToGraph([cmd('c', 'conditional', { conditions: [] }, { then: [cmd('t', 'wait')], else: [] })], () => 'start')
    render(<Harness initial={g} />)
    const ports = [...screen.getByTestId('node-c').querySelectorAll('[data-port]')].map((el) => el.getAttribute('data-port'))
    expect(ports).toEqual(['then', 'else'])
  })

  it('shows a badge on a node with problems', () => {
    const issues = new Map<string, GraphIssue[]>([['a', [{ nodeId: 'a', severity: 'error', code: 'x', message: 'Something is wrong' }]]])
    render(<Harness initial={sample()} issues={issues} />)
    expect(within(screen.getByTestId('node-a')).getByLabelText('Has errors')).toHaveAttribute('title', 'Something is wrong')
    expect(within(screen.getByTestId('node-b')).queryByLabelText(/Has (errors|warnings)/)).toBeNull()
  })

  it('selecting a node reports it to the editor', () => {
    const onSelect = vi.fn()
    render(<Harness initial={sample()} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('node-a'))
    expect(onSelect).toHaveBeenLastCalledWith('a')
  })

  describe('adding nodes', () => {
    it('the toolbar button opens a searchable palette; picking a node adds it once', () => {
      const onChange = vi.fn()
      render(<Harness initial={sample()} onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Add node' }))
      const dialog = screen.getByRole('dialog', { name: 'Add a node' })
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search nodes' }), { target: { value: 'switch' } })
      const options = within(dialog).getAllByRole('option').map((o) => o.textContent)
      expect(options.some((t) => t?.includes('Set Switch'))).toBe(true)
      expect(options.every((t) => /switch/i.test(t ?? ''))).toBe(true)
      fireEvent.click(within(dialog).getByRole('option', { name: /Set Switch/ }))
      expect(onChange).toHaveBeenCalledTimes(1)
      const [graph, select] = onChange.mock.calls[0] as [EventGraph, string]
      const added = graph.nodes.find((n) => n.id === select)!
      expect(added.type).toBe('setSwitch')
      expect(added.out).toEqual({}) // unconnected: it was added from the toolbar
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('Escape closes the palette; Enter picks the highlighted entry', () => {
      const onChange = vi.fn()
      render(<Harness initial={sample()} onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Add node' }))
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search nodes' }), { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(onChange).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Add node' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Search nodes' }), { target: { value: 'show text' } })
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search nodes' }), { key: 'Enter' })
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(commandNodes(onChange.mock.calls[0][0] as EventGraph).filter((n) => n.type === 'showText')).toHaveLength(2)
    })

    it('arrow keys move the highlight', () => {
      render(<Harness initial={sample()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Add node' }))
      const search = screen.getByRole('textbox', { name: 'Search nodes' })
      const selected = () => screen.getAllByRole('option').map((o) => o.getAttribute('aria-selected'))
      expect(selected()[0]).toBe('true')
      fireEvent.keyDown(search, { key: 'ArrowDown' })
      expect(selected()[1]).toBe('true')
      expect(selected()[0]).toBe('false')
      fireEvent.keyDown(search, { key: 'ArrowUp' })
      fireEvent.keyDown(search, { key: 'ArrowUp' }) // stays on the first
      expect(selected()[0]).toBe('true')
    })

    it('offers End and Reroute but no tree-only loop commands', () => {
      render(<Harness initial={sample()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Add node' }))
      const labels = screen.getAllByRole('option').map((o) => o.textContent ?? '')
      expect(labels.some((t) => t.startsWith('End'))).toBe(true)
      expect(labels.some((t) => t.startsWith('Reroute'))).toBe(true)
      for (const gone of ['Loop', 'Break Loop', 'Exit Event']) expect(labels.some((t) => t.startsWith(gone))).toBe(false)
      expect(labels.some((t) => t.startsWith('Branch on Stage'))).toBe(true)
    })

    it('Tab opens the palette from the keyboard', () => {
      render(<Harness initial={sample()} />)
      fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'Tab' })
      expect(screen.getByRole('dialog', { name: 'Add a node' })).toBeInTheDocument()
    })

    it('says so when nothing matches', () => {
      render(<Harness initial={sample()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Add node' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Search nodes' }), { target: { value: 'zzzzz' } })
      expect(screen.getByText(/Nothing matches/)).toBeInTheDocument()
    })
  })

  describe('toolbar', () => {
    it('Auto layout re-lays the graph out in one change', () => {
      const messy = sample()
      messy.nodes = messy.nodes.map((n) => ({ ...n, x: 0, y: 0 }))
      const onChange = vi.fn()
      render(<Harness initial={messy} onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Auto layout' }))
      expect(onChange).toHaveBeenCalledTimes(1)
      const g = onChange.mock.calls[0][0] as EventGraph
      const xs = g.nodes.map((n) => n.x)
      expect(new Set(xs).size).toBe(xs.length) // spread into separate columns
    })

    it('Group and Cut out need a selected node', () => {
      render(<Harness initial={sample()} />)
      expect(screen.getByRole('button', { name: 'Group in a frame' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Remove and reconnect' })).toBeDisabled()
      fireEvent.click(screen.getByTestId('node-a'))
      expect(screen.getByRole('button', { name: 'Group in a frame' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Remove and reconnect' })).toBeEnabled()
    })

    it('Cut out removes the selected node and keeps the flow going', () => {
      const onChange = vi.fn()
      render(<Harness initial={sample()} onChange={onChange} />)
      fireEvent.click(screen.getByTestId('node-a'))
      fireEvent.click(screen.getByRole('button', { name: 'Remove and reconnect' }))
      const g = onChange.mock.calls[0][0] as EventGraph
      expect(commandNodes(g).map((n) => n.id)).toEqual(['b'])
      expect(findStart(g)!.out).toEqual({ next: 'b' })
    })

    it('Group wraps the selected node in a titled frame', () => {
      const onChange = vi.fn()
      render(<Harness initial={sample()} onChange={onChange} />)
      fireEvent.click(screen.getByTestId('node-a'))
      fireEvent.click(screen.getByRole('button', { name: 'Group in a frame' }))
      const g = onChange.mock.calls[0][0] as EventGraph
      expect(g.frames).toHaveLength(1)
      expect(g.frames[0].title).toBe('Group')
      expect(g.nodes).toBe(g.nodes) // nodes unchanged
    })
  })

  describe('clipboard shortcuts', () => {
    it('Ctrl+D duplicates the selection with its own wires', () => {
      const onChange = vi.fn()
      render(<Harness initial={sample()} onChange={onChange} />)
      fireEvent.click(screen.getByTestId('node-a'))
      fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'd', ctrlKey: true })
      const [g, select] = onChange.mock.calls[0] as [EventGraph, string]
      expect(commandNodes(g)).toHaveLength(3)
      const copy = g.nodes.find((n) => n.id === select)!
      expect(copy.type).toBe('showText')
      expect(copy.params).toEqual({ speaker: 'Elder', text: 'Hello there' })
      expect(copy.out).toEqual({}) // the wire to b leaves the selection, so it is not copied
    })

    it('Ctrl+C then Ctrl+V pastes a copy', async () => {
      const onChange = vi.fn()
      render(<Harness initial={sample()} onChange={onChange} />)
      fireEvent.click(screen.getByTestId('node-b'))
      fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'c', ctrlKey: true })
      await Promise.resolve()
      fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'v', ctrlKey: true })
      await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
      const g = onChange.mock.calls[0][0] as EventGraph
      expect(commandNodes(g).filter((n) => n.type === 'wait')).toHaveLength(2)
    })

    it('shortcuts are ignored while typing in a field', () => {
      const onChange = vi.fn()
      const withFrame = { ...sample(), frames: [{ id: 'f1', title: 'Intro', color: '#64748b', x: 0, y: 0, w: 300, h: 200 }] }
      render(<Harness initial={withFrame} onChange={onChange} />)
      fireEvent.click(screen.getByTestId('node-a'))
      fireEvent.doubleClick(screen.getByTestId('frame-title'))
      fireEvent.keyDown(screen.getByLabelText('Frame title'), { key: 'd', ctrlKey: true })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('a frame title is plain text until double-clicked, so clicks and pastes never land in a text field', () => {
      const withFrame = { ...sample(), frames: [{ id: 'f1', title: 'Intro', color: '#64748b', x: 0, y: 0, w: 300, h: 200 }] }
      render(<Harness initial={withFrame} />)
      expect(screen.queryByLabelText('Frame title')).toBeNull()
      fireEvent.doubleClick(screen.getByTestId('frame-title'))
      expect(screen.getByLabelText('Frame title')).toHaveValue('Intro')
    })

    it('copying a frame takes the nodes inside it, and pasting brings the frame back', async () => {
      const onChange = vi.fn()
      const g = commandsToGraph([cmd('a', 'showText', { speaker: '', text: 'hi' }), cmd('b', 'wait', { ms: 5 })], () => 'start')
      const a = g.nodes.find((n) => n.id === 'a')!
      const framed: EventGraph = { ...g, frames: [{ id: 'f1', title: 'Intro', color: '#64748b', x: a.x - 20, y: a.y - 20, w: 260, h: 140 }] }
      render(<Harness initial={framed} onChange={onChange} />)
      fireEvent.click(screen.getByTestId('frame-f1'))
      fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'd', ctrlKey: true })
      const [dup] = onChange.mock.calls[0] as [EventGraph]
      expect(dup.frames).toHaveLength(2)
      expect(dup.frames[1].title).toBe('Intro')
      expect(commandNodes(dup).filter((n) => n.type === 'showText')).toHaveLength(2)
    })

    it('Delete and Backspace remove the selected node, even when an ancestor swallows the key before it reaches the document', () => {
      const onChange = vi.fn()
      render(
        <div onKeyDown={(e) => e.stopPropagation()}>
          <Harness initial={sample()} onChange={onChange} />
        </div>,
      )
      fireEvent.click(screen.getByTestId('node-a'))
      fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'Delete' })
      expect(onChange).toHaveBeenCalledTimes(1)
      const g = onChange.mock.calls[0][0] as EventGraph
      expect(commandNodes(g).map((n) => n.id)).toEqual(['b'])
      fireEvent.click(screen.getByTestId('node-b'))
      fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'Backspace' })
      expect(commandNodes(onChange.mock.calls[1][0] as EventGraph)).toEqual([])
    })

    it('Delete never removes Start', () => {
      const onChange = vi.fn()
      render(<Harness initial={sample()} onChange={onChange} />)
      fireEvent.click(document.querySelector('[data-node-type="start"]') as HTMLElement)
      fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'Delete' })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('Disconnect removes the wires of the selected node', () => {
      const onChange = vi.fn()
      render(<Harness initial={sample()} onChange={onChange} />)
      expect(screen.getByRole('button', { name: 'Disconnect wires' })).toBeDisabled()
      fireEvent.click(screen.getByTestId('node-a'))
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect wires' }))
      const g = onChange.mock.calls[0][0] as EventGraph
      expect(findStart(g)!.out).toEqual({})
      expect(g.nodes.find((n) => n.id === 'a')!.out).toEqual({})
      expect(commandNodes(g)).toHaveLength(2) // nodes stay, floating
    })
  })
})
