// Files dragged in from the OS (Finder / Explorer) onto the editor.

/** PNG files in a drop (other file types and dragged-in text are ignored). */
export function pngFilesOf(dt: DataTransfer | null): File[] {
  return dt ? onlyPngs(Array.from(dt.files ?? [])) : []
}

export const onlyPngs = (files: File[]): File[] => files.filter((f) => /\.png$/i.test(f.name) || f.type === 'image/png')

/** A dropped file and the folder it sat in inside a dropped folder (`Trees/oak`, starting with the dropped folder's name; '' = dropped on its own). */
export interface DroppedItem {
  file: File
  dir: string
}

const MAX_DROPPED = 5000
const MAX_DEPTH = 12

const readAll = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = []
    const next = () => reader.readEntries((batch) => { if (batch.length === 0) resolve(out); else { out.push(...batch); next() } }, reject)
    next()
  })

const fileOf = (entry: FileSystemFileEntry): Promise<File> => new Promise((resolve, reject) => entry.file(resolve, reject))

/**
 * The files of a drop with their folders: a dropped folder is walked (nested folders included), a plain file stands
 * alone. Call it inside the drop event, because the browser only hands out the entries there; the walk then goes on
 * asynchronously. Hidden files are skipped. Falls back to `dt.files` where folder entries are not available.
 */
export function readDrop(dt: DataTransfer | null): Promise<DroppedItem[]> {
  if (!dt) return Promise.resolve([])
  const entries = Array.from(dt.items ?? []).flatMap((item) => (item.kind === 'file' && typeof item.webkitGetAsEntry === 'function' ? [item.webkitGetAsEntry()] : []))
  const plain = Array.from(dt.files ?? [])
  if (entries.length === 0 || entries.some((e) => e === null)) return Promise.resolve(plain.map((file) => ({ file, dir: '' })))
  const out: DroppedItem[] = []
  const walk = async (entry: FileSystemEntry, dir: string, depth: number): Promise<void> => {
    if (out.length >= MAX_DROPPED || entry.name.startsWith('.')) return
    if (entry.isFile) out.push({ file: await fileOf(entry as FileSystemFileEntry), dir })
    else if (entry.isDirectory && depth < MAX_DEPTH) {
      const children = await readAll((entry as FileSystemDirectoryEntry).createReader())
      children.sort((a, b) => a.name.localeCompare(b.name))
      for (const child of children) await walk(child, child.isDirectory ? `${dir ? `${dir}/` : ''}${child.name}` : dir, depth + 1)
    }
  }
  return (async () => {
    for (const entry of entries as FileSystemEntry[]) await walk(entry, entry.isDirectory ? entry.name : '', 0)
    return out
  })()
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
  if (path) return path
  // Not a file on disk (a screenshot or a copied image that was pasted): write its bytes to a temp file.
  const stage = window.electronAPI?.stageImage
  if (!stage) throw new Error(`Could not find "${file.name}" on disk`)
  const staged = await stage(file.name, new Uint8Array(await file.arrayBuffer()))
  if (!staged.success) throw new Error(staged.error)
  return staged.sourcePath
}

const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name)

/** `image/jpeg` (or any other picture the browser can draw) as a PNG file; a PNG is returned as it is. */
async function asPng(file: File): Promise<File | null> {
  if (onlyPngs([file]).length > 0) return file
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'))
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' }) : null
  } catch {
    return null
  }
}

/**
 * The pictures on the clipboard as PNG files: a copied image or screenshot, or image files copied in Finder / Explorer.
 * Empty when it holds only text (or nothing usable), so a normal text paste is left alone.
 */
export async function pastedPngs(dt: DataTransfer | null): Promise<File[]> {
  if (!dt) return []
  const files = Array.from(dt.files ?? [])
  if (files.length === 0) for (const item of Array.from(dt.items ?? [])) if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f) }
  const pngs = await Promise.all(files.filter(isImage).map(asPng))
  return pngs.filter((f): f is File => f !== null)
}

/** True when the clipboard carries a picture or file (decided synchronously, before the bytes can be read). */
export function clipboardHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false
  return Array.from(dt.types ?? []).includes('Files') || Array.from(dt.items ?? []).some((i) => i.kind === 'file')
}
