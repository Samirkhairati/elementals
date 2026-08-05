import { useState, useCallback } from 'react'

const HEADER_H = 40

export function useDragResize() {
  const [isDragging, setIsDragging] = useState(false)

  // Drag handle for section ABOVE the handle
  const makeDragTopHandle = useCallback(
    (setHeight: React.Dispatch<React.SetStateAction<number>>, isTopCollapsed: boolean, isBottomCollapsed: boolean) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (isTopCollapsed || isBottomCollapsed) return
        e.preventDefault()

        const target = e.currentTarget
        const pointerId = e.pointerId
        try {
          target.setPointerCapture(pointerId)
        } catch (_) {}

        const startY = e.clientY
        const prevSection = target.previousElementSibling as HTMLElement | null
        const startH = prevSection ? prevSection.getBoundingClientRect().height : 0
        const parent = target.parentElement as HTMLElement
        const parentH = parent.getBoundingClientRect().height
        const otherSections = Array.from(parent.children).filter(el => el !== prevSection && el.hasAttribute('data-panel-section')) as HTMLElement[]
        
        let minOtherH = 0
        otherSections.forEach(el => {
          const isCollapsed = el.style.flex === 'none' && el.style.height === '40px'
          minOtherH += isCollapsed ? 40 : 60
        })
        const maxH = parentH - minOtherH - 10

        setIsDragging(true)
        let styleEl = document.getElementById('drag-cursor-style')
        if (!styleEl) {
          styleEl = document.createElement('style')
          styleEl.id = 'drag-cursor-style'
          document.head.appendChild(styleEl)
        }
        styleEl.innerHTML = '* { cursor: ns-resize !important; user-select: none !important; }'

        const onPointerMove = (ev: PointerEvent) => {
          const dy = ev.clientY - startY
          setHeight(Math.max(HEADER_H + 20, Math.min(maxH, startH + dy)))
        }

        const onPointerUp = () => {
          try {
            target.releasePointerCapture(pointerId)
          } catch (_) {}
          setIsDragging(false)
          const styleEl = document.getElementById('drag-cursor-style')
          if (styleEl) styleEl.innerHTML = ''
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerup', onPointerUp)
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
      },
    []
  )

  // Drag handle for section BELOW the handle
  const makeDragBottomHandle = useCallback(
    (setHeight: React.Dispatch<React.SetStateAction<number>>, isTopCollapsed: boolean, isBottomCollapsed: boolean) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (isTopCollapsed || isBottomCollapsed) return
        e.preventDefault()

        const target = e.currentTarget
        const pointerId = e.pointerId
        try {
          target.setPointerCapture(pointerId)
        } catch (_) {}

        const startY = e.clientY
        const nextSection = target.nextElementSibling as HTMLElement | null
        const startH = nextSection ? nextSection.getBoundingClientRect().height : 0
        const parent = target.parentElement as HTMLElement
        const parentH = parent.getBoundingClientRect().height
        const otherSections = Array.from(parent.children).filter(el => el !== nextSection && el.hasAttribute('data-panel-section')) as HTMLElement[]
        
        let minOtherH = 0
        otherSections.forEach(el => {
          const isCollapsed = el.style.flex === 'none' && el.style.height === '40px'
          minOtherH += isCollapsed ? 40 : 60
        })
        const maxH = parentH - minOtherH - 10

        setIsDragging(true)
        let styleEl = document.getElementById('drag-cursor-style')
        if (!styleEl) {
          styleEl = document.createElement('style')
          styleEl.id = 'drag-cursor-style'
          document.head.appendChild(styleEl)
        }
        styleEl.innerHTML = '* { cursor: ns-resize !important; user-select: none !important; }'

        const onPointerMove = (ev: PointerEvent) => {
          const dy = ev.clientY - startY
          setHeight(Math.max(HEADER_H + 20, Math.min(maxH, startH - dy)))
        }

        const onPointerUp = () => {
          try {
            target.releasePointerCapture(pointerId)
          } catch (_) {}
          setIsDragging(false)
          const styleEl = document.getElementById('drag-cursor-style')
          if (styleEl) styleEl.innerHTML = ''
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerup', onPointerUp)
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
      },
    []
  )

  return {
    isDragging,
    makeDragHandle: makeDragTopHandle,
    makeDragTopHandle,
    makeDragBottomHandle
  }
}
