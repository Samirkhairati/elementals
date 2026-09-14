import { useState, useEffect, useRef } from 'react'
import { TilesetData } from '@/types/editor'

export function useTilesetImages(tilesets: TilesetData[]): Record<string, HTMLImageElement> {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})
  const cacheRef = useRef<Map<string, { url: string; img: HTMLImageElement }>>(new Map())

  useEffect(() => {
    let isMounted = true
    const newImages: Record<string, HTMLImageElement> = {}
    let pendingLoads = 0

    tilesets.forEach(tileset => {
      const cached = cacheRef.current.get(tileset.fileName)
      if (cached && cached.url === tileset.dataUrl && cached.img.complete && cached.img.naturalWidth > 0) {
        newImages[tileset.fileName] = cached.img
      } else {
        pendingLoads++
        const img = new Image()
        img.src = tileset.dataUrl
        img.onload = () => {
          cacheRef.current.set(tileset.fileName, { url: tileset.dataUrl, img })
          if (isMounted) {
            setImages(prev => ({ ...prev, [tileset.fileName]: img }))
          }
        }
        img.onerror = () => {
          console.error(`Failed to load tileset image: ${tileset.fileName}`)
        }
        newImages[tileset.fileName] = img
      }
    })

    if (pendingLoads === 0) {
      setImages(newImages)
    }

    return () => {
      isMounted = false
    }
  }, [tilesets])

  return images
}
