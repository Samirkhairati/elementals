import { useState } from 'react'
import { Plus, Trash2, Wand2 } from 'lucide-react'
import { FACINGS } from '../../../../../../shared/engine/constants'
import type { Facing } from '../../../../../../shared/engine/types'
import type { CharacterDef, PlaybackMode } from '../../../../../../shared/engine/characters'
import { addClip, autoAssignRows, deleteClip, framesFor, renameClip, setDirectional, setFrames, setMirror, updateClip } from '@/lib/characterEdit'
import { sheetGrid } from '../../../../../../shared/engine/sprites'
import { EdButton, Field, FieldRow, IconButton, InfoTip, NumberField, Section, Segmented, SliderNumber, TextField, Toggle } from '../../ui/controls'
import { AnimationPreview } from './AnimationPreview'
import { FramePicker } from './FramePicker'

const FACING_LABEL: Record<Facing, string> = { down: '↓ Down', left: '← Left', right: '→ Right', up: '↑ Up' }

interface Props {
  def: CharacterDef
  onChange: (def: CharacterDef) => void
  images: Record<string, string>
  sizes: Record<string, { width: number; height: number }>
}

export function AnimationsTab({ def, onChange, images, sizes }: Props) {
  const names = Object.keys(def.clips)
  const [selected, setSelected] = useState(names[0] ?? '')
  const [facing, setFacing] = useState<Facing>('down')
  const [error, setError] = useState('')
  const current = names.includes(selected) ? selected : names[0] ?? ''
  const clip = def.clips[current]
  const sheetKeys = Object.keys(def.sheets)
  const sheet = clip ? def.sheets[clip.sheet] : undefined
  const url = sheet ? images[sheet.image] : undefined
  const size = sheet ? sizes[sheet.image] : undefined
  const mirrored = clip?.directional ? clip.mirror?.[facing] : undefined

  const run = (fn: () => CharacterDef) => {
    try {
      onChange(fn())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const editFrames = (frames: number[]) => run(() => setFrames(def, current, clip.directional ? facing : null, frames))

  return (
    <div className="flex min-h-0 gap-3" data-testid="animations-tab">
      <div className="flex w-44 shrink-0 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-ed-label font-medium">Animations ({names.length})</span>
          <IconButton title="Add an animation" aria-label="Add animation" disabled={sheetKeys.length === 0} onClick={() => run(() => { const r = addClip(def, 'animation', sheetKeys[0]); setSelected(r.name); return r.def })}><Plus className="h-3.5 w-3.5" /></IconButton>
        </div>
        {names.length === 0 && <p className="ed-hint">No animations yet. Add one to choose its frames.</p>}
        <ul>
          {names.map((n) => (
            <li key={n}>
              <button type="button" data-selected={n === current ? 'true' : undefined} className="ed-row flex w-full items-center gap-1 py-0.5 text-left text-ed-label" onClick={() => setSelected(n)}>
                <span className="truncate">{n}</span>
                {Object.entries(def.bindings).filter(([, c]) => c === n).map(([b]) => <span key={b} className="ed-badge">{b}</span>)}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {!clip || !sheet ? <p className="ed-hint">Pick or add an animation.</p> : (
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <Field label="Name" info="Used by events to play this animation (Play Animation) and in animation bindings. Letters, digits, dashes and underscores.">
            <FieldRow>
              <TextField aria-label="Animation name" className="w-40" value={current} onCommit={(v) => run(() => { const next = renameClip(def, current, v.trim()); setSelected(v.trim()); return next })} />
              <IconButton tone="danger" title="Delete this animation" aria-label="Delete animation" onClick={() => run(() => { const r = deleteClip(def, current); return r.def })}><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </FieldRow>
          </Field>
          <Field label="Sheet" info="The picture this animation takes its frames from.">
            <select aria-label="Sheet" className="ed-input w-auto min-w-[120px]" value={clip.sheet} onChange={(e) => run(() => updateClip(def, current, { sheet: e.target.value }))}>
              {sheetKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <FieldRow>
            <span className="text-ed-label">Directional</span>
            <Toggle aria-label="Directional" checked={clip.directional} disabled={def.facing === 'none'} onChange={(v) => run(() => setDirectional(def, current, v))} />
            <InfoTip>Turn on if this animation looks different when the character faces up, down, left or right. Leave off for things that look the same from every side, like a flower.</InfoTip>
            <span className="ml-3 text-ed-label">Loop</span>
            <Toggle aria-label="Loop" checked={clip.loop} onChange={(v) => run(() => updateClip(def, current, { loop: v }))} />
            <InfoTip>On: the animation repeats forever. Off: it plays once and stops on its last frame.</InfoTip>
          </FieldRow>
          <Field label="FPS" info="Frames per second at normal speed. Higher is faster. Events and movement speed can speed it up or slow it down while the game runs.">
            <SliderNumber label="FPS" value={clip.fps} min={1} max={60} step={1} onCommit={(v) => run(() => updateClip(def, current, { fps: Math.max(1, v) }))} />
          </Field>
          <FieldRow>
            <span className="text-ed-label">Follow movement speed</span>
            <Toggle aria-label="Follow movement speed" checked={!!clip.followSpeed} onChange={(v) => run(() => updateClip(def, current, { followSpeed: v ? { reference: 100 } : undefined }))} />
            <InfoTip>Makes the animation play faster when the character moves faster, so feet don’t slide. “Reference speed” is the movement speed (px/s) at which this FPS looks right.</InfoTip>
            {clip.followSpeed && <>
              <NumberField aria-label="Reference speed" size="sm" value={clip.followSpeed.reference} min={1} step={10} unit="px/s" onCommit={(v) => run(() => updateClip(def, current, { followSpeed: { reference: Math.max(1, v) } }))} />
              <InfoTip>The movement speed in pixels per second at which this animation’s FPS looks right. A character moving twice as fast plays it twice as fast.</InfoTip>
            </>}
          </FieldRow>
          <Section title="Advanced" summary={`playback ${clip.mode ?? 'forward'}`} defaultOpen={false}>
            <Field label="Playback" info="Forward plays frames in order. Reverse plays them backwards. Ping-pong goes forward, then back, which is handy for swaying.">
              <Segmented<PlaybackMode> aria-label="Playback" value={clip.mode ?? 'forward'} options={[{ value: 'forward', label: 'Forward' }, { value: 'reverse', label: 'Reverse' }, { value: 'pingpong', label: 'Ping-pong' }]} onChange={(v) => run(() => updateClip(def, current, { mode: v === 'forward' ? undefined : v }))} />
            </Field>
          </Section>

          {clip.directional && (
            <FieldRow>
              <Segmented<Facing> aria-label="Direction" value={facing} options={FACINGS.map((f) => ({ value: f, label: FACING_LABEL[f] }))} onChange={setFacing} />
              <span className="text-ed-label">Use</span>
              <select aria-label="Use frames of" className="ed-input w-auto min-w-[120px]" value={mirrored ?? ''} onChange={(e) => run(() => setMirror(def, current, facing, (e.target.value || null) as Facing | null))}>
                <option value="">own frames</option>
                {FACINGS.filter((f) => f !== facing).map((f) => <option key={f} value={f}>mirror of {FACING_LABEL[f]}</option>)}
              </select>
              <InfoTip>Re-use another direction’s frames flipped sideways, e.g. left = right flipped. Saves drawing both.</InfoTip>
              <EdButton size="sm" title="Gives the first four rows to down, left, right and up in that order. You can change any row afterwards." onClick={() => size && run(() => autoAssignRows(def, current, sheetGrid(sheet, size.width, size.height).columns))}><Wand2 /> Auto-assign rows</EdButton>
            </FieldRow>
          )}

          {mirrored ? <p className="ed-hint">{FACING_LABEL[facing]} shows the frames of {FACING_LABEL[mirrored]}, flipped.</p> : (
            <>
              <div className="flex flex-wrap items-center gap-1" aria-label="Chosen frames">
                {framesFor(clip, clip.directional ? facing : null).map((f, i) => (
                  <button key={i} type="button" className="ed-badge" title="Remove this frame" aria-label={`Remove frame ${f}`} onClick={() => editFrames(framesFor(clip, clip.directional ? facing : null).filter((_, n) => n !== i))}>{f}</button>
                ))}
                {framesFor(clip, clip.directional ? facing : null).length === 0 && <span className="ed-hint">No frames chosen. Click frames on the sheet below.</span>}
                <EdButton size="sm" onClick={() => editFrames([])}>Clear</EdButton>
              </div>
              {url && size ? <FramePicker url={url} sheet={sheet} size={size} frames={framesFor(clip, clip.directional ? facing : null)} onChange={editFrames} /> : <p className="ed-hint">The sheet’s image is missing.</p>}
              <p className="ed-hint">Click adds a frame · ctrl/cmd-click removes the last one · shift-click adds a range · drag draws a box · a row number adds the whole row.</p>
            </>
          )}
          {url && size && <AnimationPreview def={def} clipName={current} facing={facing} url={url} size={size} />}
        </div>
      )}
    </div>
  )
}
