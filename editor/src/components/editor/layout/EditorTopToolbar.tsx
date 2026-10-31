import React, { useState } from 'react'
import {
  Undo,
  Redo,
  Brush,
  Eraser,
  Square,
  PaintBucket,
  Grid,
  Grid3X3,
  Magnet,
  Shuffle,
  Stamp,
  Info,
  Map as MapIcon,
  ScanLine,
  Image as ImageIcon,
  Type,
  Zap,
  BoxSelect,
} from 'lucide-react'
import { useEditorSelector, type EditorContextValue } from './EditorContext'
import { ShortcutsDialog } from '../dialogs/ShortcutsDialog'
import { toggleCanvasView, useCanvasView, type CanvasViewToggle } from '@/hooks/editor/canvas/canvasView'
import { IconButton } from '../ui/controls'

export type EditorViewMode = 'map' | 'behaviour-graph' | 'lighting' | 'dialogue'

// Module-level so the selector identity is stable. Flattens activeMap to primitives:
// the map object itself changes on every paint stroke and the toolbar must not follow it.
const selectToolbar = (c: EditorContextValue) => ({
  hasActiveMap: !!c.activeMap,
  mapLabel: c.activeMap ? c.activeMap.name || c.activeMap.fileName : '',
  mapWidth: c.activeMap?.width ?? 0,
  mapHeight: c.activeMap?.height ?? 0,
  historyIndex: c.historyIndex,
  historyLength: c.historyLength,
  handleUndo: c.handleUndo,
  handleRedo: c.handleRedo,
  activeTool: c.activeTool,
  setActiveTool: c.setActiveTool,
  paintMode: c.paintMode,
  setPaintMode: c.setPaintMode,
  showGrid: c.showGrid,
  toggleShowGrid: c.toggleShowGrid,
  snapToGrid: c.snapToGrid,
  toggleSnapToGrid: c.toggleSnapToGrid,
})

/** A bordered group of icon buttons (28px high, 24px buttons, 14px icons). */
function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5 rounded-md border border-sidebar-border bg-muted/40 p-0.5">
      {children}
    </div>
  )
}

function Divider() {
  return <div className="h-5 w-px bg-border/60" />
}

interface ToolButtonProps {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
  tone?: 'solid'
}

function ToolButton({ title, active, disabled, onClick, children, label, tone }: ToolButtonProps) {
  return (
    <IconButton
      title={title}
      aria-label={label ?? title}
      aria-pressed={active}
      disabled={disabled}
      active={active}
      onClick={onClick}
      className={active ? (tone === 'solid' ? '!bg-solid !text-white' : '!bg-primary !text-primary-foreground') : undefined}
    >
      {children}
    </IconButton>
  )
}

const VIEW_TOGGLES: { key: CanvasViewToggle; title: string; icon: React.ReactNode }[] = [
  { key: 'sprites', title: 'Sprites: draw real graphics (off: placeholder tiles)', icon: <ImageIcon /> },
  { key: 'colliders', title: 'Entity areas: outline of every entity', icon: <ScanLine /> },
  { key: 'labels', title: 'Labels: names of all entities when zoomed in', icon: <Type /> },
  { key: 'badges', title: 'Event badges: lightning on entities with an Event', icon: <Zap /> },
]

function MapToolbar() {
  const ctx = useEditorSelector(selectToolbar)
  const view = useCanvasView()
  const [infoOpen, setInfoOpen] = useState(false)

  const hasActiveMap = ctx.hasActiveMap
  const canUndo = hasActiveMap && ctx.historyIndex > 0
  const canRedo = hasActiveMap && ctx.historyIndex < ctx.historyLength - 1

  const tool = (t: Parameters<typeof ctx.setActiveTool>[0], title: string, icon: React.ReactNode) => (
    <ToolButton title={title} disabled={!hasActiveMap} active={ctx.activeTool === t} onClick={() => ctx.setActiveTool(t)}>
      {icon}
    </ToolButton>
  )

  return (
    <div className="flex h-full w-full items-center justify-between gap-3 px-3">
      {/* Left: active map */}
      <div className="flex min-w-[160px] flex-1 items-center">
        {hasActiveMap ? (
          <div className="flex h-control items-center gap-2 rounded-md border border-sidebar-border bg-muted/40 px-2 text-ed-body">
            <MapIcon className="ed-icon shrink-0 text-primary" />
            <span className="max-w-[140px] truncate font-medium text-foreground">{ctx.mapLabel}</span>
            <span className="shrink-0 text-ed-label text-muted-foreground">
              {ctx.mapWidth}×{ctx.mapHeight}
            </span>
          </div>
        ) : (
          <span className="px-2 text-ed-body italic text-muted-foreground/60">No map focused</span>
        )}
      </div>

      {/* Centre: history, tools, modes, view */}
      <div className="flex items-center gap-3">
        <ToolGroup label="History">
          <ToolButton title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={ctx.handleUndo}>
            <Undo />
          </ToolButton>
          <ToolButton title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={ctx.handleRedo}>
            <Redo />
          </ToolButton>
        </ToolGroup>

        <Divider />

        <ToolGroup label="Tools">
          {tool('brush', 'Brush Tool (B)', <Brush />)}
          {tool('eraser', 'Eraser Tool (E)', <Eraser />)}
          {tool('rectangle', 'Rectangle Fill Tool (M)', <Square />)}
          {tool('bucket', 'Paint Bucket Tool (G)', <PaintBucket />)}
          <div className="mx-0.5 h-4 w-px bg-border/60" />
          {tool('collider', 'Collider Tool (C): draw or move the selected entity’s collider', <BoxSelect />)}
        </ToolGroup>

        <Divider />

        <ToolGroup label="Paint mode">
          <ToolButton title="Discontinuous Mode (Single Stamp)" disabled={!hasActiveMap} active={ctx.paintMode === 'discontinuous'} onClick={() => ctx.setPaintMode('discontinuous')}>
            <Stamp />
          </ToolButton>
          <ToolButton title="Continuous Mode (Grid Align / Repeat)" disabled={!hasActiveMap} active={ctx.paintMode === 'continuous'} onClick={() => ctx.setPaintMode('continuous')}>
            <Grid />
          </ToolButton>
          <ToolButton title="Random Mode (Random Tile from Selection)" disabled={!hasActiveMap} active={ctx.paintMode === 'random'} onClick={() => ctx.setPaintMode('random')}>
            <Shuffle />
          </ToolButton>
        </ToolGroup>

        <Divider />

        <ToolGroup label="Grid">
          <ToolButton title={ctx.showGrid ? 'Hide Grid Lines' : 'Show Grid Lines'} label="Grid lines" active={ctx.showGrid} onClick={ctx.toggleShowGrid}>
            <Grid3X3 />
          </ToolButton>
          <ToolButton title={ctx.snapToGrid ? 'Disable Grid Snapping' : 'Enable Grid Snapping'} label="Grid snapping" active={ctx.snapToGrid} onClick={ctx.toggleSnapToGrid}>
            <Magnet />
          </ToolButton>
        </ToolGroup>

        <Divider />

        <ToolGroup label="View">
          {VIEW_TOGGLES.map((t) => (
            <ToolButton key={t.key} title={t.title} label={`View ${t.key}`} active={view[t.key]} onClick={() => toggleCanvasView(t.key)}>
              {t.icon}
            </ToolButton>
          ))}
        </ToolGroup>
      </div>

      {/* Right: shortcuts */}
      <div className="flex min-w-[160px] flex-1 items-center justify-end">
        <IconButton title="Keyboard Shortcuts & Info" aria-label="Keyboard shortcuts" onClick={() => setInfoOpen(true)}>
          <Info />
        </IconButton>
        <ShortcutsDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
      </div>
    </div>
  )
}

/**
 * Extensible Top Toolbar container.
 * In the future, other view modes (e.g. behaviour-graph, lighting, audio) can plug in their own toolbars here.
 */
export function EditorTopToolbar({ mode = 'map' }: { mode?: EditorViewMode }) {
  return (
    <header className="z-20 flex h-toolbar shrink-0 select-none items-center border-b border-sidebar-border bg-sidebar">
      {mode === 'map' && <MapToolbar />}
    </header>
  )
}
