import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import { MapSettingsDialog } from './MapSettingsDialog'

const map = (extra: Partial<MapData> = {}): MapData => ({
  name: 'City', fileName: 'city.json', folderPath: null, width: 40, height: 23, pixelWidth: 1280, pixelHeight: 720,
  layers: [
    { id: 'a', name: 'Ground', type: 'tile', visible: true, locked: false, z: 0 },
    { id: 'b', name: 'Roofs', type: 'image', visible: true, locked: false, z: 30 },
  ],
  ...extra,
})

describe('MapSettingsDialog', () => {
  it('shows the player z-index (default 20), how many layers draw over the player, and the size', () => {
    render(<MapSettingsDialog map={map()} onClose={vi.fn()} onSave={vi.fn()} />)
    expect(screen.getByLabelText('Player z-index')).toHaveValue('20')
    expect(screen.getByTestId('player-z-layers')).toHaveTextContent('1 of 2 tile and image layers draw over the player')
    expect(screen.getByTestId('map-size')).toHaveTextContent('1280 × 720 px · 40 × 23 tiles')
  })

  it('saves a changed player z-index, and leaves the default out', () => {
    const onSave = vi.fn()
    render(<MapSettingsDialog map={map()} onClose={vi.fn()} onSave={onSave} />)
    const input = screen.getByLabelText('Player z-index')
    fireEvent.change(input, { target: { value: '35' } })
    fireEvent.blur(input)
    expect(screen.getByTestId('player-z-layers')).toHaveTextContent('0 of 2')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ playerZ: 35 })
  })

  it('a map with a setting opens with it; going back to 20 clears it', () => {
    const onSave = vi.fn()
    render(<MapSettingsDialog map={map({ settings: { playerZ: 5 } })} onClose={vi.fn()} onSave={onSave} />)
    const input = screen.getByLabelText('Player z-index')
    expect(input).toHaveValue('5')
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.blur(input)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({})
  })
})
