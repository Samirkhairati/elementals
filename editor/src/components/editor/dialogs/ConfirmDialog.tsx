import React, { useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ open, title, description, onClose, onConfirm }: ConfirmDialogProps) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform)
  const shortcutLabel = isMac ? '⌘⌫' : 'Ctrl+Del'

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow confirming with Cmd+Delete/Cmd+Backspace (Mac) or Ctrl+Delete/Ctrl+Backspace (Win/Linux)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        e.stopPropagation()
        onConfirm()
        onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onConfirm()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onConfirm, onClose])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="py-1 text-ed-body text-sidebar-foreground/80">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="ed-btn"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className="ed-btn" data-variant="primary" style={{ background: 'hsl(var(--solid))', color: 'white' }}
          >
            <span>Delete</span>
            <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded bg-black/60 px-2 text-xs font-bold text-white border border-white/30 tracking-wider">
              {shortcutLabel}
            </kbd>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
