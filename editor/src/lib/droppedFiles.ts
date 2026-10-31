// Files dragged in from the OS (Finder / Explorer) onto the editor.

/** PNG files in a drop (other file types and dragged-in text are ignored). */
export function pngFilesOf(dt: DataTransfer | null): File[] {
  if (!dt) return []
  return Array.from(dt.files ?? []).filter((f) => /\.png$/i.test(f.name) || f.type === 'image/png')
}

/** True while the drag carries OS files (not an in-app drag of a tree row). */
export function isFileDrag(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).includes('Files')
}

/** `hero.png` -> `hero` */
export function fileBaseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, '')
}

/**
 * Absolute path of a dropped file, as the project API wants it. Electron resolves it through its preload
 * (`File.path` is gone in sandboxed renderers); the browser harness stages the bytes and returns that path.
 */
export async function pathOfDroppedFile(file: File): Promise<string> {
  const resolve = window.electronAPI?.getPathForFile
  if (!resolve) throw new Error('Dropping files is not supported here; use the file picker instead')
  const path = await resolve(file)
  if (!path) throw new Error(`Could not find "${file.name}" on disk`)
  return path
}
