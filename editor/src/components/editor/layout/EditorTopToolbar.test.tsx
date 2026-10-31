/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { EditorTopToolbar } from './EditorTopToolbar'
import { renderWithEditor } from '@/test/editorContext'
import { getCanvasView, resetCanvasView } from '@/hooks/editor/canvas/canvasView'

afterEach(() => resetCanvasView())

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
  it('has a Collider tool next to the paint tools', () => {
    const c = base()
    renderWithEditor(<EditorTopToolbar />, c as any)
    const btn = screen.getByRole('button', { name: /Collider Tool \(C\)/ })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(btn)
    expect(c.setActiveTool).toHaveBeenCalledWith('collider')
  })

  it('marks the active tool', () => {
    renderWithEditor(<EditorTopToolbar />, base({ activeTool: 'collider' }) as any)
    expect(screen.getByRole('button', { name: /Collider Tool/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Brush Tool/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('has a View group that toggles sprites / labels / event badges', () => {
    renderWithEditor(<EditorTopToolbar />, base() as any)
    const group = screen.getByRole('group', { name: 'View' })
    expect(group.querySelectorAll('button')).toHaveLength(3)
    for (const key of ['sprites', 'labels', 'badges'] as const) {
      const btn = screen.getByRole('button', { name: `View ${key}` })
      expect(btn).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(btn)
      expect(getCanvasView()[key]).toBe(false)
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('disables map tools without a map but keeps the View toggles usable', () => {
    renderWithEditor(<EditorTopToolbar />, base({ activeMap: null }) as any)
    expect(screen.getByRole('button', { name: /Collider Tool/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'View sprites' })).toBeEnabled()
    expect(screen.getByText('No map focused')).toBeInTheDocument()
  })
})
