import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { TextField } from '../ui/controls'
import { ConfirmKeys } from '../ui/ConfirmKeys'
import { ConfirmDialog } from './ConfirmDialog'
import { ConfirmFooter } from './ConfirmParts'

describe('ConfirmDialog', () => {
  const setup = () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmDialog open title="Delete Layer" description="Are you sure?" onClose={onClose} onConfirm={onConfirm} />)
    return { onConfirm, onClose }
  }

  it('puts focus on Delete (never on Cancel), so the browser itself makes Enter delete', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('deleting closes the dialog', () => {
    const { onConfirm, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Enter deletes when focus is elsewhere in the dialog, and Esc cancels without deleting', async () => {
    const { onConfirm, onClose } = setup()
    const dialog = screen.getByRole('dialog')
    dialog.focus()
    fireEvent.keyDown(dialog, { key: 'Enter' })
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))

    onConfirm.mockClear()
    onClose.mockClear()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('leaves Enter on the focused Cancel button to the button itself (it must not delete)', async () => {
    const { onConfirm } = setup()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter' })
    await new Promise((r) => setTimeout(r, 10))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('still deletes with Ctrl+Backspace', () => {
    const { onConfirm } = setup()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Backspace', ctrlKey: true })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the keys on the buttons without changing their names', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveTextContent('Esc')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveTextContent('↵')
  })
})

describe('Enter in a dialog', () => {
  function Host({ onConfirm }: { onConfirm: (v: string) => void }) {
    const [value, setValue] = useState('a')
    return (
      <Dialog open>
        <DialogContent>
          <TextField aria-label="Name" value={value} onCommit={setValue} />
          <textarea aria-label="Notes" />
          <ConfirmFooter tone="primary" onCancel={() => undefined} onConfirm={() => onConfirm(value)} confirmLabel="Save" />
        </DialogContent>
      </Dialog>
    )
  }

  it('confirms from a field that is not in a form, with what was just typed', async () => {
    const onConfirm = vi.fn()
    render(<Host onConfirm={onConfirm} />)
    const field = screen.getByLabelText('Name')
    fireEvent.change(field, { target: { value: 'b' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('b'))
  })

  it('leaves Enter alone in a text area', async () => {
    const onConfirm = vi.fn()
    render(<Host onConfirm={onConfirm} />)
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Enter' })
    await new Promise((r) => setTimeout(r, 10))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does nothing while the confirm button is disabled', async () => {
    const onConfirm = vi.fn()
    render(
      <Dialog open>
        <DialogContent>
          <ConfirmFooter onCancel={() => undefined} onConfirm={onConfirm} confirmLabel="Delete" disabled />
        </DialogContent>
      </Dialog>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    await new Promise((r) => setTimeout(r, 10))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('ConfirmKeys (inline confirmations)', () => {
  it('Enter confirms, Esc cancels, and Esc does not reach a dialog around it', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const outer = vi.fn()
    render(<div onKeyDown={outer}><ConfirmKeys onConfirm={onConfirm} onCancel={onCancel} /></div>)
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('leaves Enter to a focused field or button', () => {
    const onConfirm = vi.fn()
    render(<><input aria-label="x" /><ConfirmKeys onConfirm={onConfirm} onCancel={() => undefined} /></>)
    fireEvent.keyDown(screen.getByLabelText('x'), { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('stops listening once unmounted', () => {
    const onCancel = vi.fn()
    const { unmount } = render(<ConfirmKeys onConfirm={() => undefined} onCancel={onCancel} />)
    unmount()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })
})
