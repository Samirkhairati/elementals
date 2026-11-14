/** Dispatched to ask the Images panel to open its picture picker (the Scene panel's "Add picture…" entries). */
export const OPEN_PICTURE_PICKER_EVENT = 'elementals:open-picture-picker'

/**
 * Asks the Images panel to open the picker for the image layer / group that is selected. The panel replaces the tileset
 * panels once an image layer is active, so the request waits a moment for it to be on screen.
 */
export function openPicturePicker(delay = 80): void {
  setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_PICTURE_PICKER_EVENT)), delay)
}
