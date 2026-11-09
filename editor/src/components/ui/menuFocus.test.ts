import { afterEach, describe, expect, it } from 'vitest'
import { keepFocusInOpenDialog } from './menuFocus'

afterEach(() => { document.body.innerHTML = '' })

const closeEvent = () => new Event('focusScope.unmountAutoFocus', { cancelable: true })

describe('keepFocusInOpenDialog', () => {
  it('stops the menu from taking focus back while a dialog is open', () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>'
    const e = closeEvent()
    keepFocusInOpenDialog(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('also covers alert dialogs', () => {
    document.body.innerHTML = '<div role="alertdialog" data-state="open"></div>'
    const e = closeEvent()
    keepFocusInOpenDialog(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('puts focus on the dialog\'s confirm button so Enter works at once', () => {
    document.body.innerHTML = '<button id="trigger">row</button><div role="dialog" data-state="open"><button>Cancel</button><button data-dialog-confirm>Delete</button></div>'
    document.getElementById('trigger')!.focus()
    keepFocusInOpenDialog(closeEvent())
    expect(document.activeElement?.textContent).toBe('Delete')
  })

  it('leaves focus where it is when it is already inside the dialog', () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"><input id="name" /><button data-dialog-confirm>OK</button></div>'
    document.getElementById('name')!.focus()
    keepFocusInOpenDialog(closeEvent())
    expect(document.activeElement?.id).toBe('name')
  })

  it('lets focus return to the trigger when no dialog is open', () => {
    document.body.innerHTML = '<div role="dialog" data-state="closed"></div>'
    const e = closeEvent()
    keepFocusInOpenDialog(e)
    expect(e.defaultPrevented).toBe(false)
  })
})
