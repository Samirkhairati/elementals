/* eslint-disable @typescript-eslint/no-explicit-any -- tests stub the editor API */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GameSettingsPage } from './game-settings'

let stored: unknown = null
const api = {
  getGameSettings: vi.fn(async () => ({ success: true, settings: stored })),
  saveGameSettings: vi.fn(async (settings: unknown) => ({ success: true, settings, assets: { written: 1 } })),
}

beforeEach(() => {
  stored = null
  api.getGameSettings.mockClear()
  api.saveGameSettings.mockClear()
  ;(window as any).electronAPI = api
})
afterEach(() => {
  delete (window as any).electronAPI
})

describe('GameSettingsPage', () => {
  it('shows the settings grouped in categories, with the defaults of a fresh project', async () => {
    render(<GameSettingsPage />)
    expect(await screen.findByText('View')).toBeInTheDocument()
    expect(screen.getByText('Camera')).toBeInTheDocument()
    expect(screen.getByText('Movement')).toBeInTheDocument()
    expect((screen.getByLabelText('Tiles across') as HTMLInputElement).value).toBe('32')
    expect(screen.getByTestId('view-size').textContent).toContain('32 × 18 tiles')
    expect(screen.getByRole('switch', { name: 'Tile-based movement' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows what is stored, cleaned', async () => {
    stored = { display: { visibleTilesX: 40 }, movement: { playerSpeed: 9999 } }
    render(<GameSettingsPage />)
    await waitFor(() => expect((screen.getByLabelText('Tiles across') as HTMLInputElement).value).toBe('40'))
    expect((screen.getByLabelText('Walking speed') as HTMLInputElement).value).toBe('600')
  })

  it('saves a change after a moment and says it was saved', async () => {
    render(<GameSettingsPage />)
    const field = (await screen.findByLabelText('Tiles across')) as HTMLInputElement
    fireEvent.change(field, { target: { value: '36' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(api.saveGameSettings).toHaveBeenCalledTimes(1))
    expect((api.saveGameSettings.mock.calls[0][0] as any).display.visibleTilesX).toBe(36)
    await waitFor(() => expect(screen.getByTestId('settings-status').textContent).toMatch(/Saved/))
    expect(screen.getByTestId('view-size').textContent).toContain('36 × 20.3 tiles')
  })

  it('a toggle saves, and "Reset to defaults" puts everything back', async () => {
    stored = { display: { integerScaling: true } }
    render(<GameSettingsPage />)
    const toggle = await screen.findByRole('switch', { name: 'Whole-number scaling' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await waitFor(() => expect(api.saveGameSettings).toHaveBeenCalled())
    expect((api.saveGameSettings.mock.calls.at(-1)![0] as any).display.integerScaling).toBe(false)
  })

  it('says why the game was not updated when the sync was skipped', async () => {
    api.saveGameSettings.mockResolvedValueOnce({ success: true, settings: {}, assets: { written: 0, skipped: 'no asset sync script next to the project' } } as any)
    render(<GameSettingsPage />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Snap to screen pixels' }))
    await waitFor(() => expect(screen.getByTestId('settings-status').textContent).toMatch(/Not copied to the game: no asset sync script/))
  })
})
