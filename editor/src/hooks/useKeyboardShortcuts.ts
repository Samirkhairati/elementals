import { useShortcuts } from '@/hooks/useShortcuts'
import { ActiveTool } from '@/types/editor'

interface UseKeyboardShortcutsProps {
  handleUndo: () => void
  handleRedo: () => void
  setActiveTool: (tool: ActiveTool) => void
  handleDelete?: () => void
}

/** The editor's edit and tool shortcuts. The keys come from lib/shortcuts (rebindable in Settings > Shortcuts). */
export function useKeyboardShortcuts({ handleUndo, handleRedo, setActiveTool, handleDelete }: UseKeyboardShortcutsProps) {
  useShortcuts({
    'edit.undo': handleUndo,
    'edit.redo': handleRedo,
    'edit.delete': handleDelete && (() => handleDelete()),
    'tool.brush': () => setActiveTool('brush'),
    'tool.eraser': () => setActiveTool('eraser'),
    'tool.rectangle': () => setActiveTool('rectangle'),
    'tool.bucket': () => setActiveTool('bucket'),
  })
}
