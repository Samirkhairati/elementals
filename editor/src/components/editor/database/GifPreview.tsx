import { useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { GraphicInfo } from '../../../../../shared/engine/graphics'
import { EdButton, useAnimationClock } from '../ui/controls'

/** Index of the frame a GIF shows `tick` ms after it started, following the delays stored in the file (looping). */
export function gifFrameAt(delaysMs: readonly number[], tick: number): number {
  // browsers show delays under 20 ms as 100 ms; so does the game (see suggestedGifFps)
  const shown = delaysMs.map((d) => (d < 20 ? 100 : d))
  const total = shown.reduce((a, b) => a + b, 0)
  if (total <= 0) return 0
  let t = Math.max(0, tick) % total
  for (let i = 0; i < shown.length; i++) {
    if (t < shown[i]) return i
    t -= shown[i]
  }
  return 0
}

/** The GIF playing at its own speed, cut from the sheet of frames the library keeps (what the game will play). */
export function GifPreview({ graphic, url }: { graphic: GraphicInfo; url: string }) {
  const [playing, setPlaying] = useState(true)
  const tick = useAnimationClock(playing)
  const gif = graphic.gif
  if (!gif) return null
  const frame = gifFrameAt(gif.delaysMs, playing ? tick : 0)
  const columns = Math.max(1, Math.round(graphic.width / gif.frameWidth))
  const x = (frame % columns) * gif.frameWidth
  const y = Math.floor(frame / columns) * gif.frameHeight
  const zoom = Math.max(1, Math.min(4, Math.floor(160 / Math.max(gif.frameWidth, gif.frameHeight))))
  return (
    <div className="flex items-end gap-3" data-testid="gif-preview">
      <div className="ed-checker overflow-hidden rounded border border-border" style={{ width: gif.frameWidth * zoom, height: gif.frameHeight * zoom }}>
        <div aria-label={`GIF frame ${frame + 1} of ${gif.frames}`} data-frame={frame} style={{ width: gif.frameWidth, height: gif.frameHeight, transform: `scale(${zoom})`, transformOrigin: '0 0', backgroundImage: `url(${url})`, backgroundPosition: `-${x}px -${y}px`, imageRendering: 'pixelated' }} />
      </div>
      <EdButton size="sm" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause GIF' : 'Play GIF'}>{playing ? <Pause /> : <Play />}</EdButton>
    </div>
  )
}
