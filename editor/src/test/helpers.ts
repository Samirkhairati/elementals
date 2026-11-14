import { fireEvent, screen, within } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import type { EntityNode, LayerNode, PictureNode, SceneNode } from '../../../shared/sceneTree'

/** A layer node (a tile layer unless `type` says otherwise); `visible` / `locked` are only set when given. */
export function makeLayer(id: string, overrides: Record<string, unknown> = {}): LayerNode {
  return { id, name: id, type: 'tile', ...overrides } as LayerNode
}

/** An image layer holding `pictures` (nodes, or ids that become pictures of an asset). */
export function makeImageLayer(id: string, pictures: (PictureNode | string)[] = [], overrides: Record<string, unknown> = {}): LayerNode {
  return { id, name: id, type: 'image', children: pictures.map((p) => (typeof p === 'string' ? makePicture(p) : p)), ...overrides } as LayerNode
}

export function makePicture(id: string, overrides: Partial<PictureNode> = {}): PictureNode {
  return { id, type: 'picture', name: id, assetId: 'objects/chest', x: 0, y: 0, ...overrides }
}

export function makeGroup(id: string, children: SceneNode[] = [], overrides: Record<string, unknown> = {}): SceneNode {
  return { id, type: 'group', name: id, children, ...overrides } as SceneNode
}

export function makeEntity(id: string, overrides: Record<string, unknown> = {}): EntityNode {
  return { id, type: 'entity', name: id, x: 0, y: 0, components: { Transform: { x: 0, y: 0 } }, ...overrides } as EntityNode
}

export function makeMap(overrides: Partial<MapData> = {}): MapData {
  return {
    name: 'Test Map',
    fileName: 'test.json',
    folderPath: null,
    width: 10,
    height: 8,
    nodes: [makeLayer('L1')],
    schemaVersion: 6,
    ...overrides,
  }
}

type AnyFn = (...args: never[]) => unknown

/** Install a fake `window.electronAPI`; every unspecified method resolves `{ success: true }`. */
export function installElectronAPI(overrides: Record<string, AnyFn | undefined> = {}) {
  const api = new Proxy(overrides as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return () => Promise.resolve({ success: true })
    },
  })
  ;(window as unknown as { electronAPI: unknown }).electronAPI = api
  return api
}

export function uninstallElectronAPI() {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
}

/** Opens a themed `Select` (its trigger element) and picks the option with this value. */
export function chooseOption(trigger: HTMLElement, value: string) {
  fireEvent.click(trigger)
  const list = within(document.body).getByRole('listbox')
  const option = list.querySelector<HTMLElement>(`[role="option"][data-value="${value.replace(/"/g, '\\"')}"]`)
  if (!option) throw new Error(`The dropdown has no option "${value}"`)
  fireEvent.click(option)
}

/** `chooseOption` for the dropdown with this accessible name. */
export function pickOption(name: string | RegExp, value: string) {
  chooseOption(screen.getByRole('combobox', { name }), value)
}
