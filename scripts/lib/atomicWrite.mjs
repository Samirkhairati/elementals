// One way the repo scripts write a file: a temp file in the same directory, then a rename, so a reader never sees half
// a file and a failed write keeps the old content.

import fs from 'node:fs'
import path from 'node:path'

/** Writes `content` (a string, as UTF-8, or bytes) to `target` through a temp file in the same directory + rename. */
export function atomicWriteFile(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tmp, content, { flag: 'wx' })
    fs.renameSync(tmp, target)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
}
