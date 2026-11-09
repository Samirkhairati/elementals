import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GifPreview, gifFrameAt } from './GifPreview'
import { GraphicThumb } from './browse'

const graphic = { id: 'a.gif', width: 48, height: 24, bytes: 1, mtimeMs: 0, gif: { frames: 3, frameWidth: 16, frameHeight: 24, delaysMs: [100, 200, 100] } }

describe('gifFrameAt', () => {
  it('follows the delays and loops', () => {
    expect(gifFrameAt([100, 200, 100], 0)).toBe(0)
    expect(gifFrameAt([100, 200, 100], 99)).toBe(0)
    expect(gifFrameAt([100, 200, 100], 100)).toBe(1)
    expect(gifFrameAt([100, 200, 100], 299)).toBe(1)
    expect(gifFrameAt([100, 200, 100], 300)).toBe(2)
    expect(gifFrameAt([100, 200, 100], 400)).toBe(0)
  })

  it('shows tiny delays as 100 ms, as browsers do, and copes with nothing', () => {
    expect(gifFrameAt([0, 0], 100)).toBe(1)
    expect(gifFrameAt([], 50)).toBe(0)
  })
})

describe('GIF in the library', () => {
  it('the preview cuts the frame out of the sheet the library keeps', () => {
    render(<GifPreview graphic={graphic} url="data:image/png;base64,AA" />)
    expect(screen.getByLabelText('GIF frame 1 of 3')).toHaveStyle({ width: '16px', height: '24px', backgroundPosition: '-0px -0px' })
    expect(screen.getByRole('button', { name: 'Pause GIF' })).toBeInTheDocument()
  })

  it('the thumbnail shows the first frame only', () => {
    render(<GraphicThumb graphic={graphic} url="data:image/png;base64,AA" size={56} />)
    const frame = screen.getByTestId('gif-thumb').firstElementChild as HTMLElement
    // the 52 px box fits the 24 px tall frame at 2x: a 16×24 frame draws 32×48, and the sheet 96×48
    expect([frame.style.width, frame.style.height, frame.style.backgroundSize, frame.style.backgroundPosition]).toEqual(['32px', '48px', '96px 48px', '0px 0px'])
  })
})
