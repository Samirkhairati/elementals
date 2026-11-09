// What importing pictures into a library needs, apart from the dialog itself: turning picked or dropped files into
// candidates, and one `Importer` per library (graphics, tilesets) that knows its folders, its taken names and how to
// copy a file in.

import { folderOfId, joinDirs, joinId, leafOfId } from '@/lib/assetOps'
import { imageKindOf, onlyImages, pathOfDroppedFile, type DroppedItem } from '@/lib/droppedFiles'
import { sanitizeDir, sanitizeStem } from '@/lib/importNames'
import type { DatabaseData } from './useDatabaseData'

/** A picture waiting to be imported. */
export interface Candidate {
  key: string
  /** Absolute path the project API copies from. */
  path: string
  /** What the file is called on disk now. */
  fileName: string
  /** PNG (the default) or GIF: a GIF is an animation and can only go into the Graphics library. */
  ext?: 'png' | 'gif'
  /** Something an <img> can show ('' = none). */
  preview: string
  /** Folder below the destination it goes into, when it came out of an imported folder (`Trees/oak`, library-safe; '' = the destination itself). */
  dir?: string
  /** Came from the clipboard: gets a free name of its own instead of whatever the clipboard calls it. */
  pasted?: boolean
}

export type ImageKind = 'png' | 'gif'

export interface ImportRow {
  path: string
  /** The extension the file keeps in the library. */
  ext: ImageKind
  /** Folder below the destination ('' = the destination itself). */
  dir: string
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
  /** Kinds of image this library takes (tilesets: PNG only). */
  accepts: readonly ImageKind[]
  /** Folders to import into ('' = the top level is always offered by the dialog). */
  folders: string[]
  /** Names (lower-cased) that cannot be used in `folder`. */
  taken: (folder: string) => Set<string>
  /** Names have to be free in every folder at once (tilesets: maps find one by its file name alone). */
  flat?: boolean
  run: (rows: ImportRow[], folder: string) => Promise<ImportResult>
}

let counter = 0
const nextKey = () => `import-${++counter}`

/** Candidates from the native multi-select dialog; null when it was cancelled. */
export async function pickCandidates(): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; error: string; canceled?: boolean }> {
  try {
    const r = await window.electronAPI?.pickImageFiles()
    if (!r) return { ok: false, error: 'The editor API is not available' }
    if (r.success) return { ok: true, candidates: r.files.map((f) => ({ key: nextKey(), path: f.sourcePath, fileName: `${f.defaultName}.${f.ext ?? 'png'}`, ext: f.ext ?? 'png', preview: f.previewUrl })) }
    if (r.canceled) return { ok: false, error: '', canceled: true }
    return { ok: false, error: r.error }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** What a folder import found: the candidates, and how many files were left out (not PNGs, or past the limit). */
export type FolderPick = { ok: true; candidates: Candidate[]; skipped: number; truncated: boolean } | { ok: false; error: string; canceled?: boolean }

/** Candidates from the native folder dialog: every PNG below the chosen folder, with its place in it. */
export async function pickFolderCandidates(): Promise<FolderPick> {
  try {
    const r = await window.electronAPI?.pickImageFolder()
    if (!r) return { ok: false, error: 'The editor API is not available' }
    if (r.success) {
      const candidates = r.files.map((f) => ({ key: nextKey(), path: f.sourcePath, fileName: `${f.defaultName}.${f.ext ?? 'png'}`, ext: f.ext ?? 'png', preview: f.previewUrl, dir: sanitizeDir(f.dir) }))
      return { ok: true, candidates, skipped: r.skipped, truncated: r.truncated }
    }
    if (r.canceled) return { ok: false, error: '', canceled: true }
    return { ok: false, error: r.error }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Candidates from files dropped in from the OS (anything that is not a PNG is left out and counted). */
export async function dropCandidates(items: DroppedItem[], options: { pasted?: boolean; accept?: readonly ImageKind[] } = {}): Promise<{ ok: true; candidates: Candidate[]; skipped: number } | { ok: false; error: string }> {
  const accept = options.accept ?? ['png']
  const dirs = new Map(items.map((i) => [i.file, sanitizeDir(i.dir)]))
  const files = items.map((i) => i.file)
  const pngs = onlyImages(files, accept)
  if (pngs.length === 0) {
    const onlyGifs = files.length > 0 && !accept.includes('gif') && files.every((f) => imageKindOf(f) === 'gif')
    return { ok: false, error: files.length === 0 ? '' : onlyGifs ? 'GIF animations can only be imported into Graphics.' : accept.includes('gif') ? 'Only PNG and GIF images can be imported.' : 'Only PNG images can be imported.' }
  }
  try {
    const candidates = await Promise.all(
      pngs.map(async (file) => ({
        key: nextKey(),
        path: await pathOfDroppedFile(file),
        dir: dirs.get(file) ?? '',
        ext: imageKindOf(file) ?? ('png' as ImageKind),
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

/** Dropped files with no folder of their own (a plain drop, or a paste). */
export const looseFiles = (files: File[]): DroppedItem[] => files.map((file) => ({ file, dir: '' }))

/** The candidates this library takes, and how many were left out (a GIF offered to the tilesets). */
export function acceptable(candidates: Candidate[], accepts: readonly ImageKind[]): { candidates: Candidate[]; left: number } {
  const kept = candidates.filter((c) => accepts.includes(c.ext ?? 'png'))
  return { candidates: kept, left: candidates.length - kept.length }
}

export const defaultRowName = (c: Candidate, fallback: string) => sanitizeStem(c.fileName, fallback)

/**
 * The default names of a batch: a pasted picture whose name is taken (or used earlier in the batch) gets `-2`, `-3`...
 * `takenIn(dir)` is what exists in the folder `dir` below the destination; `flat` makes every folder share one set of names.
 */
export function defaultRowNames(candidates: Candidate[], fallback: string, takenIn: (dir: string) => ReadonlySet<string>, flat = false): string[] {
  const used = new Map<string, Set<string>>()
  return candidates.map((c) => {
    const dir = c.dir ?? ''
    const scope = flat ? '' : dir
    if (!used.has(scope)) used.set(scope, new Set())
    const names = used.get(scope) as Set<string>
    takenIn(dir).forEach((n) => names.add(n))
    const base = defaultRowName(c, fallback)
    let name = base
    if (c.pasted) for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base}-${n}`
    names.add(name.toLowerCase())
    return name
  })
}

const failure = (path: string, error: string) => ({ path, error })

/**
 * Runs a batch of file operations (imports, moves, deletes) with the game-asset sync held back, so a folder of hundreds of pictures syncs once at the end
 * instead of once per file (each sync starts a Node process).
 */
export async function withBulkImport<T>(rows: number, work: () => Promise<T>): Promise<T> {
  const api = window.electronAPI
  const bulk = rows > 1 && typeof api?.beginBulkImport === 'function' ? api : undefined
  await bulk?.beginBulkImport().catch(() => undefined)
  try {
    return await work()
  } finally {
    await bulk?.endBulkImport().catch(() => undefined)
  }
}

export function graphicImporter(data: DatabaseData): Importer {
  const { graphics, graphicFolders } = data.sprites
  const ids = graphics.map((g) => g.id)
  return {
    noun: 'picture',
    accepts: ['png', 'gif'],
    folders: [...new Set([...graphicFolders, ...ids.map(folderOfId).filter(Boolean)])].sort(),
    taken: (folder) => new Set(ids.filter((id) => folderOfId(id) === folder).map((id) => leafOfId(id).replace(/\.(png|gif)$/i, '').toLowerCase())),
    run: (rows, folder) =>
      withBulkImport(rows.length, async () => {
        const result: ImportResult = { imported: [], failed: [] }
        for (const row of rows) {
          const id = joinId(joinDirs(folder, row.dir), `${row.name}.${row.ext}`)
          const r = await data.sprites.importGraphic(row.path, id)
          if (r.ok) result.imported.push(id)
          else result.failed.push(failure(row.path, r.error))
        }
        return result
      }),
  }
}

export function tilesetImporter(data: DatabaseData): Importer {
  const { tilesets, tilesetFolders } = data
  return {
    noun: 'tileset',
    accepts: ['png'],
    folders: [...new Set(tilesetFolders)].sort(),
    // Maps find a tileset by its file name alone, so a name is taken whatever folder holds it.
    taken: () => new Set(tilesets.map((t) => t.fileName.replace(/\.png$/i, '').toLowerCase())),
    flat: true,
    run: (rows, folder) =>
      withBulkImport(rows.length, () =>
        data.tilesetOps.batch(async () => {
          const result: ImportResult = { imported: [], failed: [] }
          for (const row of rows) {
            const r = await data.tilesetOps.importTileset(row.path, row.name, joinDirs(folder, row.dir) || null, row.name)
            if (r.ok) result.imported.push(r.tileset.fileName)
            else result.failed.push(failure(row.path, r.error))
          }
          return result
        })
      ),
  }
}
