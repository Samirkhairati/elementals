import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { GraphicInfo } from '../../../../../shared/engine/graphics'
import { assetMap, characterMeta, makeAsset, objectMeta } from '@/test/editorContext'
import { groupGraphics, PicturePicker } from './PicturePicker'

const graphic = (id: string, width = 64, height = 32): GraphicInfo => ({ id, width, height, bytes: 1, mtimeMs: 0 })
const graphics = [graphic('scenery/clouds.png'), graphic('scenery/far/hills.png'), graphic('props/rock.png'), graphic('top.png')]
const sprites = Object.values(assetMap(makeAsset('characters/hero', characterMeta()), makeAsset('objects/chest', objectMeta())))

describe('groupGraphics', () => {
  it('groups by folder, sorted, and filters by id', () => {
    expect(groupGraphics(graphics, '').map((g) => g.folder)).toEqual(['', 'props', 'scenery', 'scenery/far'])
    expect(groupGraphics(graphics, 'hill').flatMap((g) => g.items.map((i) => i.id))).toEqual(['scenery/far/hills.png'])
  })
})

describe('PicturePicker', () => {
  const renderPicker = (props: Partial<React.ComponentProps<typeof PicturePicker>> = {}) => {
    const onPick = vi.fn()
    const onOpenChange = vi.fn()
    render(<PicturePicker open onOpenChange={onOpenChange} sprites={sprites} graphics={graphics} images={{}} onPick={onPick} {...props} />)
    return { onPick, onOpenChange }
  }

  it('offers pictures first, then sprites, with counts', () => {
    renderPicker()
    const tabs = screen.getByRole('radiogroup', { name: 'Kind of picture' })
    expect(within(tabs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Pictures · 4', 'Sprites · 2'])
    expect(within(tabs).getByRole('radio', { name: /Pictures/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('picking a sprite reports its asset id and closes', () => {
    const { onPick, onOpenChange } = renderPicker()
    fireEvent.click(screen.getByRole('radio', { name: /Sprites/ }))
    fireEvent.click(screen.getByTitle('objects/chest'))
    expect(onPick).toHaveBeenCalledWith({ assetId: 'objects/chest' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('picking a picture reports its graphic id, found by folder and by search', () => {
    const { onPick } = renderPicker()
    fireEvent.click(screen.getByRole('radio', { name: /Pictures/ }))
    expect(screen.getByText('scenery/far')).toBeInTheDocument() // folder headings
    fireEvent.change(screen.getByLabelText('Search pictures'), { target: { value: 'hills' } })
    expect(screen.queryByTitle('props/rock.png')).toBeNull()
    fireEvent.click(screen.getByTitle('scenery/far/hills.png'))
    expect(onPick).toHaveBeenCalledWith({ graphicId: 'scenery/far/hills.png' })
  })

  it('a single-kind picker shows no tabs, and says when nothing matches', () => {
    renderPicker({ tabs: ['graphics'] })
    expect(screen.queryByRole('radiogroup', { name: 'Kind of picture' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Search pictures'), { target: { value: 'zzz' } })
    expect(screen.getByText('No picture matches “zzz”.')).toBeInTheDocument()
  })

  it('points to the Database when there are no pictures at all', () => {
    renderPicker({ tabs: ['graphics'], graphics: [] })
    expect(screen.getByText(/Import one in Database › Graphics/)).toBeInTheDocument()
  })

  it('browses pictures by folder: the tree on the left narrows the tiles to that folder and below', () => {
    renderPicker()
    const tree = screen.getByTestId('picture-folders')
    fireEvent.click(within(tree).getByText('scenery'))
    expect(screen.getByTitle('scenery/clouds.png')).toBeInTheDocument()
    expect(screen.getByTitle('scenery/far/hills.png')).toBeInTheDocument()
    expect(screen.queryByTitle('props/rock.png')).toBeNull()
    fireEvent.click(within(tree).getByText('All'))
    expect(screen.getByTitle('props/rock.png')).toBeInTheDocument()
  })

  describe('New tab', () => {
    const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })

    it('is the last tab when the caller can add pictures, and shows where they go', () => {
      renderPicker({ onImport: vi.fn(), importTo: 'pasted/city' })
      const tabs = screen.getByRole('radiogroup', { name: 'Kind of picture' })
      expect(within(tabs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Pictures · 4', 'Sprites · 2', 'New'])
      fireEvent.click(within(tabs).getByRole('radio', { name: 'New' }))
      expect(screen.getByText('pasted/city')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Choose file/ })).toBeInTheDocument()
    })

    it('a chosen file is added and the new picture is picked', async () => {
      const onImport = vi.fn(async () => ({ ok: true as const, picks: [{ graphicId: 'pasted/city/shot.png' }] }))
      const { onPick } = renderPicker({ onImport, importTo: 'pasted/city' })
      fireEvent.click(screen.getByRole('radio', { name: 'New' }))
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Choose picture files'), { target: { files: [png()] } })
      })
      await waitFor(() => expect(onPick).toHaveBeenCalledWith({ graphicId: 'pasted/city/shot.png' }))
      expect(onImport).toHaveBeenCalledTimes(1)
    })

    it('a pasted picture is added too, and a failure is shown', async () => {
      const onImport = vi.fn(async () => ({ ok: false as const, error: 'Disk full' }))
      renderPicker({ onImport })
      fireEvent.click(screen.getByRole('radio', { name: 'New' }))
      const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
      Object.defineProperty(paste, 'clipboardData', { value: { files: [png()], items: [] } })
      await act(async () => {
        window.dispatchEvent(paste)
      })
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Disk full'))
    })
  })
})
