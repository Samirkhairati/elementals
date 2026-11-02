import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { makeLayer } from '@/test/helpers'
import { LayersPanel } from './LayersPanel'

function renderPanel(overrides: Partial<React.ComponentProps<typeof LayersPanel>> = {}) {
  const props: React.ComponentProps<typeof LayersPanel> = {
    hasActiveMap: true,
    layers: [
      makeLayer('col', { type: 'collision', name: 'Collision' }),
      makeLayer('img', { type: 'image', name: 'Trees', z: 5 }),
      makeLayer('ground', { name: 'Ground' }),
      makeLayer('deco', { name: 'Deco', z: -1 }),
    ],
    activeLayerId: 'ground',
    setActiveLayerId: vi.fn(),
    selectLayer: vi.fn(),
    selectedLayerIds: [],
    showEntities: true,
    toggleShowEntities: vi.fn(),
    entitiesIndex: 0,
    setEntitiesIndex: vi.fn(),
    toggleLayerVisibility: vi.fn(),
    toggleLayerLock: vi.fn(),
    deleteLayer: vi.fn(),
    reorderLayers: vi.fn(),
    createLayerOfType: vi.fn(),
    renameLayer: vi.fn(),
    duplicateLayer: vi.fn(),
    setConfirmDialog: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<LayersPanel {...props} />) }
}

const rowOf = (name: string) => screen.getByText(name).closest('.ed-row') as HTMLElement

describe('LayersPanel', () => {
  it('lists the entities as a row on top, before every layer', () => {
    renderPanel()
    const rows = screen.getAllByText(/Entities|Collision|Trees|Ground|Deco/).map((el) => el.textContent)
    expect(rows[0]).toBe('Entities')
  })

  it('the entities row only has a visibility toggle: no z-index', () => {
    const { props } = renderPanel()
    const row = screen.getByTestId('entities-row')
    expect(within(row).queryByTestId('layer-z')).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Hide entities' }))
    expect(props.toggleShowEntities).toHaveBeenCalledTimes(1)
  })

  it('shows the toggle as "show" while the entities are hidden', () => {
    renderPanel({ showEntities: false })
    expect(within(screen.getByTestId('entities-row')).getByRole('button', { name: 'Show entities' })).toBeTruthy()
  })

  it('is one flat list in layer order, with no category separators', () => {
    renderPanel()
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
    const labels = Array.from(document.querySelectorAll('.ed-row-label')).map((el) => el.textContent)
    expect(labels).toEqual(['Entities', 'Collision', 'Trees', 'Ground', 'Deco'])
  })

  const dnd = () => {
    const data: Record<string, string> = {}
    return { setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k], effectAllowed: '', dropEffect: '' }
  }

  it('dropping a layer reorders the list and touches nothing else: no z change', () => {
    const layers = [makeLayer('top', { name: 'Top', z: 30 }), makeLayer('mid', { name: 'Mid', z: 20 }), makeLayer('low', { name: 'Low', z: 10 })]
    const { props } = renderPanel({ layers, activeLayerId: 'top' })
    const dataTransfer = dnd()
    // jsdom has no layout, so the drop lands on the "bottom" half of the target: drag Low below Top
    fireEvent.dragStart(rowOf('Low'), { dataTransfer })
    fireEvent.dragOver(rowOf('Top'), { dataTransfer })
    fireEvent.drop(rowOf('Top'), { dataTransfer })
    expect(props.reorderLayers).toHaveBeenCalledTimes(1)
    const next = (props.reorderLayers as ReturnType<typeof vi.fn>).mock.calls[0][0] as typeof layers
    expect(next.map((l) => l.id)).toEqual(['top', 'low', 'mid'])
    expect(next.map((l) => l.z)).toEqual([30, 10, 20]) // each layer kept its own z
    expect(next[1]).toBe(layers[2]) // the very same layer object
  })

  it('the Entities row sits at its saved position among the layers', () => {
    renderPanel({ entitiesIndex: 2 })
    const labels = Array.from(document.querySelectorAll('.ed-row-label')).map((el) => el.textContent)
    expect(labels).toEqual(['Collision', 'Trees', 'Entities', 'Ground', 'Deco'])
  })

  it('dragging the Entities row down past layers moves only its position, not the layers', () => {
    const { props } = renderPanel() // row on top; list: Collision, Trees, Ground, Deco
    const dataTransfer = dnd()
    fireEvent.dragStart(screen.getByTestId('entities-row'), { dataTransfer })
    fireEvent.dragOver(rowOf('Trees'), { dataTransfer })
    fireEvent.drop(rowOf('Trees'), { dataTransfer }) // lands under Trees
    expect(props.setEntitiesIndex).toHaveBeenCalledWith(2)
    expect(props.reorderLayers).not.toHaveBeenCalled()
  })

  it('dragging a layer past the Entities row changes the layers and the row position together', () => {
    const { props } = renderPanel({ entitiesIndex: 1 }) // Collision, Entities, Trees, Ground, Deco
    const dataTransfer = dnd()
    fireEvent.dragStart(rowOf('Collision'), { dataTransfer })
    fireEvent.dragOver(rowOf('Trees'), { dataTransfer })
    fireEvent.drop(rowOf('Trees'), { dataTransfer }) // Entities, Trees, Collision, Ground, Deco
    const next = (props.reorderLayers as ReturnType<typeof vi.fn>).mock.calls[0][0] as { id: string }[]
    expect(next.map((l) => l.id)).toEqual(['img', 'col', 'ground', 'deco'])
    expect(props.setEntitiesIndex).toHaveBeenCalledWith(0)
  })

  it('shows the z-index beside every layer (0 when unset)', () => {
    renderPanel()
    expect(within(rowOf('Trees')).getByTestId('layer-z').textContent).toMatch(/z\s*5/)
    expect(within(rowOf('Deco')).getByTestId('layer-z').textContent).toMatch(/z\s*-1/)
    expect(within(rowOf('Ground')).getByTestId('layer-z').textContent).toMatch(/z\s*0/)
    expect(within(rowOf('Collision')).getByTestId('layer-z').textContent).toMatch(/z\s*0/)
  })

  it('a plain click selects one layer, Ctrl or Cmd+click adds to the selection', () => {
    const { props } = renderPanel()
    fireEvent.click(rowOf('Trees'))
    expect(props.selectLayer).toHaveBeenLastCalledWith('img', false)
    fireEvent.click(rowOf('Deco'), { ctrlKey: true })
    expect(props.selectLayer).toHaveBeenLastCalledWith('deco', true)
    fireEvent.click(rowOf('Collision'), { metaKey: true })
    expect(props.selectLayer).toHaveBeenLastCalledWith('col', true)
  })

  it('clicking the selected layer again deselects it', () => {
    const { props } = renderPanel()
    fireEvent.click(rowOf('Ground')) // 'ground' is the active layer
    expect(props.setActiveLayerId).toHaveBeenCalledWith(null)
    expect(props.selectLayer).not.toHaveBeenCalled()
  })

  it('Ctrl/Cmd+click on the selected layer and clicks within a multi-selection do not deselect', () => {
    const { props } = renderPanel({ selectedLayerIds: ['ground', 'col'] })
    fireEvent.click(rowOf('Ground')) // collapses the multi-selection to this layer
    expect(props.selectLayer).toHaveBeenLastCalledWith('ground', false)
    fireEvent.click(rowOf('Ground'), { ctrlKey: true })
    expect(props.selectLayer).toHaveBeenLastCalledWith('ground', true)
    expect(props.setActiveLayerId).not.toHaveBeenCalled()
  })

  it('marks the extra selected layers, but not the active one, as multi-selected', () => {
    renderPanel({ selectedLayerIds: ['ground', 'col'] })
    expect(rowOf('Ground').getAttribute('data-selected')).toBe('true')
    expect(rowOf('Ground').getAttribute('data-multi')).toBeNull()
    expect(rowOf('Collision').getAttribute('data-multi')).toBe('true')
    expect(rowOf('Deco').getAttribute('data-multi')).toBeNull()
  })

  it('falls back to setActiveLayerId when no selectLayer is given', () => {
    const { props } = renderPanel({ selectLayer: undefined })
    fireEvent.click(rowOf('Trees'))
    expect(props.setActiveLayerId).toHaveBeenCalledWith('img')
  })

  describe('folders', () => {
    const folderLayers = (collapsed = false) => [
      makeLayer('F', { type: 'folder', name: 'Scenery', collapsed }),
      makeLayer('a', { name: 'Ground', folderId: 'F' }),
      makeLayer('b', { type: 'image', name: 'Trees', folderId: 'F' }),
      makeLayer('c', { name: 'Loose' }),
    ]

    it('shows the folder with its layers under it, and a count instead of a z badge', () => {
      renderPanel({ layers: folderLayers() })
      const row = screen.getByTestId('folder-row')
      expect(within(row).getByTestId('folder-count').textContent).toBe('2')
      expect(within(row).queryByTestId('layer-z')).toBeNull()
      expect(screen.getByText('Ground')).toBeInTheDocument()
    })

    it('a closed folder hides its layers; clicking the row opens/closes it without selecting a layer', () => {
      const { props } = renderPanel({ layers: folderLayers(true), toggleFolderCollapsed: vi.fn() })
      expect(screen.queryByText('Ground')).toBeNull()
      expect(screen.getByText('Loose')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('folder-row'))
      expect(props.toggleFolderCollapsed).toHaveBeenCalledWith('F')
      expect(props.selectLayer).not.toHaveBeenCalled()
    })

    it('right-clicking a folder creates a tile or image layer inside it', async () => {
      const { props } = renderPanel({ layers: folderLayers() })
      fireEvent.contextMenu(screen.getByTestId('folder-row'))
      fireEvent.click(await screen.findByText('New Layer inside'))
      fireEvent.click(await screen.findByText('Image Layer'))
      expect(props.createLayerOfType).toHaveBeenCalledWith('image', 'F')
    })

    it('a loose tile layer can be moved into a folder from its menu', async () => {
      const { props } = renderPanel({ layers: folderLayers() })
      fireEvent.contextMenu(screen.getByText('Loose'))
      fireEvent.click(await screen.findByText('Move to folder'))
      fireEvent.click((await screen.findAllByText('Scenery')).pop()!)
      expect(props.reorderLayers).toHaveBeenCalledTimes(1)
      expect(vi.mocked(props.reorderLayers).mock.calls[0][0].find((l) => l.id === 'c')?.folderId).toBe('F')
    })
  })
})
