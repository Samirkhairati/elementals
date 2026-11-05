import { act, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, useLocation } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { ViewShortcuts } from './ViewShortcuts'
import { MAIN_VIEWS } from '@/lib/views'

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

async function setup(start: string) {
  const root = createRootRoute({ component: () => (<><ViewShortcuts /><Where /></>) })
  const routes = MAIN_VIEWS.map(v => createRoute({ getParentRoute: () => root, path: v.url, component: () => null }))
  const router = createRouter({ routeTree: root.addChildren(routes), history: createMemoryHistory({ initialEntries: [start] }) })
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
}

const press = async (key: string, init: KeyboardEventInit) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}

describe('ViewShortcuts', () => {
  it('Ctrl+Tab and Ctrl+Shift+Tab move between the views', async () => {
    await setup('/editor')
    await press('Tab', { ctrlKey: true })
    expect(screen.getByTestId('where').textContent).toBe('/database')
    await press('Tab', { ctrlKey: true, shiftKey: true })
    expect(screen.getByTestId('where').textContent).toBe('/editor')
  })

  it('Ctrl+number jumps to that view', async () => {
    await setup('/')
    await press('3', { ctrlKey: true, code: 'Digit3' })
    expect(screen.getByTestId('where').textContent).toBe('/database')
  })
})
