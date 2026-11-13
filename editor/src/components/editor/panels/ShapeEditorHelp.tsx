import { InfoTip } from '../ui/controls'

/** Controls of the canvas shape editor, for the info tips of collision layers and polygon colliders. */
export function ShapeEditorHelp() {
  return (
    <InfoTip label="How to draw collision shapes">
      Click on the map to place points; hold Shift to keep the new edge horizontal or vertical. Click the first point to
      close the shape (a solid area), or double-click, press Enter or right-click to finish an open line (a wall that
      cannot be crossed). Backspace removes the last point, Esc cancels. Drag a point or a shape to move it (Shift keeps
      it on one axis), double-click an edge to add a point, Alt+click a point to remove it, Delete removes the picked
      shape. Lines show while a point lines up with another collider's points; nothing snaps. The game blocks movement
      with these shapes whether the layer is shown in the editor or not.
    </InfoTip>
  )
}
