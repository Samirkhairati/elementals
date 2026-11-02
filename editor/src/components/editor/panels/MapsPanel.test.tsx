import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import { MapsPanel } from './MapsPanel'

const market: MapData = { name: 'market', fileName: 'market.json', folderPath: null, width: 15, height: 15, layers: [], entities: [] }

function setup() {
  const handlers = {
    handleExportMap: vi.fn(),
    handleExportMapToGame: vi.fn(),
    handleResizeMap: vi.fn(),
  }
  render(
    <MapsPanel
      maps={[market]}
      mapFolders={[]}
      activeMap={null}
      expandedMapFolders={new Set()}
      toggleMapFolder={vi.fn()}
      setCreateMapData={vi.fn()}
      setCreateMapDialog={vi.fn()}
      setCreateMapFolderName={vi.fn()}
      setCreateMapFolderDialog={vi.fn()}
      setRenameInput={vi.fn()}
      setRenameDialog={vi.fn()}
      handleDeleteMapFolder={vi.fn()}
      handleDeleteMap={vi.fn()}
      handleMapDrop={vi.fn()}
      onSelectMap={vi.fn()}
      {...handlers}
    />,
  )
  fireEvent.contextMenu(screen.getByText('market'))
  return handlers
}

describe('MapsPanel map context menu', () => {
  it('lists the map actions', () => {
    setup()
    for (const name of ['Rename', 'Resize…', 'Export to Game', 'Export as File…', 'Delete Map']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('Export to Game exports that map straight away', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export to Game' }))
    expect(h.handleExportMapToGame).toHaveBeenCalledWith(market)
    expect(h.handleExportMap).not.toHaveBeenCalled()
  })

  it('Resize… opens the resize flow for that map', async () => {
    const h = setup()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Resize…' }))
    await vi.waitFor(() => expect(h.handleResizeMap).toHaveBeenCalledWith(market))
  })
})
