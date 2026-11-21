import { useSyncExternalStore } from 'react'

/** Dispatched to ask the Graphics panel to open its picture picker (the Scene panel's Add Child Node › Sprite). */
export const OPEN_PICTURE_PICKER_EVENT = 'elementals:open-picture-picker'

// Whether the picker is open. The Graphics panel is shown only while a sprite is picked, being placed or being chosen,
// so the dock reads this too: asking for the picker brings the panel on screen.
let open = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function setPicturePickerOpen(next: boolean): void {
  if (open === next) return
  open = next
  emit()
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
const snapshot = () => open

/** Whether the picture picker is open (the dock shows the Graphics panel meanwhile). */
export const usePicturePickerOpen = (): boolean => useSyncExternalStore(subscribe, snapshot, snapshot)

/**
 * Asks the Graphics panel to open the picker for the selected Node. The panel comes on screen first (the dock follows
 * the store), then the request reaches it once it is mounted.
 */
export function openPicturePicker(delay = 80): void {
  setPicturePickerOpen(true)
  setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_PICTURE_PICKER_EVENT)), delay)
}
