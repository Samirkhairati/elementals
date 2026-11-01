// The look of a graph node on the canvas: a card with the command's icon and label, its summary line,
// one input handle on the left and one output handle per port on the right. Also the comment frame.

import React, { useState } from 'react'
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { AlertCircle, AlertTriangle, Flag, OctagonX } from 'lucide-react'
import type { GraphFrame, GraphIssue, GraphNode, SummaryContext } from '../../../../../shared/engine/types'
import { getCommandDef, summarizeCommand } from '../../../../../shared/engine/commands'
import { GRAPH_END, GRAPH_JUNCTION, GRAPH_START, getPortDefs } from '../../../../../shared/engine/graph'
import { cn } from '@/lib/utils'
import { CATEGORY_STYLES, CommandIcon, PlannedBadge } from './commandStyle'
import { worstSeverity } from './eventModel'

export interface CommandNodeData extends Record<string, unknown> {
  node: GraphNode
  issues: GraphIssue[]
  summaryContext: SummaryContext
  /** Nothing leads here from Start: allowed (scratch space), shown dimmed because it never runs. */
  floating?: boolean
}

export type CommandFlowNode = Node<CommandNodeData, 'command'>

export interface FrameNodeData extends Record<string, unknown> {
  frame: GraphFrame
  onTitle: (id: string, title: string) => void
  onResize: (id: string, w: number, h: number, x: number, y: number) => void
}

export type FrameFlowNode = Node<FrameNodeData, 'frame'>

const handleClass = '!h-2.5 !w-2.5 !border-2 !border-background !bg-muted-foreground hover:!bg-primary'

/** What the node says about itself: the catalog summary, or the full text for dialogue. */
export function nodeSummary(node: GraphNode, ctx: SummaryContext): string {
  if (node.type === 'showText') {
    const speaker = typeof node.params.speaker === 'string' ? node.params.speaker.trim() : ''
    const text = typeof node.params.text === 'string' ? node.params.text.trim() : ''
    if (!text) return speaker ? `${speaker}: (empty)` : '(empty text)'
    return speaker ? `${speaker}: ${text}` : text
  }
  return summarizeCommand(node, ctx)
}

function StructuralNode({ node, selected, floating }: { node: GraphNode; selected: boolean; floating?: boolean }) {
  if (node.type === GRAPH_JUNCTION) {
    return (
      <div className={cn('flex h-4 w-4 items-center justify-center rounded-full border-2 border-muted-foreground bg-background', selected && 'ring-2 ring-primary', floating && 'opacity-60')} title="Reroute" data-node-type="junction">
        <Handle type="target" position={Position.Left} id="in" className={handleClass} />
        <Handle type="source" position={Position.Right} id="next" className={handleClass} />
      </div>
    )
  }
  const isStart = node.type === GRAPH_START
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-semibold shadow-sm',
        isStart ? 'border-emerald-500/60 text-emerald-400' : 'border-red-500/50 text-red-400',
        selected && 'ring-2 ring-primary',
        floating && 'opacity-60',
      )}
      data-node-type={node.type}
    >
      {isStart ? <Flag className="h-3 w-3" aria-hidden /> : <OctagonX className="h-3 w-3" aria-hidden />}
      {isStart ? 'Start' : 'End'}
      {!isStart && <Handle type="target" position={Position.Left} id="in" className={handleClass} />}
      {isStart && <Handle type="source" position={Position.Right} id="next" className={handleClass} />}
    </div>
  )
}

export function CommandNodeView({ data, selected }: NodeProps<CommandFlowNode>) {
  const { node, issues, summaryContext, floating } = data
  if (node.type === GRAPH_START || node.type === GRAPH_END || node.type === GRAPH_JUNCTION) return <StructuralNode node={node} selected={!!selected} floating={floating} />

  const def = getCommandDef(node.type)
  const style = def ? CATEGORY_STYLES[def.category] : undefined
  const ports = getPortDefs(node)
  const worst = worstSeverity(issues)
  const labelled = ports.length > 1 || (ports.length === 1 && ports[0].label !== '')

  return (
    <div
      className={cn(
        'w-[220px] rounded-md border bg-card text-card-foreground shadow-sm',
        worst === 'error' ? 'border-red-500/70' : worst === 'warning' ? 'border-amber-500/60' : 'border-border',
        selected && 'ring-2 ring-primary',
        floating && 'opacity-60',
      )}
      data-node-type={node.type}
      data-testid={`node-${node.id}`}
      title={floating ? 'Not connected to Start, so this never runs' : undefined}
    >
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2 py-1">
        <CommandIcon icon={def?.icon} category={def?.category} />
        <span className={cn('truncate text-xs font-semibold', style?.text)}>{def?.label ?? 'Unknown command'}</span>
        {def?.status === 'planned' && <PlannedBadge />}
        {worst && (
          <span className="ml-auto shrink-0" title={issues.map((i) => i.message).join('\n')} aria-label={worst === 'error' ? 'Has errors' : 'Has warnings'}>
            {worst === 'error' ? <AlertCircle className="h-3.5 w-3.5 text-red-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
          </span>
        )}
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap break-words px-2 py-1.5 text-[11px] text-muted-foreground">{nodeSummary(node, summaryContext) || def?.description}</p>

      {labelled ? (
        <ul className="border-t border-border/60 py-0.5">
          {ports.map((p) => (
            <li key={p.id} className="relative px-2 py-0.5 text-right text-[10px] text-muted-foreground" data-port={p.id}>
              {p.label || 'Next'}
              <Handle type="source" position={Position.Right} id={p.id} className={handleClass} />
            </li>
          ))}
        </ul>
      ) : (
        ports.map((p) => <Handle key={p.id} type="source" position={Position.Right} id={p.id} className={handleClass} />)
      )}
    </div>
  )
}

/** A titled, coloured box behind a group of nodes. Moving it moves the nodes inside; it can be resized. */
export function FrameNodeView({ data, selected }: NodeProps<FrameFlowNode>) {
  const { frame, onTitle, onResize } = data
  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={120}
        minHeight={80}
        onResizeEnd={(_event, params) => onResize(frame.id, params.width, params.height, params.x, params.y)}
      />
      <div
        className="h-full w-full rounded-lg border-2 border-dashed"
        style={{ borderColor: frame.color, backgroundColor: `${frame.color}14` }}
        data-testid={`frame-${frame.id}`}
      >
        <FrameTitle title={frame.title} color={frame.color} onCommit={(title) => onTitle(frame.id, title)} />
      </div>
    </>
  )
}

/**
 * The title is plain text until it is double-clicked. An always-present input took the focus on every
 * click on the frame, so Ctrl+C / Ctrl+V landed in the text field (pasting raw clipboard text into the
 * title) instead of copying and pasting the frame.
 */
function FrameTitle({ title, color, onCommit }: { title: string; color: string; onCommit: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (!editing) {
    return (
      <div className="m-1 cursor-grab select-none truncate px-1 text-xs font-semibold" style={{ color }} onDoubleClick={() => setEditing(true)} title="Double-click to rename" data-testid="frame-title">
        {title || 'Group'}
      </div>
    )
  }
  return (
    <input
      aria-label="Frame title"
      autoFocus
      defaultValue={title}
      onBlur={(e) => {
        if (e.target.value !== title) onCommit(e.target.value)
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        else if (e.key === 'Escape') setEditing(false)
      }}
      className="nodrag m-1 w-[calc(100%-0.5rem)] bg-transparent px-1 text-xs font-semibold outline-none"
      style={{ color }}
    />
  )
}
