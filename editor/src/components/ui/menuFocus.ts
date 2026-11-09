// A menu hands focus back to its trigger when it closes. When the item it ran opened a dialog (Delete…), that would
// pull focus off the dialog, so Enter would do nothing until the dialog was clicked. Keep focus in the dialog instead:
// on its confirm button (the one Enter presses), or on the dialog itself when it has none.

export function keepFocusInOpenDialog(e: Event): void {
  if (typeof document === 'undefined') return
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
  if (!dialog) return
  e.preventDefault()
  if (dialog.contains(document.activeElement)) return
  const confirm = dialog.querySelector<HTMLElement>('button[data-dialog-confirm]:not(:disabled)')
  ;(confirm ?? dialog).focus()
}
