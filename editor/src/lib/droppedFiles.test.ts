import { describe, expect, it } from 'vitest'
import { clipboardHasFiles, pastedPngs, readDrop } from './droppedFiles'

const png = (name = 'image.png') => new File(['x'], name, { type: 'image/png' })
const clip = (files: File[], viaItems = false, types: string[] = ['Files']) =>
  ({
    types,
    files: viaItems ? [] : files,
    items: files.map((f) => ({ kind: 'file', getAsFile: () => f })),
  }) as unknown as DataTransfer

describe('pastedPngs', () => {
  it('returns the PNGs on the clipboard, from files or from items', async () => {
    const a = png('a.png')
    expect(await pastedPngs(clip([a]))).toEqual([a])
    expect(await pastedPngs(clip([a], true))).toEqual([a])
  })

  it('is empty for text, for nothing and for files that are not pictures', async () => {
    expect(await pastedPngs(null)).toEqual([])
    expect(await pastedPngs(clip([], false, ['text/plain']))).toEqual([])
    expect(await pastedPngs(clip([new File(['x'], 'notes.txt', { type: 'text/plain' })]))).toEqual([])
  })

  it('drops a picture it cannot turn into a PNG instead of failing the paste', async () => {
    // jsdom cannot decode images, so a JPEG cannot be converted here
    expect(await pastedPngs(clip([new File(['x'], 'photo.jpg', { type: 'image/jpeg' })]))).toEqual([])
  })
})

describe('clipboardHasFiles', () => {
  it('tells a file clipboard from a text one without reading it', () => {
    expect(clipboardHasFiles(clip([png()]))).toBe(true)
    expect(clipboardHasFiles(clip([], false, ['text/plain']))).toBe(false)
    expect(clipboardHasFiles(null)).toBe(false)
  })
})

describe('readDrop', () => {
  const file = (name: string) => new File(['x'], name, { type: 'image/png' })
  const fileEntry = (name: string) => ({ name, isFile: true, isDirectory: false, file: (ok: (f: File) => void) => ok(file(name)) })
  const dirEntry = (name: string, children: unknown[]) => ({
    name,
    isFile: false,
    isDirectory: true,
    // readEntries answers once with everything, then with nothing, as a real reader does
    createReader: () => {
      let done = false
      return { readEntries: (ok: (e: unknown[]) => void) => { const batch = done ? [] : children; done = true; ok(batch) } }
    },
  })
  const drop = (entries: unknown[], files: File[] = []) =>
    ({ files, items: entries.map((e) => ({ kind: 'file', webkitGetAsEntry: () => e })) }) as unknown as DataTransfer

  it('walks a dropped folder and keeps the structure, starting with the folder itself', async () => {
    const tree = dirEntry('Trees', [fileEntry('oak.png'), dirEntry('autumn', [fileEntry('maple.png'), dirEntry('dark', [fileEntry('elm.png')])]), fileEntry('.DS_Store')])
    const items = await readDrop(drop([tree]))
    expect(items.map((i) => [i.dir, i.file.name])).toEqual([['Trees/autumn/dark', 'elm.png'], ['Trees/autumn', 'maple.png'], ['Trees', 'oak.png']])
  })

  it('keeps plain files as they are, next to folders', async () => {
    const items = await readDrop(drop([fileEntry('a.png'), dirEntry('Rocks', [fileEntry('b.png')])]))
    expect(items.map((i) => [i.dir, i.file.name])).toEqual([['', 'a.png'], ['Rocks', 'b.png']])
  })

  it('falls back to the file list without folder support', async () => {
    const a = file('a.png')
    const noEntries = { files: [a], items: [{ kind: 'file' }] } as unknown as DataTransfer
    expect(await readDrop(noEntries)).toEqual([{ file: a, dir: '' }])
    expect(await readDrop(null)).toEqual([])
  })
})
