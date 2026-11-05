import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CheckRow, FieldRow, Group } from './primitives'

describe('explanations live behind an "i", not in the layout', () => {
  it('FieldRow: the help is not on the page until the "i" beside the label is opened, then closes on Esc', () => {
    render(<FieldRow label="Trigger" help="What starts it.">{(id) => <input id={id} />}</FieldRow>)
    expect(screen.queryByText('What starts it.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'About Trigger' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('What starts it.')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('FieldRow without help has no "i"', () => {
    render(<FieldRow label="Name">{(id) => <input id={id} />}</FieldRow>)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('CheckRow: same, and the checkbox still toggles', () => {
    let on = false
    render(<CheckRow checked={on} onChange={(v) => (on = v)} label="Face player" help="It turns towards you." />)
    expect(screen.queryByText('It turns towards you.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'About Face player' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('It turns towards you.')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(on).toBe(true)
  })

  it('Group: the hint sits behind an "i" beside the title', () => {
    render(<Group title="Conditions" hint="All of them must hold.">content</Group>)
    expect(screen.queryByText('All of them must hold.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'About Conditions' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('All of them must hold.')
    expect(screen.getByText('content')).toBeTruthy()
  })
})
