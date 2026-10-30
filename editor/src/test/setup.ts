import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Globals are not enabled, so RTL cannot auto-register cleanup.
afterEach(() => {
  cleanup()
})
