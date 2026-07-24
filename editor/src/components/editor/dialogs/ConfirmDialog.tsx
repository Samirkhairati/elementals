import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ open, title, description, onClose, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="py-2 text-sm text-sidebar-foreground/80">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm font-medium">Delete</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
