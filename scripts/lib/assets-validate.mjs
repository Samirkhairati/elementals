// Validation + manifest building used by the asset sync.
// Characters are checked with the shared contract (shared/engine/characters.ts + graphics.ts), the same code
// the editor and the game use; the sync copies images by graphic id, so ids are validated strictly.

import { buildCharacterManifest, validateCharacterSet, isValidCharacterId, isValidGraphicId, characterGraphics } from '../../shared/engine/graphics.ts'
import { buildDatabaseManifest, validateDatabase as sharedValidateDatabase } from '../../shared/engine/database.ts'
import { buildCommonManifest, findCommonCycles } from '../../shared/engine/common.ts'

export { buildCommonManifest, findCommonCycles, buildDatabaseManifest, buildCharacterManifest, validateCharacterSet, isValidCharacterId, isValidGraphicId, characterGraphics }

const unique = (list) => [...new Set(list)]
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

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
