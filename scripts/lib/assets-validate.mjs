// Validation + manifest building used by the asset sync.
//
// Two validators run side by side and their findings are merged:
//  - shared/engine (the contract the editor and the game use): structure, plus sheet-size warnings;
//  - editor/electron/ipc/spriteMeta.ts (the strict gate that also guards the editor's IPC; it has no
//    imports so Node can load it directly): safe sheet file names, sheets exist, frames tile the sheet
//    exactly, animation frames in range. The sync copies files by name, so that strictness matters.
// editor/engine-parity.test.ts keeps the two in step.

import {
  checkSheetDimensions,
  buildSpriteManifest,
  validateSpriteMeta as sharedValidateSpriteMeta,
} from '../../shared/engine/sprites.ts'
import { buildDatabaseManifest, validateDatabase as sharedValidateDatabase } from '../../shared/engine/database.ts'
import {
  isValidSpriteId,
  normalizeSpriteMeta,
  sheetNamesOf,
  validateSpriteMeta as strictValidateSpriteMeta,
} from '../../editor/electron/ipc/spriteMeta.ts'

import { buildCommonManifest, findCommonCycles } from '../../shared/engine/common.ts'

export { buildCommonManifest, findCommonCycles, buildDatabaseManifest, buildSpriteManifest, isValidSpriteId, normalizeSpriteMeta, sheetNamesOf }

const unique = (list) => [...new Set(list)]
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Structure of a parsed sprite.json (no files needed). Returns { errors, warnings }. */
export function checkSpriteStructure(raw) {
  const strict = strictValidateSpriteMeta(raw)
  const shared = sharedValidateSpriteMeta(raw)
  return { errors: unique([...strict.errors, ...shared.errors]), warnings: shared.warnings }
}

/** Checks that need the sheet images: `sizes` is { fileName: { width, height } } of the sheets that exist. */
export function checkSpriteSheets(raw, sizes) {
  const strict = strictValidateSpriteMeta(raw, sizes)
  return { errors: strict.errors, warnings: checkSheetDimensions(raw, sizes) }
}

/** Problems with a GameDatabase value (empty array = valid). Stricter than the shared validator (it only warns on names). */
export function validateDatabaseStrict(db) {
  if (!isObject(db)) return ['database must be a JSON object']
  const errors = [...sharedValidateDatabase(db).errors]
  for (const what of ['switches', 'variables']) {
    if (!Array.isArray(db[what])) continue
    db[what].forEach((entry, i) => {
      if (!isObject(entry)) return
      const label = `${what}[${i}]`
      if (typeof entry.id === 'string' && entry.id !== entry.id.trim()) errors.push(`${label}.id must not have surrounding whitespace`)
      if (typeof entry.name !== 'string' || entry.name.trim() === '') errors.push(`${label}.name must be a non-empty string`)
    })
  }
  return unique(errors)
}
