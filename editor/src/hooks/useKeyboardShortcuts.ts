import { useEffect } from 'react'
import { ActiveTool } from '@/types/editor'

interface UseKeyboardShortcutsProps {
  handleUndo: () => void
  handleRedo: () => void
  setActiveTool: (tool: ActiveTool) => void
  deps: React.DependencyList
}

export function useKeyboardShortcuts({
  handleUndo,
  handleRedo,
  setActiveTool,
  deps,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        handleRedo()
      } else if (!e.ctrlKey && !e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            setActiveTool('brush')
            break
          case 'e':
            setActiveTool('eraser')
            break
          case 'm':
            setActiveTool('rectangle')
            break
          case 'g':
            setActiveTool('bucket')
            break
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
