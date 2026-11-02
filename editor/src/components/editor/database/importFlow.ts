// What importing pictures into a library needs, apart from the dialog itself: turning picked or dropped files into
// candidates, and one `Importer` per library (graphics, tilesets) that knows its folders, its taken names and how to
// copy a file in.

import { folderOfId, joinId, leafOfId } from '@/lib/assetOps'
import { onlyPngs, pathOfDroppedFile } from '@/lib/droppedFiles'
import { sanitizeStem } from '@/lib/importNames'
import type { DatabaseData } from './useDatabaseData'

/** A picture waiting to be imported. */
export interface Candidate {
  key: string
  /** Absolute path the project API copies from. */
  path: string
  /** What the file is called on disk now. */
  fileName: string
  /** Something an <img> can show ('' = none). */
  preview: string
  /** Came from the clipboard: gets a free name of its own instead of whatever the clipboard calls it. */
  pasted?: boolean
}

export interface ImportRow {
  path: string
  /** The name to file it under, without the extension. */
  name: string
}

export interface ImportResult {
  /** Ids of what was imported (the last one gets selected). */
  imported: string[]
  /** Rows that failed, by candidate path. */
  failed: { path: string; error: string }[]
}

export interface Importer {
  /** "picture" / "tileset", for the dialog's wording. */
  noun: string
  /** Folders to import into ('' = the top level is always offered by the dialog). */
  folders: string[]
  /** Names (lower-cased) that cannot be used in `folder`. */
  taken: (folder: string) => Set<string>
  run: (rows: ImportRow[], folder: string) => Promise<ImportResult>
}

let counter = 0
const nextKey = () => `import-${++counter}`

/** Candidates from the native multi-select dialog; null when it was cancelled. */
export async function pickCandidates(): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; error: string; canceled?: boolean }> {
  try {
    const r = await window.electronAPI?.pickImageFiles()
    if (!r) return { ok: false, error: 'The editor API is not available' }
    if (r.success) return { ok: true, candidates: r.files.map((f) => ({ key: nextKey(), path: f.sourcePath, fileName: `${f.defaultName}.png`, preview: f.previewUrl })) }
    if (r.canceled) return { ok: false, error: '', canceled: true }
    return { ok: false, error: r.error }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Candidates from files dropped in from the OS (anything that is not a PNG is left out and counted). */
export async function dropCandidates(files: File[], options: { pasted?: boolean } = {}): Promise<{ ok: true; candidates: Candidate[]; skipped: number } | { ok: false; error: string }> {
  const pngs = onlyPngs(files)
  if (pngs.length === 0) return { ok: false, error: files.length > 0 ? 'Only PNG images can be imported.' : '' }
  try {
    const candidates = await Promise.all(
      pngs.map(async (file) => ({
        key: nextKey(),
        path: await pathOfDroppedFile(file),
        // Screenshots and copied images arrive as "image.png"; call them "pasted" instead.
        fileName: options.pasted && /^(image)?\.?(png)?$/i.test(file.name) ? 'pasted.png' : file.name,
        preview: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
        ...(options.pasted ? { pasted: true } : {}),
      }))
    )
    return { ok: true, candidates, skipped: files.length - pngs.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export const defaultRowName = (c: Candidate, fallback: string) => sanitizeStem(c.fileName, fallback)

/** The default names of a batch: a pasted picture whose name is taken (or used earlier in the batch) gets `-2`, `-3`... */
export function defaultRowNames(candidates: Candidate[], fallback: string, taken: ReadonlySet<string>): string[] {
  const used = new Set(taken)
  return candidates.map((c) => {
    const base = defaultRowName(c, fallback)
    let name = base
    if (c.pasted) for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}`
    used.add(name.toLowerCase())
    return name
  })
}

const failure = (path: string, error: string) => ({ path, error })

export function graphicImporter(data: DatabaseData): Importer {
  const { graphics, graphicFolders } = data.sprites
  const ids = graphics.map((g) => g.id)
  return {
    noun: 'picture',
    folders: [...new Set([...graphicFolders, ...ids.map(folderOfId).filter(Boolean)])].sort(),
    taken: (folder) => new Set(ids.filter((id) => folderOfId(id) === folder).map((id) => leafOfId(id).replace(/\.png$/i, '').toLowerCase())),
    run: async (rows, folder) => {
      const result: ImportResult = { imported: [], failed: [] }
      for (const row of rows) {
        const id = joinId(folder, `${row.name}.png`)
        const r = await data.sprites.importGraphic(row.path, id)
        if (r.ok) result.imported.push(id)
        else result.failed.push(failure(row.path, r.error))
      }
      return result
    },
  }
}

export function tilesetImporter(data: DatabaseData): Importer {
  const { tilesets, tilesetFolders } = data
  return {
    noun: 'tileset',
    folders: [...new Set(tilesetFolders)].sort(),
    // Maps find a tileset by its file name alone, so a name is taken whatever folder holds it.
    taken: () => new Set(tilesets.map((t) => t.fileName.replace(/\.png$/i, '').toLowerCase())),
    run: async (rows, folder) => {
      const result: ImportResult = { imported: [], failed: [] }
      for (const row of rows) {
        const r = await data.tilesetOps.importTileset(row.path, row.name, folder || null, row.name)
        if (r.ok) result.imported.push(r.tileset.fileName)
        else result.failed.push(failure(row.path, r.error))
      }
      return result
    },
  }
}
