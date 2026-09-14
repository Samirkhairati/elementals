import React, { useState } from 'react'
import {
  Undo,
  Redo,
  Brush,
  Eraser,
  Square,
  PaintBucket,
  Grid,
  Shuffle,
  Stamp,
  Info,
  Map as MapIcon,
} from 'lucide-react'
import { useEditorContext } from './EditorContext'
import { ShortcutsDialog } from '../dialogs/ShortcutsDialog'

export type EditorViewMode = 'map' | 'behaviour-graph' | 'lighting' | 'dialogue'

function MapToolbar() {
  const ctx = useEditorContext()
  const [infoOpen, setInfoOpen] = useState(false)

  const hasActiveMap = !!ctx.activeMap
  const canUndo = hasActiveMap && ctx.historyIndex > 0
  const canRedo = hasActiveMap && ctx.historyIndex < ctx.historyLength - 1

  return (
    <div className="flex items-center justify-between w-full h-full px-3">
      {/* Left: Active Map Info Badge / Status */}
      <div className="flex items-center gap-2 min-w-[200px]">
        {hasActiveMap ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/40 border border-sidebar-border rounded-md text-xs font-mono">
            <MapIcon className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-medium text-foreground truncate max-w-[140px]">
              {ctx.activeMap.name || ctx.activeMap.fileName}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              ({ctx.activeMap.width}×{ctx.activeMap.height})
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-muted-foreground/60 italic">
            No map focused
          </div>
        )}
      </div>

      {/* Center: Main Painting & History Tools */}
      <div className="flex items-center gap-3">
        {/* History Group */}
        <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-md border border-sidebar-border">
          <button
            onClick={ctx.handleUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !canUndo
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : 'hover:bg-muted text-foreground'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={ctx.handleRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !canRedo
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : 'hover:bg-muted text-foreground'
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border/60" />

        {/* Tools Group */}
        <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-md border border-sidebar-border">
          <button
            disabled={!hasActiveMap}
            onClick={() => ctx.setActiveTool('brush')}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !hasActiveMap
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : ctx.activeTool === 'brush'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Brush Tool (B)"
          >
            <Brush className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!hasActiveMap}
            onClick={() => ctx.setActiveTool('eraser')}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !hasActiveMap
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : ctx.activeTool === 'eraser'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Eraser Tool (E)"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!hasActiveMap}
            onClick={() => ctx.setActiveTool('rectangle')}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !hasActiveMap
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : ctx.activeTool === 'rectangle'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Rectangle Fill Tool (M)"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!hasActiveMap}
            onClick={() => ctx.setActiveTool('bucket')}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !hasActiveMap
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : ctx.activeTool === 'bucket'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Paint Bucket Tool (G)"
          >
            <PaintBucket className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border/60" />

        {/* Paint Mode Group */}
        <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-md border border-sidebar-border">
          <button
            disabled={!hasActiveMap}
            onClick={() => ctx.setPaintMode('discontinuous')}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !hasActiveMap
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : ctx.paintMode === 'discontinuous'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Discontinuous Mode (Single Stamp)"
          >
            <Stamp className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!hasActiveMap}
            onClick={() => ctx.setPaintMode('continuous')}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !hasActiveMap
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : ctx.paintMode === 'continuous'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Continuous Mode (Grid Align / Repeat)"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!hasActiveMap}
            onClick={() => ctx.setPaintMode('random')}
            className={`p-1.5 rounded flex items-center justify-center transition-colors ${
              !hasActiveMap
                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                : ctx.paintMode === 'random'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Random Mode (Random Tile from Selection)"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Info / Shortcuts Help */}
      <div className="flex items-center justify-end min-w-[200px]">
        <button
          onClick={() => setInfoOpen(true)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Keyboard Shortcuts & Info"
        >
          <Info className="w-4 h-4" />
        </button>
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
    <header className="h-10 border-b border-sidebar-border bg-sidebar-background flex items-center shrink-0 z-20 select-none">
      {mode === 'map' && <MapToolbar />}
    </header>
  )
}
