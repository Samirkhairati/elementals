import { fireEvent, screen, within } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import type { BranchNode, EntityNode, LayerNode, PictureNode, SceneNode } from '../../../shared/sceneTree'
import { entityWithComponents, type ComponentBag } from '../../../shared/sceneEntity'
import { entityView } from '@/lib/sceneIndex'
import { SCHEMA_VERSION } from '../../../shared/engine/types'

/** A layer node (a tile layer unless `type` says otherwise); `visible` / `locked` are only set when given. */
export function makeLayer(id: string, overrides: Record<string, unknown> = {}): LayerNode {
  return { id, name: id, type: 'tile', children: [], ...overrides } as LayerNode
}

/**
 * A Node holding sprites (what an image layer became): `pictures` are nodes, or ids that become sprites of an asset.
 * `ySort: true` in `overrides` makes it a YSort.
 */
export function makeImageLayer(id: string, pictures: (PictureNode | string)[] = [], overrides: Record<string, unknown> = {}): BranchNode {
  const { ySort, ...rest } = overrides
  return { id, name: id, type: ySort ? 'ySort' : 'group', children: pictures.map((p) => (typeof p === 'string' ? makePicture(p) : p)), ...rest } as BranchNode
}

export function makePicture(id: string, overrides: Partial<PictureNode> = {}): PictureNode {
  return { id, type: 'picture', name: id, assetId: 'objects/chest', x: 0, y: 0, children: [], ...overrides }
}

export function makeGroup(id: string, children: SceneNode[] = [], overrides: Record<string, unknown> = {}): SceneNode {
  return { id, type: 'group', name: id, children, ...overrides } as SceneNode
}

/** An entity; components in `overrides.components` that are child nodes (Sprite, Collider, ...) become its children. */
export function makeEntity(id: string, overrides: Record<string, unknown> = {}): EntityNode {
  const { components, ...rest } = overrides
  const node = { id, type: 'entity', name: id, x: 0, y: 0, components: {}, children: [], ...rest } as EntityNode
  return entityWithComponents(node, (components as ComponentBag | undefined) ?? { Transform: { x: 0, y: 0 } })
}

export function makeMap(overrides: Partial<MapData> = {}): MapData {
  return {
    name: 'Test Map',
    fileName: 'test.json',
    folderPath: null,
    width: 10,
    height: 8,
    nodes: [makeLayer('L1')],
    schemaVersion: SCHEMA_VERSION,
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

/** An entity as the editor's entity code reads it (`entityView`: all its components in `components`), for props that take views. */
export const makeEntityView = (id: string, overrides: Record<string, unknown> = {}): EntityNode => entityView(makeEntity(id, overrides))
