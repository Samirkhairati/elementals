import { Undo, Redo, Brush, Eraser, Square, PaintBucket, Grid, Shuffle, Stamp } from 'lucide-react'
import { ActiveTool, PaintMode } from '@/types/editor'

interface ToolbarProps {
  historyIndex: number
  historyLength: number
  activeTool: ActiveTool
  paintMode: PaintMode
  handleUndo: () => void
  handleRedo: () => void
  setActiveTool: (tool: ActiveTool) => void
  setPaintMode: (mode: PaintMode) => void
}

export function Toolbar({
  historyIndex,
  historyLength,
  activeTool,
  paintMode,
  handleUndo,
  handleRedo,
  setActiveTool,
  setPaintMode,
}: ToolbarProps) {
  return (
    <div className="h-14 border-b border-border bg-background flex items-center px-4 shrink-0 shadow-sm z-10 justify-center gap-4">
      {/* History Group */}
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
        <button onClick={handleUndo} disabled={historyIndex <= 0} className={`p-2 rounded-md flex items-center justify-center transition-colors ${historyIndex <= 0 ? 'opacity-50 cursor-not-allowed text-muted-foreground' : 'hover:bg-muted text-foreground'}`} title="Undo (Ctrl+Z)">
          <Undo className="w-4 h-4" />
        </button>
        <button onClick={handleRedo} disabled={historyIndex >= historyLength - 1} className={`p-2 rounded-md flex items-center justify-center transition-colors ${historyIndex >= historyLength - 1 ? 'opacity-50 cursor-not-allowed text-muted-foreground' : 'hover:bg-muted text-foreground'}`} title="Redo (Ctrl+Y)">
          <Redo className="w-4 h-4" />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border mx-2"></div>

      {/* Tools Group */}
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
        <button onClick={() => setActiveTool('brush')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${activeTool === 'brush' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Brush Tool (B)">
          <Brush className="w-4 h-4" />
        </button>
        <button onClick={() => setActiveTool('eraser')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${activeTool === 'eraser' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Eraser Tool (E)">
          <Eraser className="w-4 h-4" />
        </button>
        <button onClick={() => setActiveTool('rectangle')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${activeTool === 'rectangle' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Rectangle Draw Tool (M)">
          <Square className="w-4 h-4" />
        </button>
        <button onClick={() => setActiveTool('bucket')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${activeTool === 'bucket' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Paint Bucket Tool (G)">
          <PaintBucket className="w-4 h-4" />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border mx-2"></div>

      {/* Mode Group */}
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
        <button onClick={() => setPaintMode('discontinuous')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${paintMode === 'discontinuous' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Discontinuous Mode">
          <Stamp className="w-4 h-4" />
        </button>
        <button onClick={() => setPaintMode('continuous')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${paintMode === 'continuous' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Continuous Mode">
          <Grid className="w-4 h-4" />
        </button>
        <button onClick={() => setPaintMode('random')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${paintMode === 'random' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Random Mode">
          <Shuffle className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
