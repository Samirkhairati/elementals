import { useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { clipFrameAt, clipFrames, effectiveFps, sheetFrameRect, type CharacterDef } from '../../../../../../shared/engine/characters'
import type { Facing } from '../../../../../../shared/engine/types'
import { EdButton, FieldRow, InfoTip, NumberField, SliderNumber, useAnimationClock } from '../../ui/controls'

interface Props {
  def: CharacterDef
  clipName: string
  facing: Facing
  url: string
  size: { width: number; height: number }
}

/**
 * What the game will show: the same `clipFrameAt` / `effectiveFps` the runtime uses, with a Speed slider (animSpeed) and an
 * Entity speed field so follow-speed can be tried without leaving the editor.
 */
export function AnimationPreview({ def, clipName, facing, url, size }: Props) {
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [entitySpeed, setEntitySpeed] = useState(100)
  const tick = useAnimationClock(playing)
  const clip = def.clips[clipName]
  const sheet = clip ? def.sheets[clip.sheet] : undefined
  const shown = clip ? clipFrames(clip, facing) : null
  if (!clip || !sheet || !shown) return <p className="ed-hint">Nothing to show: this animation has no frames for “{facing}”.</p>
  const fps = effectiveFps(clip, entitySpeed, speed)
  const frame = clipFrameAt(clip, shown.frames, playing ? tick : 0, fps)
  const r = sheetFrameRect(sheet, frame, size.width)
  const zoom = 3
  return (
    <div className="flex flex-col gap-2" data-testid="animation-preview">
      <div className="flex items-end gap-3">
        <div className="overflow-hidden rounded border border-border" style={{ width: r.w * zoom, height: r.h * zoom, background: 'repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 0 0 / 12px 12px' }}>
          <div
            aria-label={`Preview frame ${frame}`}
            data-frame={frame}
            style={{ width: r.w, height: r.h, transform: `scale(${shown.flipX ? -zoom : zoom}, ${zoom})`, transformOrigin: '0 0', marginLeft: shown.flipX ? r.w * zoom : 0, backgroundImage: `url(${url})`, backgroundPosition: `-${r.x}px -${r.y}px`, imageRendering: 'pixelated' }}
          />
        </div>
        <EdButton size="sm" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause preview' : 'Play preview'}>{playing ? <Pause /> : <Play />}</EdButton>
      </div>
      <FieldRow>
        <span className="text-ed-label">Speed</span>
        <div className="w-40"><SliderNumber label="Preview speed" value={speed} min={0} max={4} step={0.25} unit="×" onCommit={setSpeed} /></div>
        <InfoTip>Only changes this preview, not the saved animation.</InfoTip>
      </FieldRow>
      <FieldRow>
        <span className="text-ed-label">Entity speed</span>
        <NumberField aria-label="Entity speed" size="sm" value={entitySpeed} min={0} step={10} unit="px/s" onCommit={setEntitySpeed} />
        <InfoTip>Pretend the character moves at this speed to see how “Follow movement speed” behaves.</InfoTip>
        <span className="ed-hint" data-testid="effective-fps">{Math.round(fps * 100) / 100} fps</span>
      </FieldRow>
    </div>
  )
}
