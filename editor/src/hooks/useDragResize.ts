import { useCallback } from 'react'

const HEADER_H = 40

export function useDragResize() {
  const makeDragHandle = useCallback(
    (setHeight: React.Dispatch<React.SetStateAction<number>>, isTopCollapsed: boolean, isBottomCollapsed: boolean) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (isTopCollapsed || isBottomCollapsed) return
        e.preventDefault()
        const startY = e.clientY
        // Capture the height of the section ABOVE the handle at drag start
        const handle = e.currentTarget as HTMLElement
        const prevSection = handle.previousElementSibling as HTMLElement | null
        const startH = prevSection ? prevSection.getBoundingClientRect().height : 0
        
        // Calculate the max allowed height so we don't push the bottom section off-screen
        const container = handle.parentElement as HTMLElement
        const lastSection = container.lastElementChild as HTMLElement | null
        const lastSectionH = lastSection ? lastSection.getBoundingClientRect().height : 0
        const maxDragDown = Math.max(0, lastSectionH - HEADER_H)
        const maxH = startH + maxDragDown

        const onMove = (ev: PointerEvent) => {
          const dy = ev.clientY - startY
          setHeight(Math.min(maxH, Math.max(HEADER_H + 20, startH + dy)))
        }
        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      },
    []
  )

  return { makeDragHandle }
}
