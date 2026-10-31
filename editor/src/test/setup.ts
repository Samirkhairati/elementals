import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Globals are not enabled, so RTL cannot auto-register cleanup.
afterEach(() => {
  cleanup()
})

// React Flow (the event graph canvas) measures nodes with ResizeObserver and reads the viewport transform
// through DOMMatrixReadOnly; jsdom has neither.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  globalThis.DOMMatrixReadOnly = class {
    m22 = 1
    constructor(transform?: string) {
      const scale = /scale\(([\d.]+)\)/.exec(transform ?? '')
      if (scale) this.m22 = Number(scale[1])
    }
  } as unknown as typeof DOMMatrixReadOnly
}
if (typeof HTMLElement !== 'undefined' && !(HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {}
}

// jsdom has no canvas: make getContext quietly return null instead of logging "not implemented" for every sprite preview.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
}
