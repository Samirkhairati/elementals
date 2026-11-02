import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ConfirmFooter, DangerHeader } from './ConfirmParts'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  onClose: () => void
  onConfirm: () => void
}

/** "Delete this layer / entity / ...?": Enter deletes, Esc cancels (Radix closes on Esc, DialogContent presses the marked button on Enter). */
export function ConfirmDialog({ open, title, description, onClose, onConfirm }: ConfirmDialogProps) {
  const confirm = () => {
    onConfirm()
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-md"
        // Cmd/Ctrl+Backspace has always confirmed here too.
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && (e.key === 'Backspace' || e.key === 'Delete')) {
            e.preventDefault()
            confirm()
          }
        }}
      >
        <DangerHeader title={title} description={description} />
        <ConfirmFooter onCancel={onClose} onConfirm={confirm} confirmLabel="Delete" />
      </DialogContent>
    </Dialog>
  )
}
