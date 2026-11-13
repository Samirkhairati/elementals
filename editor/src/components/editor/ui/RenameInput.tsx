import { useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * The name field a list row shows while it is being renamed (layers, entities, entity folders, pictures, picture
 * groups). It opens focused with the name selected; Enter or leaving the field renames (a blank name is ignored), Esc
 * cancels. `onClose` runs once either way, so the row goes back to its label.
 */
export function RenameInput({
  initial,
  onRename,
  onClose,
  label,
  className,
}: {
  initial: string
  /** The new name, trimmed and never empty. */
  onRename: (name: string) => void
  onClose: () => void
  label?: string
  className?: string
}) {
  // Enter (or Esc) closes the field, and a field that goes away can still report a blur: finish only once.
  const done = useRef(false)
  const finish = (value: string | null) => {
    if (done.current) return
    done.current = true
    const name = value?.trim()
    if (name) onRename(name)
    onClose()
  }
  return (
    <input
      type="text"
      className={cn('ed-input min-w-0 flex-1', className)}
      aria-label={label}
      defaultValue={initial}
      autoFocus
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(e.currentTarget.value)
        else if (e.key === 'Escape') finish(null)
      }}
    />
  )
}
