// The look every confirm dialog shares: a header with an icon (and the thing being deleted), and a footer whose buttons
// show their keys. Enter presses the confirm button (see DialogContent), Esc closes the dialog.

import { Trash2 } from 'lucide-react'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EdButton } from '../ui/controls'

interface HeaderProps {
  title: string
  /** What goes, shown on its own line so a long path stays readable. */
  subject?: string
  description: React.ReactNode
  descriptionId?: string
}

export function DangerHeader({ title, subject, description, descriptionId }: HeaderProps) {
  return (
    <div className="flex items-start gap-3 pr-6">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[hsl(var(--solid))]" style={{ background: 'hsl(var(--solid) / 0.14)' }} aria-hidden>
        <Trash2 className="h-4 w-4" />
      </span>
      <DialogHeader className="min-w-0 flex-1 gap-1.5 pt-0.5 text-left">
        <DialogTitle>{title}</DialogTitle>
        {subject && <code className="block truncate rounded-md border border-border bg-muted/40 px-2 py-1 text-ed-label" title={subject}>{subject}</code>}
        <DialogDescription id={descriptionId} className="text-ed-body text-muted-foreground">{description}</DialogDescription>
      </DialogHeader>
    </div>
  )
}

interface FooterProps {
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  /** 'destructive' = the button deletes something: solid red, and it takes focus so Enter is safe to press. */
  tone?: 'primary' | 'destructive'
  disabled?: boolean
  /** Small text on the left, e.g. "Nothing is saved until you press Create." */
  note?: React.ReactNode
}

export function ConfirmFooter({ onCancel, onConfirm, confirmLabel, tone = 'destructive', disabled, note }: FooterProps) {
  return (
    <div className="mt-1 flex items-center justify-end gap-2 border-t border-border pt-3">
      {note && <span className="ed-hint mr-auto">{note}</span>}
      <EdButton onClick={onCancel} aria-keyshortcuts="Escape">Cancel<kbd className="ed-kbd" aria-hidden>Esc</kbd></EdButton>
      <EdButton variant={tone} data-dialog-confirm autoFocus={tone === 'destructive'} disabled={disabled} aria-keyshortcuts="Enter" onClick={onConfirm}>{confirmLabel}<kbd className="ed-kbd" aria-hidden>↵</kbd></EdButton>
    </div>
  )
}
