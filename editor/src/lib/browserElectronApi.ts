/**
 * `window.electronAPI` for a plain browser (dev only, installed by main.tsx when Electron's preload is absent).
 * Every call is forwarded to the Vite dev server's project API (editor/vite-plugin-project-api.ts), which runs
 * the same stores as the Electron main process against the real project files. See docs/editor-harness.md.
 */

type ElectronAPI = Window['electronAPI']
type Result = { success: boolean; error?: string; [key: string]: unknown }

export const API_BASE = '/__api/'

/** POST one channel call; transport failures become `{ success: false, error }` like store failures. */
export async function callChannel(channel: string, ...args: unknown[]): Promise<Result> {
  try {
    const response = await fetch(`${API_BASE}${channel}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
    const body: unknown = await response.json().catch(() => null)
    if (body && typeof body === 'object' && 'success' in body) return body as Result
    return { success: false, error: `Project API answered ${response.status} for "${channel}"` }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

/** Upload `bytes` to the harness; the returned `sourcePath` is what `importTileset` / `importSprite` accept. */
export function stageUpload(name: string, bytes: Uint8Array): Promise<Result> {
  return callChannel('stage-upload', name, bytesToBase64(bytes))
}

/** Stand-in for the native "open file" dialog: a file input, then stage the chosen PNG. */
function pickPng(): Promise<Result> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.png,image/png'
    input.addEventListener('cancel', () => resolve({ success: false, canceled: true }))
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return resolve({ success: false, canceled: true })
      resolve(await stageUpload(file.name, new Uint8Array(await file.arrayBuffer())))
    })
    input.click()
  })
}

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function createBrowserElectronApi(): ElectronAPI {
  const c = callChannel
  const api = {
    ping: async () => undefined,
    // tilesets
    getTilesets: () => c('get-tilesets'),
    pickTilesetFile: () => pickPng(),
    importTileset: (sourcePath: string, name: string, folderPath: string | null) => c('import-tileset', sourcePath, name, folderPath),
    createFolder: (parent: string | null, name: string) => c('create-folder', parent, name),
    renameFolder: (oldPath: string, newName: string) => c('rename-folder', oldPath, newName),
    renameTileset: (folder: string | null, file: string, newName: string) => c('rename-tileset', folder, file, newName),
    moveTileset: (file: string, oldFolder: string | null, newFolder: string | null) => c('move-tileset', file, oldFolder, newFolder),
    deleteFolder: (folderPath: string) => c('delete-folder', folderPath),
    // maps
    getMaps: () => c('get-maps'),
    createMap: (name: string, width: number, height: number, folderPath: string | null) => c('create-map', name, width, height, folderPath),
    saveMap: (folderPath: string | null, fileName: string, mapData: unknown) => c('save-map', folderPath, fileName, mapData),
    deleteMap: (folderPath: string | null, fileName: string) => c('delete-map', folderPath, fileName),
    createMapFolder: (parent: string | null, name: string) => c('create-map-folder', parent, name),
    deleteMapFolder: (folderPath: string) => c('delete-map-folder', folderPath),
    renameMapFolder: (oldPath: string, newName: string) => c('rename-map-folder', oldPath, newName),
    renameMap: (folder: string | null, file: string, newName: string) => c('rename-map', folder, file, newName),
    moveMap: (file: string, oldFolder: string | null, newFolder: string | null) => c('move-map', file, oldFolder, newFolder),
    exportMap: async (jsonData: string, defaultName: string) => {
      const result = await c('export-map', jsonData, defaultName)
      if (result.success && typeof result.json === 'string') download(String(result.fileName ?? defaultName), result.json)
      return { success: result.success, error: result.error }
    },
    // sprites + database
    getPathForFile: async (file: File) => {
      const staged = await stageUpload(file.name, new Uint8Array(await file.arrayBuffer()))
      if (!staged.success || typeof staged.sourcePath !== 'string') throw new Error(staged.error ?? 'Could not stage the dropped file')
      return staged.sourcePath
    },
    getSprites: () => c('get-sprites'),
    pickSpriteFile: () => pickPng(),
    importSprite: (sourcePath: string, options: unknown) => c('import-sprite', sourcePath, options),
    saveSpriteMeta: (id: string, meta: unknown) => c('save-sprite-meta', id, meta),
    renameSprite: (id: string, newId: string) => c('rename-sprite', id, newId),
    deleteSprite: (id: string) => c('delete-sprite', id),
    createSpriteFolder: (parentId: string | null, name: string) => c('create-sprite-folder', parentId, name),
    renameSpriteFolder: (folderId: string, newName: string) => c('rename-sprite-folder', folderId, newName),
    moveSpriteFolder: (folderId: string, newParentId: string | null) => c('move-sprite-folder', folderId, newParentId),
    deleteSpriteFolder: (folderId: string) => c('delete-sprite-folder', folderId),
    getDatabase: () => c('get-database'),
    saveDatabase: (database: unknown) => c('save-database', database),
    // There is no native menu in a browser.
    onTogglePanel: () => () => {},
    onResetLayout: () => () => {},
  }
  return api as unknown as ElectronAPI
}

/** Install the shim as `window.electronAPI` (no-op when one already exists). Also exposes QA helpers. */
export function installBrowserElectronApi(): void {
  if (window.electronAPI) return
  window.electronAPI = createBrowserElectronApi()
  ;(window as unknown as { __elementalsHarness: unknown }).__elementalsHarness = {
    call: callChannel,
    stageUpload,
  }
  console.info('[harness] window.electronAPI is served by the Vite dev server (/__api), project files are real.')
}
