import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

  it('offers sprites and pictures in tabs, with counts', () => {
    renderPicker()
    const tabs = screen.getByRole('radiogroup', { name: 'Kind of picture' })
    expect(within(tabs).getByRole('radio', { name: /Sprites · 2/ })).toBeInTheDocument()
    expect(within(tabs).getByRole('radio', { name: /Pictures · 4/ })).toBeInTheDocument()
  })

  it('picking a sprite reports its asset id and closes', () => {
    const { onPick, onOpenChange } = renderPicker()
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
})
