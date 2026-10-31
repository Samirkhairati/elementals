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
  it('has no Collider tool: colliders are edited from the Properties panel only', () => {
    renderWithEditor(<EditorTopToolbar />, base() as any)
    expect(screen.queryByRole('button', { name: /Collider Tool/ })).toBeNull()
  })

  it('marks the active tool', () => {
    renderWithEditor(<EditorTopToolbar />, base({ activeTool: 'eraser' }) as any)
    expect(screen.getByRole('button', { name: /Eraser Tool/ })).toHaveAttribute('aria-pressed', 'true')
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
    expect(screen.getByRole('button', { name: /Brush Tool/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'View sprites' })).toBeEnabled()
    expect(screen.getByText('No map focused')).toBeInTheDocument()
  })
})
