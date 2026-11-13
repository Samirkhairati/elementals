// Where a closed panel comes back when it is opened from the View menu: next to the panels it belongs with (the map
// column on the left, the tileset column on the right), else beside the map tabs, else anywhere. One table instead of
// one hand-written branch per panel.

export type PanelDirection = 'above' | 'below' | 'left' | 'right' | 'within'

export interface PanelPlacement {
  title: string
  /** Tried in order: the first of the listed panels that is open becomes the reference, in that direction. */
  anchors: [panels: readonly string[], direction: PanelDirection][]
  /** With none of the anchors open: this side of the first map tab. */
  mapSide: 'left' | 'right'
  /** A full-height column at this edge of the whole layout instead (anchors are not used). */
  edge?: 'left' | 'right'
}

export const PANEL_PLACEMENT: Record<string, PanelPlacement> = {
  maps: { title: 'MAPS', anchors: [[['layers', 'properties'], 'above']], mapSide: 'left' },
  layers: {
    title: 'LAYERS',
    anchors: [
      [['maps'], 'below'],
      [['properties'], 'above'],
    ],
    mapSide: 'left',
  },
  properties: { title: 'PROPERTIES', anchors: [[['layers', 'maps'], 'below']], mapSide: 'left' },
  tilesets: { title: 'TILESET BROWSER', anchors: [[['preview', 'activeSelection'], 'above']], mapSide: 'right' },
  preview: {
    title: 'TILESET',
    anchors: [
      [['tilesets'], 'below'],
      [['activeSelection'], 'above'],
    ],
    mapSide: 'right',
  },
  activeSelection: { title: 'ACTIVE SELECTION', anchors: [[['preview', 'tilesets'], 'below']], mapSide: 'right' },
  // On-demand panel: a tab next to the Tileset Browser (right column).
  database: { title: 'DATABASE', anchors: [[['tilesets', 'preview', 'activeSelection'], 'within']], mapSide: 'right' },
  // On-demand panel: its own full-height column at the right edge (the right sidebar swaps panels with the selection).
  look: { title: 'LOOK', anchors: [], mapSide: 'right', edge: 'right' },
}

/**
 * Where `placement`'s panel goes, given which panels are open: a reference panel and a direction, or undefined to let
 * the dock put it anywhere.
 */
export function panelPosition(
  placement: PanelPlacement,
  isOpen: (id: string) => boolean,
  firstMapPanel: string | null,
): { referencePanel: string; direction: PanelDirection } | undefined {
  for (const [panels, direction] of placement.anchors) {
    const ref = panels.find(isOpen)
    if (ref) return { referencePanel: ref, direction }
  }
  return firstMapPanel ? { referencePanel: firstMapPanel, direction: placement.mapSide } : undefined
}
