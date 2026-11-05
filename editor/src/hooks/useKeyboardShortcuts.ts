import { useShortcuts } from '@/hooks/useShortcuts'
import { ActiveTool } from '@/types/editor'

interface UseKeyboardShortcutsProps {
  handleUndo: () => void
  handleRedo: () => void
  setActiveTool: (tool: ActiveTool) => void
  handleDelete?: () => void
  handleCopy?: () => void
  handlePaste?: () => void
  handleDuplicate?: () => void
  handlePlaceMultiple?: () => void
  handleNewLayer?: () => void
  handleNewFolder?: () => void
}

/** The editor's edit and tool shortcuts. The keys come from lib/shortcuts (rebindable in Settings > Shortcuts). */
export function useKeyboardShortcuts({ handleUndo, handleRedo, setActiveTool, handleDelete, handleCopy, handlePaste, handleDuplicate, handlePlaceMultiple, handleNewLayer, handleNewFolder }: UseKeyboardShortcutsProps) {
  useShortcuts({
    'edit.undo': handleUndo,
    'edit.redo': handleRedo,
    'edit.delete': handleDelete && (() => handleDelete()),
    'edit.copy': handleCopy && (() => handleCopy()),
    'edit.paste': handlePaste && (() => handlePaste()),
    'edit.duplicate': handleDuplicate && ((e) => { e.preventDefault(); handleDuplicate() }),
    'image.placeMultiple': handlePlaceMultiple && ((e) => { e.preventDefault(); handlePlaceMultiple() }),
    'layer.new': handleNewLayer && ((e) => { e.preventDefault(); handleNewLayer() }),
    'layer.newFolder': handleNewFolder && ((e) => { e.preventDefault(); handleNewFolder() }),
    'tool.brush': () => setActiveTool('brush'),
    'tool.eraser': () => setActiveTool('eraser'),
    'tool.rectangle': () => setActiveTool('rectangle'),
    'tool.bucket': () => setActiveTool('bucket'),
  })
}
