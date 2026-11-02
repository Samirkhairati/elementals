import { useEffect } from 'react'
import { useStableCallback } from '@/hooks/useStableCallback'

/**
 * Enter / Esc for a confirmation that is not a dialog (an inline "Delete anyway / Cancel" box). Mount it while the box
 * is showing. Enter only counts when nothing that has its own Enter (a button, a field) is focused: focus the confirm
 * button when the box opens, and Enter reaches it natively.
 */
export function ConfirmKeys({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const confirm = useStableCallback(onConfirm)
  const cancel = useStableCallback(onCancel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Capturing and stopping it: an Esc that closes this box must not also close the dialog the box sits in.
        e.preventDefault()
        e.stopPropagation()
        cancel()
      } else if (e.key === 'Enter' && !e.altKey && !e.shiftKey && !e.isComposing) {
        if ((e.target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [contenteditable="true"], [role="combobox"]')) return
        e.preventDefault()
        confirm()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirm, cancel])
  return null
}
