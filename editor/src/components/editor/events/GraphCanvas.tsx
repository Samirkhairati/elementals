// The node canvas of one event state (React Flow). A pure view of an EventGraph: every edit calls
// `onChange(newGraph)` once; dragging a node updates only local state until the drop, so a drag is one
// undo step. Shortcuts: Tab / right-click on empty canvas add a node, right-click on a node, frame or wire opens its menu, Delete removes, Ctrl+C/X/V/D copy, cut, paste and
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
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnConnectEnd,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Copy, CopyPlus, Frame, LayoutGrid, Plus, Scissors, Trash2, Unplug } from 'lucide-react'
import type { EventGraph, GraphIssue, SummaryContext } from '../../../../../shared/engine/types'
import { GRAPH_START, connect, disconnect, edgesOf, extractFragment, getNode, layoutGraph, moveNode, pasteFragment, reachableFromStart } from '../../../../../shared/engine/graph'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/store/themeStore'
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
  disconnectNodes,
  duplicateNodes,
  moveFrame,
  nodesInFrame,
  readFragmentClipboard,
  removeFrame,
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

interface MenuState {
  /** Pixels inside the canvas. */
  x: number
  y: number
  /** A wire was right-clicked (its own menu), otherwise the current selection. */
  edge?: string
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
  // React Flow reports each node's rendered size through `dimensions` changes. The nodes below are rebuilt
  // on every render, so the sizes must be fed back or the nodes lose them: they flash hidden until
  // re-measured and the minimap has nothing to draw.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({})
  const themeMode = useThemeStore((s) => s.mode)
  const [palette, setPalette] = useState<PaletteState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(() => new Set())
  // Set while a wire end is being dragged: dropping it on a handle reconnects it, dropping it on nothing removes the wire.
  const reconnected = useRef(false)

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
      onResize: (id: string, w: number, h: number, x: number, y: number) => commit(updateFrame(graphRef.current, id, { w: Math.round(w), h: Math.round(h), x: Math.round(x), y: Math.round(y) })),
    }),
    [commit],
  )

  // Nodes Start does not lead to are fine (scratch space) but drawn dimmed so it is clear they never run.
  const live = useMemo(() => reachableFromStart(graph), [graph])

  const flowNodes = useMemo(() => {
    const frames: FrameFlowNode[] = graph.frames.map((f) => {
      const id = `${FRAME_PREFIX}${f.id}`
      const data: FrameNodeData = { frame: f, ...frameCallbacks }
      return { id, type: 'frame', position: dragging[id] ?? { x: f.x, y: f.y }, style: { width: f.w, height: f.h }, zIndex: -1, selected: selected.has(id), measured: measured[id], data }
    })
    const nodes: CommandFlowNode[] = graph.nodes.map((n) => {
      const data: CommandNodeData = { node: n, issues: issues.get(n.id) ?? [], summaryContext, floating: !live.has(n.id) && n.type !== GRAPH_START }
      return { id: n.id, type: 'command', position: dragging[n.id] ?? { x: n.x, y: n.y }, selected: selected.has(n.id), deletable: n.type !== GRAPH_START, measured: measured[n.id], data }
    })
    return [...frames, ...nodes] as Node[]
  }, [graph, live, issues, summaryContext, selected, dragging, measured, frameCallbacks])

  const flowEdges = useMemo<Edge[]>(
    () => edgesOf(graph).map((e) => ({ id: e.id, source: e.from, sourceHandle: e.port, target: e.to, targetHandle: 'in', type: 'smoothstep', selected: selectedEdges.has(e.id), markerEnd: { type: MarkerType.ArrowClosed } })),
    [graph, selectedEdges],
  )

  // ── events from React Flow ───────────────────────────────────────────────────────────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let nextSelected: Set<string> | null = null
      let sizes: Record<string, { width: number; height: number }> | null = null
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) {
          const { width, height } = c.dimensions
          sizes ??= {}
          sizes[c.id] = { width, height }
        } else if (c.type === 'select') {
          nextSelected ??= new Set(selected)
          if (c.selected) nextSelected.add(c.id)
          else nextSelected.delete(c.id)
        } else if (c.type === 'position' && c.dragging && c.position) {
          const { id, position } = c as { id: string; position: { x: number; y: number } }
          setDragging((d) => {
            const next = { ...d, [id]: position }
            // The nodes inside a frame travel with it while it is dragged, not after the drop.
            const frame = id.startsWith(FRAME_PREFIX) ? graphRef.current.frames.find((f) => f.id === id.slice(FRAME_PREFIX.length)) : undefined
            if (frame) {
              const dx = position.x - frame.x
              const dy = position.y - frame.y
              for (const n of nodesInFrame(graphRef.current, frame.id)) next[n.id] = { x: n.x + dx, y: n.y + dy }
            }
            return next
          })
        }
      }
      if (sizes) {
        const fresh = sizes
        setMeasured((m) => {
          const changed = Object.keys(fresh).filter((id) => m[id]?.width !== fresh[id].width || m[id]?.height !== fresh[id].height)
          return changed.length === 0 ? m : { ...m, ...Object.fromEntries(changed.map((id) => [id, fresh[id]])) }
        })
      }
      if (nextSelected) {
        setSelected(nextSelected)
        const commands = [...nextSelected].filter((id) => !id.startsWith(FRAME_PREFIX))
        onSelect(commands.length === 1 && nextSelected.size === 1 ? commands[0] : null)
      }
    },
    [selected, onSelect],
  )

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const picks = changes.filter((c): c is Extract<EdgeChange, { type: 'select' }> => c.type === 'select')
    if (picks.length === 0) return
    setSelectedEdges((prev) => {
      const next = new Set(prev)
      for (const c of picks) {
        if (c.selected) next.add(c.id)
        else next.delete(c.id)
      }
      return next
    })
  }, [])

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: Node, moved: Node[]) => {
      let next = graphRef.current
      for (const m of moved) {
        if (m.id.startsWith(FRAME_PREFIX)) {
          const frame = next.frames.find((f) => f.id === m.id.slice(FRAME_PREFIX.length))
          if (frame) next = moveFrame(next, frame.id, Math.round(m.position.x) - frame.x, Math.round(m.position.y) - frame.y)
        } else {
          next = moveNode(next, m.id, Math.round(m.position.x), Math.round(m.position.y))
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
      setSelectedEdges(new Set())
      onSelect(null)
      commit(next)
    },
    [commit, onSelect],
  )

  const onReconnect = useCallback(
    (old: Edge, c: Connection) => {
      reconnected.current = true
      if (!c.source || !c.target || !c.sourceHandle) return
      commit(connect(disconnect(graphRef.current, old.source, old.sourceHandle ?? 'next'), c.source, c.sourceHandle, c.target))
      setSelectedEdges(new Set())
    },
    [commit],
  )

  const onReconnectEnd = useCallback(
    (_event: unknown, edge: Edge) => {
      if (reconnected.current) return
      commit(disconnect(graphRef.current, edge.source, edge.sourceHandle ?? 'next'))
      setSelectedEdges(new Set())
    },
    [commit],
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

  // Copying or cutting a frame takes the nodes inside it along.
  const withFrameContents = useCallback(() => {
    const ids = new Set(selectedNodeIds)
    for (const frameId of selectedFrameIds) for (const n of nodesInFrame(graphRef.current, frameId)) ids.add(n.id)
    return [...ids]
  }, [selectedNodeIds, selectedFrameIds])

  const copySelection = useCallback(async () => {
    const fragment = extractFragment(graphRef.current, withFrameContents(), selectedFrameIds)
    const copied = fragment.nodes.length > 0 || (fragment.frames?.length ?? 0) > 0
    if (copied) await writeFragmentClipboard(fragment)
    return copied
  }, [withFrameContents, selectedFrameIds])

  const removeSelection = useCallback(
    (dissolve: boolean, withContents = false) => {
      let next = deleteNodes(graphRef.current, withContents ? withFrameContents() : selectedNodeIds, dissolve)
      for (const id of selectedFrameIds) next = removeFrame(next, id)
      if (next === graphRef.current) return
      setSelected(new Set())
      onSelect(null)
      commit(next)
    },
    [commit, onSelect, selectedNodeIds, selectedFrameIds, withFrameContents],
  )

  // Delete / Backspace. React Flow's own delete key listens on `document`, which the event editor dialog never
  // lets these keys reach (it stops them so the map editor's shortcuts stay quiet), so the canvas handles them.
  const deleteSelection = useCallback(() => {
    let next = graphRef.current
    for (const id of selectedEdges) {
      const edge = edgesOf(next).find((e) => e.id === id)
      if (edge) next = disconnect(next, edge.from, edge.port)
    }
    next = deleteNodes(next, selectedNodeIds)
    for (const id of selectedFrameIds) next = removeFrame(next, id)
    if (next === graphRef.current) return
    setSelected(new Set())
    setSelectedEdges(new Set())
    onSelect(null)
    commit(next)
  }, [commit, onSelect, selectedEdges, selectedNodeIds, selectedFrameIds])

  const paste = useCallback(async () => {
    const fragment = await readFragmentClipboard()
    if (!fragment) return
    const r = pasteFragment(graphRef.current, fragment, { x: Math.round(pointer.current.x), y: Math.round(pointer.current.y) })
    if (r.ids.length === 0 && r.frameIds.length === 0) return
    commit(r.graph, r.ids[0])
    setSelected(new Set([...r.ids, ...r.frameIds.map((id) => FRAME_PREFIX + id)]))
    onSelect(r.ids.length === 1 && r.frameIds.length === 0 ? r.ids[0] : null)
  }, [commit, onSelect])

  const duplicate = useCallback(() => {
    const r = duplicateNodes(graphRef.current, withFrameContents(), undefined, selectedFrameIds)
    if (r.ids.length === 0 && r.frameIds.length === 0) return
    commit(r.graph, r.ids[0])
    setSelected(new Set([...r.ids, ...r.frameIds.map((id) => FRAME_PREFIX + id)]))
    onSelect(r.ids.length === 1 && r.frameIds.length === 0 ? r.ids[0] : null)
  }, [commit, onSelect, withFrameContents, selectedFrameIds])

  const disconnectSelection = useCallback(() => {
    let next = graphRef.current
    for (const id of selectedEdges) {
      const edge = edgesOf(next).find((e) => e.id === id)
      if (edge) next = disconnect(next, edge.from, edge.port)
    }
    next = disconnectNodes(next, selectedNodeIds)
    setSelectedEdges(new Set())
    if (next !== graphRef.current) commit(next)
  }, [commit, selectedEdges, selectedNodeIds])

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
    if (e.key === 'Escape' && menu) {
      setMenu(null)
      return
    }
    if (isTyping(e.target) || palette) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault()
      deleteSelection()
    } else if (mod && key === 'c') {
      e.preventDefault()
      void copySelection()
    } else if (mod && key === 'x') {
      e.preventDefault()
      void copySelection().then((copied) => copied && removeSelection(false, true))
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

  // ── right-click menu ─────────────────────────────────────────────────────────────────────────────
  const menuAt = (e: React.MouseEvent, extra: Partial<MenuState> = {}) => {
    e.preventDefault()
    const box = wrapRef.current?.getBoundingClientRect()
    setPalette(null)
    setMenu({ x: Math.max(4, Math.min(e.clientX - (box?.left ?? 0), (box?.width ?? 600) - 200)), y: Math.max(4, Math.min(e.clientY - (box?.top ?? 0), (box?.height ?? 400) - 190)), ...extra })
  }

  const onNodeContextMenu = (e: React.MouseEvent, node: Node) => {
    // Right-clicking something outside the selection selects just that; inside it, the menu acts on all of it.
    if (!selected.has(node.id)) {
      setSelected(new Set([node.id]))
      setSelectedEdges(new Set())
      onSelect(node.id.startsWith(FRAME_PREFIX) ? null : node.id)
    }
    menuAt(e)
  }

  const onEdgeContextMenu = (e: React.MouseEvent, edge: Edge) => {
    setSelected(new Set())
    setSelectedEdges(new Set([edge.id]))
    onSelect(null)
    menuAt(e, { edge: edge.id })
  }

  const hasNodeSelection = selectedNodeIds.some((id) => getNode(graph, id)?.type !== GRAPH_START)

  return (
    <div ref={wrapRef} tabIndex={-1} className={cn('relative min-h-0 flex-1 outline-none', className)} data-testid="graph-canvas" onKeyDown={onKeyDown}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        edgesReconnectable
        onReconnect={onReconnect}
        onReconnectStart={() => {
          reconnected.current = false
        }}
        onReconnectEnd={onReconnectEnd}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onDelete={onDelete}
        onPaneClick={() => {
          // Focus the canvas so Ctrl+C / Ctrl+V / Delete reach it even when nothing inside it has focus.
          wrapRef.current?.focus({ preventScroll: true })
          setPalette(null)
          setMenu(null)
          setSelectedEdges(new Set())
          setSelected(new Set())
          onSelect(null)
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          setMenu(null)
          openPaletteAtPointer(e.clientX, e.clientY)
        }}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onSelectionContextMenu={(e) => menuAt(e)}
        onMoveStart={() => setMenu(null)}
        onPaneMouseMove={(e) => {
          pointer.current = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        }}
        deleteKeyCode={null}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
        minZoom={0.2}
        maxZoom={1.75}
        colorMode={themeMode}
        nodesConnectable
        elementsSelectable
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          style={{ width: 140, height: 90 }}
          className="!hidden xl:!block"
          bgColor="hsl(var(--card))"
          maskColor="hsl(var(--background) / 0.65)"
          nodeColor="hsl(var(--muted-foreground))"
          nodeStrokeWidth={0}
        />
      </ReactFlow>

      <div className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-background/90 p-1 shadow-md backdrop-blur" role="toolbar" aria-label="Graph tools">
        <ToolButton
          label="Add node"
          hint="Tab"
          onClick={() => {
            const box = wrapRef.current?.getBoundingClientRect()
            openPaletteAtPointer((box?.left ?? 0) + 8, (box?.top ?? 0) + 44, { title: 'Add a node' })
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add node
        </ToolButton>
        <ToolSeparator />
        <ToolButton label="Auto layout" hint="arranges every node" onClick={autoLayout}>
          <LayoutGrid className="h-3.5 w-3.5" /> Layout
        </ToolButton>
        <ToolSeparator />
        <ToolButton label="Group in a frame" hint="Ctrl+G" disabled={!hasNodeSelection} onClick={group}>
          <Frame className="h-3.5 w-3.5" /> Group
        </ToolButton>
        <ToolButton label="Disconnect wires" hint="removes every wire of the selection" disabled={!hasNodeSelection && selectedEdges.size === 0} onClick={disconnectSelection}>
          <Unplug className="h-3.5 w-3.5" /> Disconnect
        </ToolButton>
        <ToolButton label="Remove and reconnect" hint="deletes the node and joins its neighbours" disabled={!hasNodeSelection} onClick={() => removeSelection(true)}>
          <Scissors className="h-3.5 w-3.5" /> Cut out
        </ToolButton>
      </div>

      {menu && (
        <div
          role="menu"
          aria-label="Node actions"
          className="absolute z-20 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.edge ? (
            <MenuItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Delete wire"
              destructive
              onClick={() => {
                const edge = edgesOf(graphRef.current).find((x) => x.id === menu.edge)
                setMenu(null)
                setSelectedEdges(new Set())
                if (edge) commit(disconnect(graphRef.current, edge.from, edge.port))
              }}
            />
          ) : (
            <>
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label={selectedNodeIds.length + selectedFrameIds.length > 1 ? 'Delete selection' : selectedFrameIds.length > 0 ? 'Delete frame' : 'Delete node'}
                hint="Del"
                destructive
                disabled={!hasNodeSelection && selectedFrameIds.length === 0}
                onClick={() => {
                  setMenu(null)
                  deleteSelection()
                }}
              />
              <MenuItem
                icon={<Scissors className="h-3.5 w-3.5" />}
                label="Delete and reconnect"
                disabled={!hasNodeSelection}
                onClick={() => {
                  setMenu(null)
                  removeSelection(true)
                }}
              />
              <MenuSeparator />
              <MenuItem
                icon={<CopyPlus className="h-3.5 w-3.5" />}
                label="Duplicate"
                hint="Ctrl+D"
                disabled={!hasNodeSelection && selectedFrameIds.length === 0}
                onClick={() => {
                  setMenu(null)
                  duplicate()
                }}
              />
              <MenuItem
                icon={<Copy className="h-3.5 w-3.5" />}
                label="Copy"
                hint="Ctrl+C"
                disabled={!hasNodeSelection && selectedFrameIds.length === 0}
                onClick={() => {
                  setMenu(null)
                  void copySelection()
                }}
              />
              <MenuItem
                icon={<Unplug className="h-3.5 w-3.5" />}
                label="Disconnect wires"
                disabled={!hasNodeSelection}
                onClick={() => {
                  setMenu(null)
                  disconnectSelection()
                }}
              />
            </>
          )}
        </div>
      )}

      {palette && <NodePalette x={palette.x} y={palette.y} title={palette.title} onPick={pick} onClose={() => setPalette(null)} />}
    </div>
  )
}

function MenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-border" />
}

function MenuItem({ icon, label, hint, onClick, disabled, destructive }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
        destructive && 'text-destructive',
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  )
}

function ToolSeparator() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
}

function ToolButton({ label, hint, onClick, disabled, children }: { label: string; hint?: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
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
