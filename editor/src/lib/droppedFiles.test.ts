import { describe, expect, it } from 'vitest'
import { clipboardHasFiles, pastedPngs } from './droppedFiles'

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
