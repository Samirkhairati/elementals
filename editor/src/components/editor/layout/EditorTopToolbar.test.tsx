/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { EditorTopToolbar } from './EditorTopToolbar'
import { renderWithEditor } from '@/test/editorContext'
import { getCanvasView, resetCanvasView } from '@/hooks/editor/canvas/canvasView'
import { useGridStore } from '@/store/gridStore'

afterEach(() => {
  resetCanvasView()
  useGridStore.getState().resetGrid()
})

const base = (over: Record<string, any> = {}) => ({
  activeMap: { name: 'Town', fileName: 'town.json', width: 30, height: 20 },
  historyIndex: 1,
  historyLength: 3,
  handleUndo: vi.fn(),
  handleRedo: vi.fn(),
  activeTool: 'brush',
  setActiveTool: vi.fn(),
  paintMode: 'discontinuous',
  setPaintMode: vi.fn(),
  showGrid: true,
  toggleShowGrid: vi.fn(),
  snapToGrid: true,
  toggleSnapToGrid: vi.fn(),
  ...over,
})

describe('EditorTopToolbar', () => {
  it('has no Collider tool: colliders are edited from the Properties panel only', () => {
    renderWithEditor(<EditorTopToolbar />, base() as any)
    expect(screen.queryByRole('button', { name: /Collider Tool/ })).toBeNull()
  })

  it('marks the active tool', () => {
    renderWithEditor(<EditorTopToolbar />, base({ activeTool: 'eraser' }) as any)
    expect(screen.getByRole('button', { name: /Eraser Tool/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Brush Tool/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('has a View group that toggles sprites / labels / event badges (and Clip to map)', () => {
    renderWithEditor(<EditorTopToolbar />, base() as any)
    const group = screen.getByRole('group', { name: 'View' })
    expect(group.querySelectorAll('button')).toHaveLength(4)
    for (const key of ['sprites', 'labels', 'badges'] as const) {
      const btn = screen.getByRole('button', { name: `View ${key}` })
      expect(btn).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(btn)
      expect(getCanvasView()[key]).toBe(false)
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('Clip to map starts off, turns on and off, and is remembered in the view settings', () => {
    renderWithEditor(<EditorTopToolbar />, base() as any)
    const btn = screen.getByRole('button', { name: 'View clip' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(getCanvasView().clip).toBe(false)
    fireEvent.click(btn)
    expect(getCanvasView().clip).toBe(true)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(getCanvasView().clip).toBe(false)
  })

  it('has a lock that ties pictures to their own layer (on by default) and can be turned off', () => {
    renderWithEditor(<EditorTopToolbar />, base() as any)
    const lock = screen.getByRole('button', { name: 'Lock pictures to their layer' })
    expect(lock).toHaveAttribute('aria-pressed', 'true')
    expect(getCanvasView().lockImages).toBe(true)
    fireEvent.click(lock)
    expect(getCanvasView().lockImages).toBe(false)
    expect(lock).toHaveAttribute('aria-pressed', 'false')
  })

  it('disables map tools without a map but keeps the View toggles usable', () => {
    renderWithEditor(<EditorTopToolbar />, base({ activeMap: null }) as any)
    expect(screen.getByRole('button', { name: /Brush Tool/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'View sprites' })).toBeEnabled()
    expect(screen.getByText('No map focused')).toBeInTheDocument()
  })

  describe('picture grid settings', () => {
    const open = () => {
      renderWithEditor(<EditorTopToolbar />, base() as any)
      fireEvent.contextMenu(screen.getByRole('button', { name: 'Grid snapping' }))
    }

    it('right-click on the grid snapping button opens the settings, a plain click still toggles snapping', () => {
      const toggleSnapToGrid = vi.fn()
      renderWithEditor(<EditorTopToolbar />, base({ toggleSnapToGrid }) as any)
      fireEvent.click(screen.getByRole('button', { name: 'Grid snapping' }))
      expect(toggleSnapToGrid).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog', { name: 'Picture grid settings' })).toBeNull()
      fireEvent.contextMenu(screen.getByRole('button', { name: 'Grid snapping' }))
      expect(screen.getByRole('dialog', { name: 'Picture grid settings' })).toBeTruthy()
      expect(toggleSnapToGrid).toHaveBeenCalledTimes(1)
    })

    it('edits size and offset, which are stored for every map, and resets them', () => {
      open()
      const field = (label: string, value: string) => {
        const input = screen.getByLabelText(label) as HTMLInputElement
        fireEvent.change(input, { target: { value } })
        fireEvent.blur(input)
      }
      field('Grid size X', '16')
      field('Grid size Y', '24')
      field('Grid offset X', '4')
      field('Grid offset Y', '6')
      expect(useGridStore.getState().grid).toEqual({ sizeX: 16, sizeY: 24, offsetX: 4, offsetY: 6 })
      fireEvent.click(screen.getByRole('button', { name: 'Reset the picture grid' }))
      expect(useGridStore.getState().grid).toEqual({ sizeX: 32, sizeY: 32, offsetX: 0, offsetY: 0 })
    })

    it('keeps an offset inside one cell and closes on Esc', () => {
      open()
      const input = screen.getByLabelText('Grid offset X') as HTMLInputElement
      fireEvent.change(input, { target: { value: '40' } })
      fireEvent.blur(input)
      expect(useGridStore.getState().grid.offsetX).toBe(8)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Picture grid settings' })).toBeNull()
    })
  })
})
