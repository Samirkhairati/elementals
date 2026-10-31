// The node canvas of one event state (React Flow). A pure view of an EventGraph: every edit calls
// `onChange(newGraph)` once; dragging a node updates only local state until the drop, so a drag is one
// undo step. Shortcuts: Tab / right-click add a node, Delete removes, Ctrl+C/X/V/D copy, cut, paste and
// duplicate, Ctrl+G groups the selection in a frame, F fits the view.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnConnectEnd,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Frame, LayoutGrid, Plus, Scissors } from 'lucide-react'
import type { EventGraph, GraphIssue, SummaryContext } from '../../../../../shared/engine/types'
import { GRAPH_START, connect, disconnect, edgesOf, extractFragment, getNode, layoutGraph, moveNode, pasteFragment } from '../../../../../shared/engine/graph'
import { cn } from '@/lib/utils'
import {
  CommandNodeView,
  FrameNodeView,
  type CommandFlowNode,
  type CommandNodeData,
  type FrameFlowNode,
  type FrameNodeData,
} from './GraphNodeView'
import { NodePalette } from './NodePalette'
import {
  addCommandNode,
  addFrameAround,
  deleteNodes,
  duplicateNodes,
  moveFrame,
  readFragmentClipboard,
  removeFrame,
  snapToGrid,
  updateFrame,
  writeFragmentClipboard,
} from './graphModel'

const FRAME_PREFIX = 'frame:'
const nodeTypes = { command: CommandNodeView, frame: FrameNodeView } as unknown as NodeTypes

export interface GraphCanvasProps {
  graph: EventGraph
  /** Called once per edit with the complete new graph; `select` is the node the editor should select next. */
  onChange: (graph: EventGraph, select?: string | null) => void
  /** The node shown in the inspector (a single selected command node), or null. */
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Problems per node id, shown as badges. */
  issues: Map<string, GraphIssue[]>
  summaryContext: SummaryContext
  className?: string
}

interface PaletteState {
  /** Pixels inside the canvas. */
  x: number
  y: number
  from?: { nodeId: string; port: string }
  /** Drop position in graph coordinates. */
  at?: { x: number; y: number }
  title: string
}

const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function Canvas({ graph, onChange, selectedId, onSelect, issues, summaryContext, className }: GraphCanvasProps) {
  const rf = useReactFlow()
  const wrapRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 }) // last pointer position, graph coordinates
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedId ? [selectedId] : []))
  const [dragging, setDragging] = useState<Record<string, { x: number; y: number }>>({})
  const [palette, setPalette] = useState<PaletteState | null>(null)

  const graphRef = useRef(graph)
  graphRef.current = graph
  const commit = useCallback((next: EventGraph, select?: string | null) => onChange(next, select), [onChange])

  // The parent can select a node too (Problems list): follow it and bring the node into view.
  useEffect(() => {
    const own = selected.size === 1 ? [...selected][0] : null
    if (selectedId === own) return
    setSelected(new Set(selectedId ? [selectedId] : []))
    if (selectedId) void rf.fitView({ nodes: [{ id: selectedId }], maxZoom: 1, duration: 150 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const selectedNodeIds = useMemo(() => [...selected].filter((id) => !id.startsWith(FRAME_PREFIX)), [selected])
  const selectedFrameIds = useMemo(() => [...selected].filter((id) => id.startsWith(FRAME_PREFIX)).map((id) => id.slice(FRAME_PREFIX.length)), [selected])

  // ── React Flow nodes and edges, derived from the graph ──────────────────────────────────────────
  const frameCallbacks = useMemo(
    () => ({
      onTitle: (id: string, title: string) => commit(updateFrame(graphRef.current, id, { title })),
      onResize: (id: string, w: number, h: number, x: number, y: number) => commit(updateFrame(graphRef.current, id, { w: snapToGrid(w), h: snapToGrid(h), x: snapToGrid(x), y: snapToGrid(y) })),
    }),
    [commit],
  )

  const flowNodes = useMemo(() => {
    const frames: FrameFlowNode[] = graph.frames.map((f) => {
      const id = `${FRAME_PREFIX}${f.id}`
      const data: FrameNodeData = { frame: f, ...frameCallbacks }
      return { id, type: 'frame', position: dragging[id] ?? { x: f.x, y: f.y }, style: { width: f.w, height: f.h }, zIndex: -1, selected: selected.has(id), data }
    })
    const nodes: CommandFlowNode[] = graph.nodes.map((n) => {
      const data: CommandNodeData = { node: n, issues: issues.get(n.id) ?? [], summaryContext }
      return { id: n.id, type: 'command', position: dragging[n.id] ?? { x: n.x, y: n.y }, selected: selected.has(n.id), deletable: n.type !== GRAPH_START, data }
    })
    return [...frames, ...nodes] as Node[]
  }, [graph.frames, graph.nodes, issues, summaryContext, selected, dragging, frameCallbacks])

  const flowEdges = useMemo<Edge[]>(
    () => edgesOf(graph).map((e) => ({ id: e.id, source: e.from, sourceHandle: e.port, target: e.to, targetHandle: 'in', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } })),
    [graph],
  )

  // ── events from React Flow ───────────────────────────────────────────────────────────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let nextSelected: Set<string> | null = null
      for (const c of changes) {
        if (c.type === 'select') {
          nextSelected ??= new Set(selected)
          if (c.selected) nextSelected.add(c.id)
          else nextSelected.delete(c.id)
        } else if (c.type === 'position' && c.dragging && c.position) {
          const { id, position } = c as { id: string; position: { x: number; y: number } }
          setDragging((d) => ({ ...d, [id]: position }))
        }
      }
      if (nextSelected) {
        setSelected(nextSelected)
        const commands = [...nextSelected].filter((id) => !id.startsWith(FRAME_PREFIX))
        onSelect(commands.length === 1 && nextSelected.size === 1 ? commands[0] : null)
      }
    },
    [selected, onSelect],
  )

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: Node, moved: Node[]) => {
      let next = graphRef.current
      for (const m of moved) {
        if (m.id.startsWith(FRAME_PREFIX)) {
          const frame = next.frames.find((f) => f.id === m.id.slice(FRAME_PREFIX.length))
          if (frame) next = moveFrame(next, frame.id, snapToGrid(m.position.x) - frame.x, snapToGrid(m.position.y) - frame.y)
        } else {
          next = moveNode(next, m.id, snapToGrid(m.position.x), snapToGrid(m.position.y))
        }
      }
      setDragging({})
      if (next !== graphRef.current) commit(next)
    },
    [commit],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.sourceHandle) commit(connect(graphRef.current, c.source, c.sourceHandle, c.target))
    },
    [commit],
  )

  const isValidConnection = useCallback(
    (c: { source: string; target: string }) => c.source !== c.target && getNode(graphRef.current, c.target)?.type !== GRAPH_START,
    [],
  )

  const onDelete = useCallback(
    ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      let next = graphRef.current
      for (const e of edges) next = disconnect(next, e.source, e.sourceHandle ?? 'next')
      next = deleteNodes(next, nodes.filter((n) => !n.id.startsWith(FRAME_PREFIX)).map((n) => n.id))
      for (const n of nodes) if (n.id.startsWith(FRAME_PREFIX)) next = removeFrame(next, n.id.slice(FRAME_PREFIX.length))
      setSelected(new Set())
      onSelect(null)
      commit(next)
    },
    [commit, onSelect],
  )

  const openPaletteAtPointer = useCallback(
    (clientX: number, clientY: number, extra: Partial<PaletteState> = {}) => {
      const box = wrapRef.current?.getBoundingClientRect()
      const at = rf.screenToFlowPosition({ x: clientX, y: clientY })
      setPalette({
        x: Math.max(8, Math.min(clientX - (box?.left ?? 0), (box?.width ?? 600) - 310)),
        y: Math.max(8, Math.min(clientY - (box?.top ?? 0), (box?.height ?? 400) - 330)),
        at,
        title: 'Add a node',
        ...extra,
      })
    },
    [rf],
  )

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      // A wire dropped on empty canvas: offer a node to create there and connect.
      if (state.isValid || !state.fromNode || state.fromHandle?.type !== 'source' || !state.fromHandle.id) return
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      openPaletteAtPointer(point.clientX, point.clientY, { from: { nodeId: state.fromNode.id, port: state.fromHandle.id }, title: 'Add and connect' })
    },
    [openPaletteAtPointer],
  )

  // ── toolbar / keyboard actions ───────────────────────────────────────────────────────────────────
  const pick = (type: string) => {
    if (!palette) return
    const r = addCommandNode(graphRef.current, type, { from: palette.from, at: palette.from ? undefined : palette.at })
    setPalette(null)
    if (r.id) {
      commit(r.graph, r.id)
      setSelected(new Set([r.id]))
      onSelect(r.id)
    }
  }

  const copySelection = useCallback(async () => {
    const fragment = extractFragment(graphRef.current, selectedNodeIds)
    if (fragment.nodes.length > 0) await writeFragmentClipboard(fragment)
    return fragment.nodes.length > 0
  }, [selectedNodeIds])

  const removeSelection = useCallback(
    (dissolve: boolean) => {
      let next = deleteNodes(graphRef.current, selectedNodeIds, dissolve)
      for (const id of selectedFrameIds) next = removeFrame(next, id)
      if (next === graphRef.current) return
      setSelected(new Set())
      onSelect(null)
      commit(next)
    },
    [commit, onSelect, selectedNodeIds, selectedFrameIds],
  )

  const paste = useCallback(async () => {
    const fragment = await readFragmentClipboard()
    if (!fragment) return
    const r = pasteFragment(graphRef.current, fragment, { x: snapToGrid(pointer.current.x), y: snapToGrid(pointer.current.y) })
    if (r.ids.length === 0) return
    commit(r.graph, r.ids[0])
    setSelected(new Set(r.ids))
    onSelect(r.ids.length === 1 ? r.ids[0] : null)
  }, [commit, onSelect])

  const duplicate = useCallback(() => {
    const r = duplicateNodes(graphRef.current, selectedNodeIds)
    if (r.ids.length === 0) return
    commit(r.graph, r.ids[0])
    setSelected(new Set(r.ids))
    onSelect(r.ids.length === 1 ? r.ids[0] : null)
  }, [commit, onSelect, selectedNodeIds])

  const group = useCallback(() => {
    const r = addFrameAround(graphRef.current, selectedNodeIds)
    if (r.id) commit(r.graph)
  }, [commit, selectedNodeIds])

  const autoLayout = () => {
    const next = layoutGraph(graphRef.current)
    if (next !== graphRef.current) commit(next)
    window.setTimeout(() => void rf.fitView({ maxZoom: 1, padding: 0.3, duration: 200 }), 0)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTyping(e.target) || palette) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (mod && key === 'c') {
      e.preventDefault()
      void copySelection()
    } else if (mod && key === 'x') {
      e.preventDefault()
      void copySelection().then((copied) => copied && removeSelection(false))
    } else if (mod && key === 'v') {
      e.preventDefault()
      void paste()
    } else if (mod && key === 'd') {
      e.preventDefault()
      duplicate()
    } else if (mod && key === 'g') {
      e.preventDefault()
      group()
    } else if (!mod && key === 'f') {
      void rf.fitView({ maxZoom: 1, padding: 0.3, duration: 200 })
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const box = wrapRef.current?.getBoundingClientRect()
      openPaletteAtPointer((box?.left ?? 0) + (box?.width ?? 600) / 2 - 150, (box?.top ?? 0) + 60, { title: 'Add a node' })
    }
  }

  const hasNodeSelection = selectedNodeIds.some((id) => getNode(graph, id)?.type !== GRAPH_START)

  return (
    <div ref={wrapRef} className={cn('relative min-h-0 flex-1', className)} data-testid="graph-canvas" onKeyDown={onKeyDown}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onDelete={onDelete}
        onPaneClick={() => {
          setPalette(null)
          setSelected(new Set())
          onSelect(null)
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          openPaletteAtPointer(e.clientX, e.clientY)
        }}
        onPaneMouseMove={(e) => {
          pointer.current = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        }}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
        minZoom={0.2}
        maxZoom={1.75}
        colorMode="system"
        nodesConnectable
        elementsSelectable
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable style={{ width: 140, height: 90 }} className="!hidden xl:!block" />
      </ReactFlow>

      <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-background/90 p-1 shadow-sm" role="toolbar" aria-label="Graph tools">
        <ToolButton
          label="Add node"
          onClick={() => {
            const box = wrapRef.current?.getBoundingClientRect()
            openPaletteAtPointer((box?.left ?? 0) + 8, (box?.top ?? 0) + 44, { title: 'Add a node' })
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add node
        </ToolButton>
        <ToolButton label="Auto layout" onClick={autoLayout}>
          <LayoutGrid className="h-3.5 w-3.5" /> Layout
        </ToolButton>
        <ToolButton label="Group in a frame" disabled={!hasNodeSelection} onClick={group}>
          <Frame className="h-3.5 w-3.5" /> Group
        </ToolButton>
        <ToolButton label="Remove and reconnect" disabled={!hasNodeSelection} onClick={() => removeSelection(true)}>
          <Scissors className="h-3.5 w-3.5" /> Cut out
        </ToolButton>
      </div>

      {palette && <NodePalette x={palette.x} y={palette.y} title={palette.title} onPick={pick} onClose={() => setPalette(null)} />}
    </div>
  )
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-foreground hover:bg-accent disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
