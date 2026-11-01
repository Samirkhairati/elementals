import { describe, expect, it, vi } from 'vitest'

const built: { template: unknown } = { template: null }
const openPath = vi.fn((_path: string) => Promise.resolve(''))
vi.mock('electron', () => ({
  app: { name: 'Elementals' },
  shell: { openPath: (p: string) => openPath(p) },
  Menu: {
    buildFromTemplate: (template: unknown) => {
      built.template = template
      return template
    },
    setApplicationMenu: () => {},
  },
}))

import { setupMenu } from './menu'

interface Item {
  label?: string
  role?: string
  type?: string
  click?: () => void
  submenu?: Item[]
}

function find(items: Item[], ...path: string[]): Item | undefined {
  let level: Item[] | undefined = items
  let found: Item | undefined
  for (const label of path) {
    found = level?.find((i) => i.label === label)
    level = found?.submenu
  }
  return found
}

describe('File > Reveal Project Folder', () => {
  it('opens the project folder the editor saves to', () => {
    setupMenu({ webContents: { send: vi.fn() } } as never, '/work/elementals/project')
    const item = find(built.template as Item[], 'File', 'Reveal Project Folder')
    expect(item).toBeDefined()
    item?.click?.()
    expect(openPath).toHaveBeenCalledWith('/work/elementals/project')
  })

  it('is left out when no project folder is given', () => {
    setupMenu({ webContents: { send: vi.fn() } } as never)
    expect(find(built.template as Item[], 'File', 'Reveal Project Folder')).toBeUndefined()
  })
})

describe('View > Appearance > Select Tabs', () => {
  const send = vi.fn()
  setupMenu({ webContents: { send } } as never)
  const template = built.template as Item[]

  it('has an entry for the Database panel', () => {
    const tabs = ['View', 'Appearance', 'Select Tabs']
    expect(find(template, ...tabs, 'Database (switches & variables)')).toBeDefined()
  })

  it('toggles the panels through the existing dockview-toggle-panel channel', () => {
    find(template, 'View', 'Appearance', 'Select Tabs', 'Database (switches & variables)')?.click?.()
    expect(send).toHaveBeenCalledWith('dockview-toggle-panel', 'database')
  })

  it('keeps the existing entries and Reset Layout', () => {
    const tabs = ['View', 'Appearance', 'Select Tabs']
    for (const label of ['Maps Panel', 'Layers Panel', 'Entities Panel', 'Properties Panel', 'Tileset Browser', 'Tileset Preview', 'Active Selection']) {
      expect(find(template, ...tabs, label)).toBeDefined()
    }
    find(template, 'View', 'Appearance', 'Reset Layout')?.click?.()
    expect(send).toHaveBeenCalledWith('dockview-reset-layout')
  })
})
