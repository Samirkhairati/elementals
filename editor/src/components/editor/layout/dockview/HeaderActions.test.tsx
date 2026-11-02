import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DefaultHeaderActions } from './HeaderActions'

describe('tileset panel header', () => {
  it('has no way to add a tileset: it only points to the Database', () => {
    render(<DefaultHeaderActions panel={{ id: 'tilesets' }} />)
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
    expect(screen.getByRole('link', { name: /Manage/ })).toHaveAttribute('href', '#/database?table=tilesets')
  })
})
