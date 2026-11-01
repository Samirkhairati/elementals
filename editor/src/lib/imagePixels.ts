import type { PixelData } from './sheetDetect'

/** Decodes an image URL (data: or http) into RGBA pixels with a canvas. Rejects when the image cannot be read. */
export function readImagePixels(url: string): Promise<PixelData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return reject(new Error('This browser cannot read image pixels'))
      ctx.drawImage(img, 0, 0)
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve({ data, width, height })
    }
    img.onerror = () => reject(new Error('The image could not be loaded'))
    img.src = url
  })
}
