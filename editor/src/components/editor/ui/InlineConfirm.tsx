import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ConfirmKeys } from './ConfirmKeys'

/**
 * An inline "are you sure" box (not a dialog): the warning, then a red confirm button that takes focus and a Cancel.
 * Enter confirms and Esc cancels (`ConfirmKeys`). Used where deleting something would break what refers to it.
 */
export function InlineConfirm({
  label,
  confirmLabel = 'Delete anyway',
  onConfirm,
  onCancel,
  className,
  children,
}: {
  /** The box's accessible name, e.g. "Delete Lost cat?". */
  label?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  className?: string
  /** The warning: what will break. */
  children: ReactNode
}) {
  return (
    <div role="alertdialog" aria-label={label} className={cn('rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]', className)}>
      <ConfirmKeys onConfirm={onConfirm} onCancel={onCancel} />
      {children}
      <div className="mt-1.5 flex gap-1">
        <button type="button" onClick={onConfirm} className="h-6 rounded border border-red-500/40 bg-red-500/10 px-2 text-[11px] text-red-400 hover:bg-red-500/20" autoFocus>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className="h-6 rounded border border-border px-2 text-[11px] hover:bg-accent">
          Cancel
        </button>
      </div>
    </div>
  )
}
