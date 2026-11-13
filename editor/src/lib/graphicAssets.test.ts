import { describe, expect, it } from 'vitest'
import { graphicAsset } from './graphicAssets'
import { itemBounds } from './imageItems'
import type { GraphicInfo } from '../../../shared/engine/graphics'

const sheet = (extra: Partial<GraphicInfo> = {}): GraphicInfo => ({ id: 'images/x.png', width: 128, height: 64, ...extra }) as GraphicInfo

describe('graphicAsset', () => {
  it('a still picture is one frame of the whole image', () => {
    const asset = graphicAsset(sheet(), 'u.png')
    expect(itemBounds({ graphicId: 'images/x.png' }, { 'graphic:images/x.png': asset })).toMatchObject({ w: 128, h: 64 })
  })

  it('a GIF picture is one frame of its sheet, so its bounds (and snapping) use the frame size', () => {
    const gif = sheet({ id: 'images/x.gif', gif: { frames: 4, frameWidth: 32, frameHeight: 64, delaysMs: [100, 100, 100, 100] } as GraphicInfo['gif'] })
    const asset = graphicAsset(gif, 'u.png')
    const b = itemBounds({ graphicId: 'images/x.gif' }, { 'graphic:images/x.gif': asset })
    expect(b).toMatchObject({ w: 32, h: 64, x: -16, y: -64 })
  })
})
