// The hierarchical command list of one event page: rows, nested branches, insert affordances, the
// add-command popover, keyboard shortcuts and drag & drop. It never mutates the tree; every user action
// computes a new tree with the pure helpers and reports it through ONE `onChange` call.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Plus,
  Sparkles,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import type { Command, CommandIssue } from '../../../../../shared/engine/types'
import {
  COMMAND_CATALOG,
  COMMAND_CATEGORIES,
  createCommand,
  duplicateCommand,
  findCommand,
  getCommandDef,
  summarizeCommand,
} from '../../../../../shared/engine/commands'
import { cn } from '@/lib/utils'
import { useEventEnv } from './eventEnv'
import {
  EVENT_TEMPLATES,
  branchHeading,
  buildSummaryContext,
  dropCommand,
  freshCopies,
  insertCommands,
  moveWithin,
  orderedBranches,
  readCommandClipboard,
  removeBranch,
  removeCommandAndSelect,
  visibleOrder,
  worstSeverity,
  writeCommandClipboard,
  type EventTemplate,
  type InsertTarget,
} from './eventModel'
import { CATEGORY_STYLES, CommandIcon, PlannedBadge, UNKNOWN_STYLE } from './commandStyle'
import { ListPicker, type PickerItem } from './pickers'
import { IconButton, Popover, SmallButton } from './primitives'

export interface CommandListProps {
  commands: Command[]
  /** The new tree, plus which command to select afterwards (`undefined` = keep the selection). */
  onChange: (next: Command[], select?: string | null) => void
  /** Template with optional target; the parent also adds the template's extra pages. */
  onApplyTemplate: (template: EventTemplate, target: InsertTarget) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  issues: Map<string, CommandIssue[]>
  /** Enter: move focus to the parameter form. */
  onRequestEdit: () => void
}

type DropMark = { kind: 'row'; id: string; pos: 'before' | 'after' } | { kind: 'end'; key: string }

interface ListContext {
  summaryCtx: ReturnType<typeof buildSummaryContext>
  selectedId: string | null
  issues: Map<string, CommandIssue[]>
  collapsed: ReadonlySet<string>
  dragId: string | null
  dropMark: DropMark | null
  select: (id: string) => void
  edit: (id: string) => void
  toggleCollapsed: (id: string) => void
  openAdd: (target: InsertTarget, anchor: HTMLElement) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  removeOrphanBranch: (id: string, branch: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onRowDragOver: (e: React.DragEvent, id: string) => void
  onEndDragOver: (e: React.DragEvent, key: string) => void
  onRowDrop: (e: React.DragEvent, id: string) => void
  onEndDrop: (e: React.DragEvent, target: Extract<InsertTarget, { kind: 'end' }>) => void
  onDragLeave: () => void
}

// ── rows ────────────────────────────────────────────────────────────────────────────────────────

function IssueMarker({ issues }: { issues: CommandIssue[] | undefined }) {
  const worst = worstSeverity(issues)
  if (!worst || !issues) return null
  const text = issues.map((i) => i.message).join('\n')
  const Icon = worst === 'error' ? AlertCircle : AlertTriangle
  return (
    <span
      title={text}
      role="img"
      aria-label={`${worst === 'error' ? 'Error' : 'Warning'}: ${text}`}
      data-severity={worst}
      className={cn('inline-flex shrink-0 items-center gap-0.5 text-[10px]', worst === 'error' ? 'text-red-400' : 'text-amber-400')}
    >
      <Icon className="h-3.5 w-3.5" />
      {issues.length > 1 && issues.length}
    </span>
  )
}

function AddRow({ target, label = 'Add command', ctx, markKey }: { target: Extract<InsertTarget, { kind: 'end' }>; label?: string; ctx: ListContext; markKey: string }) {
  const marked = ctx.dropMark?.kind === 'end' && ctx.dropMark.key === markKey
  return (
    <div className="relative" onDragOver={(e) => ctx.onEndDragOver(e, markKey)} onDrop={(e) => ctx.onEndDrop(e, target)} onDragLeave={ctx.onDragLeave}>
      {marked && <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded bg-primary" data-testid="drop-indicator" />}
      <button
        type="button"
        onClick={(e) => ctx.openAdd(target, e.currentTarget)}
        className="flex h-6 w-full items-center gap-1.5 rounded px-2 text-left text-[11px] text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground"
      >
        <Plus className="h-3 w-3" aria-hidden />
        {label}
      </button>
    </div>
  )
}

function CommandNode({ cmd, depth, ctx }: { cmd: Command; depth: number; ctx: ListContext }) {
  const def = getCommandDef(cmd.type)
  const style = def ? CATEGORY_STYLES[def.category] : UNKNOWN_STYLE
  const selected = ctx.selectedId === cmd.id
  const summary = summarizeCommand(cmd, ctx.summaryCtx)
  const branches = orderedBranches(cmd)
  const hasBranches = branches.length > 0
  const isCollapsed = ctx.collapsed.has(cmd.id)
  const issues = ctx.issues.get(cmd.id)
  const mark = ctx.dropMark?.kind === 'row' && ctx.dropMark.id === cmd.id ? ctx.dropMark.pos : null
  const dragging = ctx.dragId === cmd.id
  const hiddenCount = isCollapsed
    ? (() => {
        let n = 0
        const count = (l: Command[]) => l.forEach((c) => (n++, Object.values(c.branches ?? {}).forEach(count)))
        Object.values(cmd.branches ?? {}).forEach(count)
        return n
      })()
    : 0

  return (
    <div role="treeitem" aria-level={depth + 1} aria-selected={selected} aria-expanded={hasBranches ? !isCollapsed : undefined} data-command-id={cmd.id} data-command-type={cmd.type}>
      <div className="relative">
        {/* insert-before affordance: a thin line with a plus that appears on hover */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Insert command before ${summary}`}
          onClick={(e) => ctx.openAdd({ kind: 'before', id: cmd.id }, e.currentTarget)}
          className={cn('group/insert absolute -top-1.5 left-0 right-0 z-10 flex h-3 items-center justify-center', ctx.dragId && 'pointer-events-none')}
        >
          <span className="h-px w-full bg-primary/0 transition-colors group-hover/insert:bg-primary/70" />
          <span className="absolute left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-opacity group-hover/insert:opacity-100">
            <Plus className="h-2.5 w-2.5" />
          </span>
        </button>
        {mark === 'before' && <div className="pointer-events-none absolute inset-x-0 -top-px z-20 h-0.5 rounded bg-primary" data-testid="drop-indicator" />}
        <div
          draggable
          onDragStart={(e) => ctx.onDragStart(e, cmd.id)}
          onDragEnd={ctx.onDragEnd}
          onDragOver={(e) => ctx.onRowDragOver(e, cmd.id)}
          onDrop={(e) => ctx.onRowDrop(e, cmd.id)}
          onDragLeave={ctx.onDragLeave}
          onClick={() => ctx.select(cmd.id)}
          onDoubleClick={() => ctx.edit(cmd.id)}
          className={cn(
            'group/row flex min-h-[26px] cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5',
            selected ? 'bg-primary/15 ring-1 ring-primary/50' : 'hover:bg-accent/50',
            dragging && 'opacity-40',
          )}
        >
          {hasBranches ? (
            <button
              type="button"
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              title={isCollapsed ? 'Expand' : 'Collapse'}
              onClick={(e) => {
                e.stopPropagation()
                ctx.toggleCollapsed(cmd.id)
              }}
              className="-ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            >
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <CommandIcon icon={def?.icon} category={def?.category} />
          <span className={cn('shrink-0 text-xs font-semibold', style.text)}>{def?.label ?? 'Unknown'}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={summary}>
            {summary}
            {hiddenCount > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground/70">({hiddenCount} hidden)</span>}
          </span>
          {def?.status === 'planned' && <PlannedBadge />}
          <IssueMarker issues={issues} />
          <span className={cn('flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100', selected && 'opacity-100')}>
            <IconButton
              title="Duplicate"
              onClick={(e) => {
                e.stopPropagation()
                ctx.duplicate(cmd.id)
              }}
            >
              <CopyPlus className="h-3 w-3" />
            </IconButton>
            <IconButton
              title="Delete"
              danger
              onClick={(e) => {
                e.stopPropagation()
                ctx.remove(cmd.id)
              }}
            >
              <Trash2 className="h-3 w-3" />
            </IconButton>
          </span>
        </div>
        {mark === 'after' && <div className="pointer-events-none absolute inset-x-0 -bottom-px z-20 h-0.5 rounded bg-primary" data-testid="drop-indicator" />}
      </div>
      {hasBranches && !isCollapsed && (
        <div className="ml-[18px] border-l border-border/60 pl-2">
          {branches.map((b) => {
            const list = cmd.branches?.[b.id] ?? []
            return (
              <div key={b.id} role="group" aria-label={branchHeading(cmd, b)} data-branch={b.id}>
                <div className={cn('flex items-center gap-1.5 px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider', b.active ? style.text : 'text-amber-400')}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', b.active ? style.dot : 'bg-amber-400')} />
                  <span>{branchHeading(cmd, b)}</span>
                  {!b.active && (
                    <button type="button" onClick={() => ctx.removeOrphanBranch(cmd.id, b.id)} className="ml-auto rounded px-1 text-[10px] normal-case text-red-400 hover:bg-red-500/15">
                      Delete branch
                    </button>
                  )}
                </div>
                {list.map((child) => (
                  <CommandNode key={child.id} cmd={child} depth={depth + 1} ctx={ctx} />
                ))}
                {b.active && <AddRow target={{ kind: 'end', parentId: cmd.id, branch: b.id }} ctx={ctx} markKey={`${cmd.id}/${b.id}`} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── add-command popover content ─────────────────────────────────────────────────────────────────

const COMMAND_ITEMS: PickerItem[] = Object.values(COMMAND_CATALOG).map((d) => ({
  id: d.type,
  label: d.label,
  description: d.description,
  group: d.category,
  keywords: `${d.type} ${d.category}`,
  leading: <CommandIcon icon={d.icon} category={d.category} className="mt-0.5" />,
  trailing: d.status === 'planned' ? <PlannedBadge className="mt-0.5" /> : undefined,
}))

// ── the list ────────────────────────────────────────────────────────────────────────────────────

export function CommandList({ commands, onChange, onApplyTemplate, selectedId, onSelect, issues, onRequestEdit }: CommandListProps) {
  const env = useEventEnv()
  const summaryCtx = useMemo(() => buildSummaryContext(env), [env])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropMark, setDropMark] = useState<DropMark | null>(null)
  const [adding, setAdding] = useState<{ target: InsertTarget; anchorRef: React.RefObject<HTMLElement | null> } | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const templatesButtonRef = useRef<HTMLButtonElement>(null)
  const treeRef = useRef(commands)
  useEffect(() => {
    treeRef.current = commands
  })

  const emit = useCallback(
    (next: Command[], select?: string | null) => {
      if (next === treeRef.current) return
      treeRef.current = next
      onChange(next, select)
    },
    [onChange],
  )

  // Keep the selected row in view.
  useEffect(() => {
    if (!selectedId) return
    const rows = containerRef.current?.querySelectorAll<HTMLElement>('[data-command-id]')
    if (rows) Array.from(rows).find((el) => el.dataset.commandId === selectedId)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedId])

  const defaultTarget = useCallback((): InsertTarget => (selectedId && findCommand(treeRef.current, selectedId) ? { kind: 'after', id: selectedId } : { kind: 'end', parentId: null, branch: null }), [selectedId])

  const openAddFrom = useCallback((target: InsertTarget, anchor: HTMLElement | null) => {
    setTemplatesOpen(false)
    setAdding({ target, anchorRef: { current: anchor } })
  }, [])

  const addCommand = useCallback(
    (type: string, target: InsertTarget) => {
      const cmd = createCommand(type)
      const next = insertCommands(treeRef.current, target, [cmd])
      emit(next, cmd.id)
      // The collapsed container the new row would land in must be visible.
      if (target.kind === 'end' && target.parentId) {
        setCollapsed((s) => {
          if (!s.has(target.parentId as string)) return s
          const n = new Set(s)
          n.delete(target.parentId as string)
          return n
        })
      }
    },
    [emit],
  )

  const duplicate = useCallback(
    (id: string) => {
      const { tree, newId } = duplicateCommand(treeRef.current, id)
      if (newId) emit(tree, newId)
    },
    [emit],
  )

  const remove = useCallback(
    (id: string) => {
      const { tree, select } = removeCommandAndSelect(treeRef.current, id, collapsed)
      emit(tree, select)
    },
    [emit, collapsed],
  )

  const copy = useCallback(async (id: string) => {
    const info = findCommand(treeRef.current, id)
    if (info) await writeCommandClipboard([info.command])
  }, [])

  const paste = useCallback(async () => {
    const cmds = await readCommandClipboard()
    if (!cmds || cmds.length === 0) return
    const copies = freshCopies(cmds)
    const target = selectedId && findCommand(treeRef.current, selectedId) ? ({ kind: 'after', id: selectedId } as const) : ({ kind: 'end', parentId: null, branch: null } as const)
    emit(insertCommands(treeRef.current, target, copies), copies[0].id)
  }, [emit, selectedId])

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  // ── drag & drop (native HTML5) ────────────────────────────────────────────────────────────────

  const endDrag = useCallback(() => {
    setDragId(null)
    setDropMark(null)
  }, [])

  const ctx: ListContext = {
    summaryCtx,
    selectedId,
    issues,
    collapsed,
    dragId,
    dropMark,
    select: (id) => {
      onSelect(id)
      containerRef.current?.focus({ preventScroll: true })
    },
    edit: (id) => {
      onSelect(id)
      onRequestEdit()
    },
    toggleCollapsed,
    openAdd: openAddFrom,
    duplicate,
    remove,
    removeOrphanBranch: (id, branch) => emit(removeBranch(treeRef.current, id, branch)),
    onDragStart: (e, id) => {
      e.stopPropagation()
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        try {
          e.dataTransfer.setData('application/x-elementals-command', id)
        } catch {
          /* some environments refuse custom types */
        }
      }
      setDragId(id)
      onSelect(id)
    },
    onDragEnd: endDrag,
    onRowDragOver: (e, id) => {
      if (!dragId) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      setDropMark((m) => (m?.kind === 'row' && m.id === id && m.pos === pos ? m : { kind: 'row', id, pos }))
    },
    onEndDragOver: (e, key) => {
      if (!dragId) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      setDropMark((m) => (m?.kind === 'end' && m.key === key ? m : { kind: 'end', key }))
    },
    onRowDrop: (e, id) => {
      if (!dragId) return
      e.preventDefault()
      e.stopPropagation()
      const pos = dropMark?.kind === 'row' && dropMark.id === id ? dropMark.pos : (() => {
        const rect = e.currentTarget.getBoundingClientRect()
        return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      })()
      const dragged = dragId
      endDrag()
      emit(dropCommand(treeRef.current, dragged, { kind: pos, id }), dragged)
    },
    onEndDrop: (e, target) => {
      if (!dragId) return
      e.preventDefault()
      e.stopPropagation()
      const dragged = dragId
      endDrag()
      emit(dropCommand(treeRef.current, dragged, target), dragged)
    },
    onDragLeave: () => setDropMark(null),
  }

  // ── keyboard ──────────────────────────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // Portalled popovers bubble their React events through here; inputs keep their own keys.
    if (!e.currentTarget.contains(target)) return
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    const mod = e.metaKey || e.ctrlKey
    const tree = treeRef.current
    const order = visibleOrder(tree, collapsed)
    const index = selectedId ? order.indexOf(selectedId) : -1
    const key = e.key.toLowerCase()

    const handled = () => {
      e.preventDefault()
      e.stopPropagation()
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      handled()
      if (e.altKey) {
        if (selectedId) emit(moveWithin(tree, selectedId, e.key === 'ArrowDown' ? 1 : -1))
        return
      }
      if (order.length === 0) return
      const next = e.key === 'ArrowDown' ? (index < 0 ? 0 : Math.min(order.length - 1, index + 1)) : index < 0 ? order.length - 1 : Math.max(0, index - 1)
      onSelect(order[next])
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const info = selectedId ? findCommand(tree, selectedId) : null
      if (!info || !selectedId || orderedBranches(info.command).length === 0) return
      handled()
      const isCollapsed = collapsed.has(selectedId)
      if ((e.key === 'ArrowLeft') !== isCollapsed) toggleCollapsed(selectedId)
    } else if (e.key === 'Enter') {
      if (target.tagName === 'BUTTON' || !selectedId) return
      handled()
      onRequestEdit()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
      handled() // also keeps the editor's global "delete selected entity" shortcut away
      if (selectedId) remove(selectedId)
    } else if (mod && key === 'd') {
      handled()
      if (selectedId) duplicate(selectedId)
    } else if (mod && key === 'c') {
      handled()
      if (selectedId) void copy(selectedId)
    } else if (mod && key === 'x') {
      handled()
      if (selectedId) {
        void copy(selectedId)
        remove(selectedId)
      }
    } else if (mod && key === 'v') {
      handled()
      void paste()
    } else if (e.key === '/' && !mod) {
      handled()
      openAddFrom(defaultTarget(), addButtonRef.current)
    }
  }

  const selectedInfo = selectedId ? findCommand(commands, selectedId) : null
  const templateItems = EVENT_TEMPLATES

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="command-list">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <SmallButton
          ref={addButtonRef}
          variant="primary"
          aria-haspopup="dialog"
          title="Add a command (/)"
          onClick={(e) => openAddFrom(defaultTarget(), e.currentTarget)}
        >
          <Plus className="h-3 w-3" /> Add command
        </SmallButton>
        <SmallButton ref={templatesButtonRef} aria-haspopup="menu" title="Insert a ready-made snippet" onClick={() => (setAdding(null), setTemplatesOpen((o) => !o))}>
          <Sparkles className="h-3 w-3" /> Templates
        </SmallButton>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <IconButton title="Duplicate (Ctrl/Cmd+D)" disabled={!selectedInfo} onClick={() => selectedId && duplicate(selectedId)}>
          <CopyPlus className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Copy (Ctrl/Cmd+C)" disabled={!selectedInfo} onClick={() => selectedId && void copy(selectedId)}>
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Paste (Ctrl/Cmd+V)" onClick={() => void paste()}>
          <ClipboardPaste className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Move up (Alt+Up)" disabled={!selectedInfo} onClick={() => selectedId && emit(moveWithin(commands, selectedId, -1))}>
          <ArrowUp className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Move down (Alt+Down)" disabled={!selectedInfo} onClick={() => selectedId && emit(moveWithin(commands, selectedId, 1))}>
          <ArrowDown className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Delete (Del)" danger disabled={!selectedInfo} onClick={() => selectedId && remove(selectedId)}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
        <span className="ml-auto hidden text-[10px] text-muted-foreground xl:inline">↑↓ select · Enter edit · / add · Del remove · Alt+↑↓ move</span>
      </div>

      {/* rows */}
      <div
        ref={containerRef}
        role="tree"
        aria-label="Commands"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2 outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null)
        }}
        onDragOver={(e) => {
          if (dragId) e.preventDefault()
        }}
      >
        {commands.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border py-8 text-center" data-testid="empty-commands">
            <div>
              <p className="text-sm font-medium">This page does nothing yet</p>
              <p className="text-[11px] text-muted-foreground">Commands run top to bottom when the page is triggered.</p>
            </div>
            <SmallButton variant="primary" onClick={(e) => openAddFrom({ kind: 'end', parentId: null, branch: null }, e.currentTarget)}>
              <Plus className="h-3 w-3" /> Add your first command
            </SmallButton>
            <div className="flex flex-wrap justify-center gap-1">
              <span className="w-full text-[10px] uppercase tracking-wider text-muted-foreground">or start from a template</span>
              {templateItems.map((t) => (
                <SmallButton key={t.id} title={t.description} onClick={() => onApplyTemplate(t, { kind: 'end', parentId: null, branch: null })}>
                  {t.label}
                </SmallButton>
              ))}
            </div>
          </div>
        ) : (
          <>
            {commands.map((c) => (
              <CommandNode key={c.id} cmd={c} depth={0} ctx={ctx} />
            ))}
            <AddRow target={{ kind: 'end', parentId: null, branch: null }} ctx={ctx} markKey="root" />
          </>
        )}
      </div>

      <Popover
        open={adding !== null}
        onClose={() => setAdding(null)}
        anchorRef={adding?.anchorRef ?? addButtonRef}
        width={340}
        label="Add a command"
        className="max-h-[460px]"
      >
        <ListPicker
          items={COMMAND_ITEMS}
          groups={COMMAND_CATEGORIES}
          placeholder="Search commands…"
          emptyText="No command matches."
          close={() => setAdding(null)}
          onSelect={(type) => adding && addCommand(type, adding.target)}
        />
      </Popover>

      <Popover open={templatesOpen} onClose={() => setTemplatesOpen(false)} anchorRef={templatesButtonRef} width={300} label="Templates">
        <div role="menu" className="py-1">
          {templateItems.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setTemplatesOpen(false)
                onApplyTemplate(t, defaultTarget())
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
            >
              <span className="block text-xs">{t.label}</span>
              <span className="block text-[10px] text-muted-foreground">{t.description}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  )
}
