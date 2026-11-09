import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The main process runs as plain ESM from dist-electron: a relative import without ".js" typechecks but fails at
// start-up ("Cannot find module …/imageFolder"). This pins every shipped source to the extension.
const here = import.meta.dirname

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__testutils__' ? [] : sources(p)
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts') ? [p] : []
  })
}

describe('electron relative imports', () => {
  it('all end in .js', () => {
    const bad: string[] = []
    for (const file of sources(here)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']*)'/g)) {
        if (!m[1].endsWith('.js')) bad.push(`${file.slice(here.length + 1)}: ${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })
})
