import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { parseShader } from '../../../../../shared/look/userShaders'
import { resetLookLibrary } from '@/lib/look/lookLibrary'

const store = vi.hoisted(() => ({ saveShader: vi.fn(), deleteShader: vi.fn(), renameShader: vi.fn() }))
vi.mock('@/lib/look/lookLibrary', async (orig) => ({ ...(await orig<typeof import('@/lib/look/lookLibrary')>()), ...store }))

import { ShadersPage } from './ShadersPage'

const SRC = '// @name Water\nuniform float amount; // @param 0 1 0.5 Amount\nvoid main() { gl_FragColor = texture2D(uMainSampler, outTexCoord); }\n'

beforeEach(() => {
  store.saveShader.mockResolvedValue(null)
  store.deleteShader.mockResolvedValue(null)
  store.renameShader.mockResolvedValue(null)
  resetLookLibrary({ loaded: true, shaders: [parseShader('fx/water', SRC), parseShader('plain', '// @name Plain one\nvoid main() {}')] })
})
afterEach(() => {
  vi.clearAllMocks()
  resetLookLibrary()
})

describe('ShadersPage', () => {
  it('lists the library shaders by name and id', () => {
    render(<ShadersPage />)
    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText('fx/water')).toBeInTheDocument()
    expect(screen.getByText('Plain one')).toBeInTheDocument()
  })

  it('New writes a template under a free id', async () => {
    render(<ShadersPage />)
    fireEvent.click(screen.getByRole('button', { name: /New shader/ }))
    await waitFor(() => expect(store.saveShader).toHaveBeenCalledTimes(1))
    expect(store.saveShader.mock.calls[0][0]).toBe('new-shader')
    expect(store.saveShader.mock.calls[0][1]).toContain('@param')
  })

  it('opens a shader, warns that the preview needs WebGL, and saves edits', async () => {
    render(<ShadersPage />)
    fireEvent.click(screen.getByText('Water'))
    expect(screen.getByText('Preview needs WebGL.')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: /Save/ })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Shader source'), { target: { value: `${SRC}// x` } })
    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument()
    fireEvent.click(save)
    await waitFor(() => expect(store.saveShader).toHaveBeenCalledWith('fx/water', `${SRC}// x`))
  })

  it('Delete asks first, then deletes', async () => {
    render(<ShadersPage />)
    fireEvent.click(screen.getByText('Plain one'))
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }))
    expect(store.deleteShader).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(store.deleteShader).toHaveBeenCalledWith('plain'))
  })
})
