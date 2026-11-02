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
