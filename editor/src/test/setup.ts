import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Globals are not enabled, so RTL cannot auto-register cleanup.
afterEach(() => {
  cleanup()
})

// jsdom has no canvas: make getContext quietly return null instead of logging "not implemented" for every sprite preview.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
}
