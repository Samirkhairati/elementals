import React, { useState } from 'react'
import { Plus, Trash2, Wand2 } from 'lucide-react'
import { FACINGS } from '../../../../../../shared/engine/constants'
import type { Facing } from '../../../../../../shared/engine/types'
import type { CharacterDef, PlaybackMode } from '../../../../../../shared/engine/characters'
import { addClip, autoAssignRows, deleteClip, framesFor, renameClip, setDirectional, setFrames, setMirror, updateClip } from '@/lib/characterEdit'
import { sheetGrid } from '../../../../../../shared/engine/sprites'
import { Select } from '../../ui/fields'
import { EdButton, Field, FieldRow, IconButton, InfoTip, NumberField, Section, Segmented, SliderNumber, TextField, Toggle } from '../../ui/controls'
import { AnimationPreview } from './AnimationPreview'
import { FramePicker } from './FramePicker'
import { fitZoom } from './SheetGridPreview'

const FACING_LABEL: Record<Facing, string> = { down: '↓ Down', left: '← Left', right: '→ Right', up: '↑ Up' }

interface Props {
  def: CharacterDef
  onChange: (def: CharacterDef) => void
  images: Record<string, string>
  sizes: Record<string, { width: number; height: number }>
  /** Places that use each animation (map sprites, events, bindings). */
  clipCounts?: Record<string, number>
  onRenameClip?: (from: string, to: string) => void
  /** Jumps to the Sheets tab, where the cut of the sheet is edited. */
  onOpenSheets?: () => void
}

export function AnimationsTab({ def, onChange, images, sizes, clipCounts = {}, onRenameClip, onOpenSheets }: Props) {
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
  const shownFrames = clip ? framesFor(clip, clip.directional ? facing : null) : []
  const grid = sheet && size ? sheetGrid(sheet, size.width, size.height) : null

  return (
    <div className="flex min-h-0 gap-4" data-testid="animations-tab">
      <aside className="flex w-48 shrink-0 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="ed-section-title">Animations ({names.length})</span>
          <IconButton title="Add an animation" aria-label="Add animation" disabled={sheetKeys.length === 0} onClick={() => run(() => { const r = addClip(def, 'animation', sheetKeys[0]); setSelected(r.name); return r.def })}><Plus className="h-3.5 w-3.5" /></IconButton>
        </div>
        {names.length === 0 && <p className="ed-hint">No animations yet. Add one to choose its frames.</p>}
        <ul className="flex flex-col gap-0.5">
          {names.map((n) => (
            <li key={n}>
              <button type="button" data-selected={n === current ? 'true' : undefined} className="ed-row flex w-full items-center gap-1.5 py-1 text-left text-ed-label" onClick={() => setSelected(n)}>
                <span className="truncate font-medium">{n}</span>
                {(clipCounts[n] ?? 0) > 0 && <span className="ed-hint" title="Places that use this animation">· {clipCounts[n]}</span>}
                <span className="ml-auto flex gap-1">
                  {Object.entries(def.bindings).filter(([, c]) => c === n).map(([b]) => <span key={b} className="ed-badge">{b}</span>)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {!clip || !sheet ? <p className="ed-hint">Pick or add an animation.</p> : (
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <label className="ed-label" htmlFor="animation-name">Name</label>
              <InfoTip>Used by events to play this animation (Play Animation) and in animation bindings. Letters, digits, dashes and underscores.</InfoTip>
              <TextField id="animation-name" aria-label="Animation name" className="w-40" value={current} onCommit={(v) => run(() => { const next = renameClip(def, current, v.trim()); setSelected(v.trim()); if (v.trim() !== current) onRenameClip?.(current, v.trim()); return next })} />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="ed-label" htmlFor="animation-sheet">Sheet</label>
              <InfoTip>The picture this animation takes its frames from.</InfoTip>
              <Select id="animation-sheet" aria-label="Sheet" className="w-auto min-w-[110px]" value={clip.sheet} options={sheetKeys.map((k) => ({ value: k }))} onChange={(v) => run(() => updateClip(def, current, { sheet: v }))} />
            </div>
            <IconButton tone="danger" className="ml-auto" title="Delete this animation" aria-label="Delete animation" onClick={() => run(() => { const r = deleteClip(def, current); return r.def })}><Trash2 className="h-3.5 w-3.5" /></IconButton>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <Card title="Frames" note={grid ? `${sheet.frameWidth}×${sheet.frameHeight} px · ${grid.columns}×${grid.rows} grid` : undefined} actions={onOpenSheets ? <EdButton size="sm" onClick={onOpenSheets} title="Change how this sheet is cut into frames">Edit cut…</EdButton> : undefined}>
              {clip.directional && (
                <FieldRow>
                  <Segmented<Facing> aria-label="Direction" value={facing} options={FACINGS.map((f) => ({ value: f, label: FACING_LABEL[f] }))} onChange={setFacing} />
                  <span className="ed-label">Use</span>
                  <Select aria-label="Use frames of" className="w-auto min-w-[120px]" value={mirrored ?? ''} options={[{ value: '', label: 'own frames' }, ...FACINGS.filter((f) => f !== facing).map((f) => ({ value: f as string, label: `mirror of ${FACING_LABEL[f]}` }))]} onChange={(v) => run(() => setMirror(def, current, facing, (v || null) as Facing | null))} />
                  <InfoTip>Re-use another direction’s frames flipped sideways, e.g. left = right flipped. Saves drawing both.</InfoTip>
                  <EdButton size="sm" className="ml-auto" title="Gives the first four rows to down, left, right and up in that order. You can change any row afterwards." onClick={() => size && run(() => autoAssignRows(def, current, sheetGrid(sheet, size.width, size.height).columns))}><Wand2 /> Auto-assign rows</EdButton>
                </FieldRow>
              )}

              {mirrored ? <p className="ed-hint">{FACING_LABEL[facing]} shows the frames of {FACING_LABEL[mirrored]}, flipped.</p> : (
                <>
                  <div className="flex flex-wrap items-center gap-1" aria-label="Chosen frames">
                    <span className="ed-label mr-1">Plays</span>
                    {shownFrames.map((f, i) => (
                      <button key={i} type="button" className="ed-badge" title="Remove this frame" aria-label={`Remove frame ${f}`} onClick={() => editFrames(shownFrames.filter((_, n) => n !== i))}>{f}</button>
                    ))}
                    {shownFrames.length === 0 && <span className="ed-hint">No frames chosen. Click frames on the sheet below.</span>}
                    <EdButton size="sm" className="ml-auto" onClick={() => editFrames([])}>Clear</EdButton>
                    <InfoTip>Click a frame to add it · ctrl/cmd-click removes the last one · shift-click adds a range · drag draws a box · a row number adds the whole row.</InfoTip>
                  </div>
                  {url && size ? <FramePicker url={url} sheet={sheet} size={size} frames={shownFrames} zoom={fitZoom(size.width, size.height, 460, 560, 3)} onChange={editFrames} /> : <p className="ed-hint">The sheet’s image is missing.</p>}
                </>
              )}
            </Card>

            <div className="flex flex-col gap-4">
              {url && size && <Card title="Preview"><AnimationPreview def={def} clipName={current} facing={facing} url={url} size={size} /></Card>}
              <Card title="Playback">
                <Field label="Loop" info="On: the animation repeats forever. Off: it plays once and stops on its last frame.">
                  <Toggle aria-label="Loop" checked={clip.loop} onChange={(v) => run(() => updateClip(def, current, { loop: v }))} />
                </Field>
                <Field label="Directional" info="Turn on if this animation looks different when the sprite faces up, down, left or right. Leave off for things that look the same from every side, like a flower.">
                  <Toggle aria-label="Directional" checked={clip.directional} disabled={def.facing === 'none'} onChange={(v) => run(() => setDirectional(def, current, v))} />
                </Field>
                <Field label="FPS" info="Frames per second at normal speed. Higher is faster. Events and movement speed can speed it up or slow it down while the game runs.">
                  <SliderNumber label="FPS" value={clip.fps} min={1} max={60} step={1} onCommit={(v) => run(() => updateClip(def, current, { fps: Math.max(1, v) }))} />
                </Field>
                <Field label="Follow speed" info="Makes the animation play faster when the sprite moves faster, so feet don’t slide. “Reference speed” is the movement speed (px/s) at which this FPS looks right.">
                  <Toggle aria-label="Follow movement speed" checked={!!clip.followSpeed} onChange={(v) => run(() => updateClip(def, current, { followSpeed: v ? { reference: 100 } : undefined }))} />
                </Field>
                {clip.followSpeed && (
                  <Field label="Reference" info="The movement speed in pixels per second at which this animation’s FPS looks right. A sprite moving twice as fast plays it twice as fast.">
                    <NumberField aria-label="Reference speed" size="sm" value={clip.followSpeed.reference} min={1} step={10} unit="px/s" onCommit={(v) => run(() => updateClip(def, current, { followSpeed: { reference: Math.max(1, v) } }))} />
                  </Field>
                )}
                <Section title="Advanced" summary={`playback ${clip.mode ?? 'forward'}`} defaultOpen={false}>
                  <Field label="Playback" stack info="Forward plays frames in order. Reverse plays them backwards. Ping-pong goes forward, then back, which is handy for swaying.">
                    <Segmented<PlaybackMode> aria-label="Playback" value={clip.mode ?? 'forward'} options={[{ value: 'forward', label: 'Forward' }, { value: 'reverse', label: 'Reverse' }, { value: 'pingpong', label: 'Ping-pong' }]} onChange={(v) => run(() => updateClip(def, current, { mode: v === 'forward' ? undefined : v }))} />
                  </Field>
                </Section>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** A titled box; `note` is a quiet one-liner after the title and `actions` sit at its right end. */
function Card({ title, note, actions, children }: { title: string; note?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded border border-border">
      <header className="flex min-h-row items-center gap-2 border-b border-border px-2 py-1">
        <h3 className="ed-section-title">{title}</h3>
        {note && <span className="ed-hint">{note}</span>}
        {actions && <div className="ml-auto">{actions}</div>}
      </header>
      <div className="flex flex-col gap-2 p-2" style={{ ['--label-w' as string]: '112px' }}>{children}</div>
    </section>
  )
}
