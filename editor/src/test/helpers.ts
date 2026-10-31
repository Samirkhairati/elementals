import type { EntityData, Layer, MapData } from '@/types/editor'

export function makeLayer(id: string, overrides: Partial<Layer> = {}): Layer {
  return { id, name: id, type: 'tile', visible: true, locked: false, ...overrides }
}

export function makeEntity(id: string, overrides: Partial<EntityData> = {}): EntityData {
  return { id, name: id, x: 0, y: 0, visible: true, folder: null, components: { Transform: { x: 0, y: 0 } }, ...overrides }
}

export function makeMap(overrides: Partial<MapData> = {}): MapData {
  return {
    name: 'Test Map',
    fileName: 'test.json',
    folderPath: null,
    width: 10,
    height: 8,
    layers: [makeLayer('L1')],
    entities: [],
    entityFolders: [],
    schemaVersion: 4,
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
