import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { resetLookLibrary } from '@/lib/look/lookLibrary'
import { getLookView, resetLookView } from '@/lib/look/lookView'
import { LookToolbarMenu } from './LookToolbarMenu'

const open = () => fireEvent.pointerDown(screen.getByRole('button', { name: 'Look profile' }), { button: 0, ctrlKey: false })

describe('LookToolbarMenu', () => {
  beforeEach(() => {
    resetLookLibrary({ loaded: true, file: { version: 1, profiles: [{ id: 'day', name: 'Day' }, { id: 'night', name: 'Night' }] }, shaders: [] })
    resetLookView()
  })

  it('choosing a profile sets the view profile', () => {
    render(<LookToolbarMenu onOpenPanel={vi.fn()} />)
    open()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Night' }))
    expect(getLookView().profile).toBe('night')
    expect(getLookView().enabled).toBe(true)
  })

  it('choosing Default clears the profile', () => {
    resetLookView({ profile: 'day' })
    render(<LookToolbarMenu onOpenPanel={vi.fn()} />)
    open()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Default' }))
    expect(getLookView().profile).toBeNull()
  })

  it('unchecking Show looks turns looks off', () => {
    render(<LookToolbarMenu onOpenPanel={vi.fn()} />)
    open()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Show looks' }))
    expect(getLookView().enabled).toBe(false)
  })

  it('Open Look panel calls back', () => {
    const onOpenPanel = vi.fn()
    render(<LookToolbarMenu onOpenPanel={onOpenPanel} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: /Open Look panel/ }))
    expect(onOpenPanel).toHaveBeenCalled()
  })
})
