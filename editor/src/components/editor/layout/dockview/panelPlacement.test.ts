import { describe, expect, it } from 'vitest'
import { PANEL_PLACEMENT, panelPosition } from './panelPlacement'
import { ALL_PANELS } from './types'

const openOnly = (...ids: string[]) => (id: string) => ids.includes(id)

describe('panelPosition', () => {
  it('uses the first anchor that is open, in its direction', () => {
    expect(panelPosition(PANEL_PLACEMENT.layers, openOnly('maps', 'properties'), 'map:a')).toEqual({ referencePanel: 'maps', direction: 'below' })
    expect(panelPosition(PANEL_PLACEMENT.layers, openOnly('properties'), 'map:a')).toEqual({ referencePanel: 'properties', direction: 'above' })
  })

  it('within one anchor, the first open panel of its list wins', () => {
    expect(panelPosition(PANEL_PLACEMENT.database, openOnly('activeSelection', 'preview'), null)).toEqual({ referencePanel: 'preview', direction: 'within' })
  })

  it('falls back to the map tab side, then to anywhere', () => {
    expect(panelPosition(PANEL_PLACEMENT.maps, openOnly(), 'map:a')).toEqual({ referencePanel: 'map:a', direction: 'left' })
    expect(panelPosition(PANEL_PLACEMENT.tilesets, openOnly(), 'map:a')).toEqual({ referencePanel: 'map:a', direction: 'right' })
    expect(panelPosition(PANEL_PLACEMENT.tilesets, openOnly(), null)).toBeUndefined()
  })

  it('every placed panel is a known panel', () => {
    for (const id of Object.keys(PANEL_PLACEMENT)) expect(ALL_PANELS.map((p) => p.id)).toContain(id)
  })
})
