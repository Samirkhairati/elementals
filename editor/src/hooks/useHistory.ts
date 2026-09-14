import { useState, useRef, useEffect, useCallback } from 'react'
import { Layer, MapData } from '@/types/editor'

export interface UseHistoryReturn {
  history: { layers: Layer[] }[]
  historyIndex: number
  setHistory: React.Dispatch<React.SetStateAction<{ layers: Layer[] }[]>>
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>
  commitHistory: (stateToPush: Layer[]) => void
  handleUndo: (
    setLayersLocal: React.Dispatch<React.SetStateAction<Layer[]>>,
    activeMap: MapData | null,
    setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
  ) => void
  handleRedo: (
    setLayersLocal: React.Dispatch<React.SetStateAction<Layer[]>>,
    activeMap: MapData | null,
    setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
  ) => void
}

export function useHistory(): UseHistoryReturn {
  const [history, setHistory] = useState<{ layers: Layer[] }[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const historyIndexRef = useRef(historyIndex)
  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])

  const historyRef = useRef(history)
  useEffect(() => {
    historyRef.current = history
  }, [history])

  const commitHistory = useCallback((stateToPush: Layer[]) => {
    if (!stateToPush || stateToPush.length === 0) return

    const currentIndex = historyIndexRef.current
    const currentHist = historyRef.current

    // Don't push duplicate state
    if (
      currentIndex >= 0 &&
      currentIndex < currentHist.length &&
      JSON.stringify(currentHist[currentIndex]?.layers) === JSON.stringify(stateToPush)
    ) {
      return
    }

    const cloned = JSON.parse(JSON.stringify(stateToPush))
    const newHist = currentHist.slice(0, currentIndex + 1)
    newHist.push({ layers: cloned })
    if (newHist.length > 50) newHist.shift()

    const newIndex = newHist.length - 1
    historyRef.current = newHist
    historyIndexRef.current = newIndex

    setHistory(newHist)
    setHistoryIndex(newIndex)
  }, [])

  const handleUndo = useCallback(
    (
      setLayersLocal: React.Dispatch<React.SetStateAction<Layer[]>>,
      activeMap: MapData | null,
      setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
    ) => {
      const currentIndex = historyIndexRef.current
      const currentHist = historyRef.current

      if (currentIndex > 0) {
        const targetIndex = currentIndex - 1
        const restoredLayers = JSON.parse(JSON.stringify(currentHist[targetIndex].layers))

        historyIndexRef.current = targetIndex
        setHistoryIndex(targetIndex)
        setLayersLocal(restoredLayers)

        if (activeMap) {
          const updatedMap = { ...activeMap, layers: restoredLayers }
          setActiveMap(updatedMap)
          window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
        }
      }
    },
    []
  )

  const handleRedo = useCallback(
    (
      setLayersLocal: React.Dispatch<React.SetStateAction<Layer[]>>,
      activeMap: MapData | null,
      setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
    ) => {
      const currentIndex = historyIndexRef.current
      const currentHist = historyRef.current

      if (currentIndex < currentHist.length - 1) {
        const targetIndex = currentIndex + 1
        const restoredLayers = JSON.parse(JSON.stringify(currentHist[targetIndex].layers))

        historyIndexRef.current = targetIndex
        setHistoryIndex(targetIndex)
        setLayersLocal(restoredLayers)

        if (activeMap) {
          const updatedMap = { ...activeMap, layers: restoredLayers }
          setActiveMap(updatedMap)
          window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
        }
      }
    },
    []
  )

  return {
    history,
    historyIndex,
    setHistory,
    setHistoryIndex,
    commitHistory,
    handleUndo,
    handleRedo,
  }
}
