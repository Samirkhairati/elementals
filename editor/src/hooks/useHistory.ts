import { useState } from 'react'
import { Layer, MapData } from '@/types/editor'

interface UseHistoryReturn {
  history: { layers: Layer[] }[]
  historyIndex: number
  setHistory: React.Dispatch<React.SetStateAction<{ layers: Layer[] }[]>>
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>
  commitHistory: (stateToPush: Layer[]) => void
  handleCommit: () => void
  handleUndo: (
    layers: Layer[],
    setLayers: React.Dispatch<React.SetStateAction<Layer[]>>,
    activeMap: MapData | null,
    setActiveMap: (m: MapData) => void
  ) => void
  handleRedo: (
    layers: Layer[],
    setLayers: React.Dispatch<React.SetStateAction<Layer[]>>,
    activeMap: MapData | null,
    setActiveMap: (m: MapData) => void
  ) => void
}

export function useHistory(
  setLayers: React.Dispatch<React.SetStateAction<Layer[]>>
): UseHistoryReturn {
  const [history, setHistory] = useState<{ layers: Layer[] }[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const commitHistory = (stateToPush: Layer[]) => {
    setHistory(prev => {
      if (prev.length > 0 && JSON.stringify(prev[historyIndex]?.layers) === JSON.stringify(stateToPush)) return prev
      const newHist = prev.slice(0, historyIndex + 1)
      newHist.push({ layers: JSON.parse(JSON.stringify(stateToPush)) })
      if (newHist.length > 50) newHist.shift()
      setHistoryIndex(newHist.length - 1)
      return newHist
    })
  }

  const handleCommit = () => {
    setLayers(prev => {
      commitHistory(prev)
      return prev
    })
  }

  const handleUndo = (
    _layers: Layer[],
    setLayersLocal: React.Dispatch<React.SetStateAction<Layer[]>>,
    activeMap: MapData | null,
    setActiveMap: (m: MapData) => void
  ) => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1]
      const restoredLayers = JSON.parse(JSON.stringify(prev.layers))
      setLayersLocal(restoredLayers)
      setHistoryIndex(historyIndex - 1)
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: restoredLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
    }
  }

  const handleRedo = (
    _layers: Layer[],
    setLayersLocal: React.Dispatch<React.SetStateAction<Layer[]>>,
    activeMap: MapData | null,
    setActiveMap: (m: MapData) => void
  ) => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1]
      const restoredLayers = JSON.parse(JSON.stringify(next.layers))
      setLayersLocal(restoredLayers)
      setHistoryIndex(historyIndex + 1)
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: restoredLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
    }
  }

  return {
    history,
    historyIndex,
    setHistory,
    setHistoryIndex,
    commitHistory,
    handleCommit,
    handleUndo,
    handleRedo,
  }
}
