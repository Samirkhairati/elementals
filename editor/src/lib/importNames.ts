// Names for a batch of images being imported: the file name is the default, the author can edit it, and every
// name has to be usable and free (inside the batch and in the library).

/** A file name the library accepts: letters, digits, "_" and "-", not starting with a separator. */
export const IMPORT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

/** `Hero Walk (2).png` -> `Hero-Walk-2`: the file name without its extension, runs of other characters turned into "-". */
export function sanitizeStem(fileName: string, fallback = 'image'): string {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^[-_]+|-+$/g, '')
  return stem || fallback
}

/**
 * One message per name ('' = fine). `taken` holds names that already exist, lower-cased; two rows of the batch with the
 * same name (ignoring case, as file systems do) are both reported.
 */
export function checkNames(names: readonly string[], taken: ReadonlySet<string>): string[] {
  const counts = new Map<string, number>()
  for (const n of names) counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) ?? 0) + 1)
  return names.map((name) => {
    if (name.trim() === '') return 'Give it a name.'
    if (!IMPORT_NAME.test(name)) return 'Use letters, digits, “-” and “_”.'
    if (taken.has(name.toLowerCase())) return 'Already exists here.'
    if ((counts.get(name.toLowerCase()) ?? 0) > 1) return 'Used twice in this import.'
    return ''
  })
}

/** One folder name of an imported folder made usable: `My Trees (old)` -> `My-Trees-old`; '' when nothing is left. */
export const sanitizeSegment = (name: string): string => name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^[-_]+|-+$/g, '')

/** The folder path of a file inside an imported folder (`Trees/old oak`) as a library path (`Trees/old-oak`); unusable parts are dropped. */
export const sanitizeDir = (dir: string): string => dir.split('/').map(sanitizeSegment).filter(Boolean).join('/')

export interface NamedRow {
  /** Folder below the import destination ('' = the destination itself). */
  dir: string
  name: string
}

/**
 * `checkNames` for a batch that spans folders: a name only clashes with the same name in the same folder
 * (`takenIn(dir)` is what already exists there). `flat` libraries (tilesets: maps find a tileset by file name alone)
 * need a name to be free everywhere, so rows are compared across folders.
 */
export function checkRowNames(rows: readonly NamedRow[], takenIn: (dir: string) => ReadonlySet<string>, flat = false): string[] {
  const scope = (r: NamedRow) => (flat ? '' : r.dir)
  const groups = new Map<string, number[]>()
  rows.forEach((r, i) => groups.set(scope(r), [...(groups.get(scope(r)) ?? []), i]))
  const out: string[] = new Array(rows.length).fill('')
  for (const indexes of groups.values()) {
    const taken = new Set<string>()
    for (const i of indexes) takenIn(rows[i].dir).forEach((n) => taken.add(n))
    const messages = checkNames(indexes.map((i) => rows[i].name), taken)
    indexes.forEach((i, k) => { out[i] = messages[k] })
  }
  return out
}
