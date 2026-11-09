import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PRESET_FOLDERS, PRESET_LABELS, gifFps, newCharacter, newGifCharacter, slugify, suggestGrid, type Preset } from '@/lib/characterEdit'
import { isValidCharacterId } from '../../../../../../shared/engine/graphics'
import { GraphicField } from './GraphicField'
import { Field, Segmented, TextField } from '../../ui/controls'
import { ConfirmFooter } from '../../dialogs/ConfirmParts'
import type { DatabaseData } from '../useDatabaseData'

const PRESET_HELP: Record<Preset, string> = {
  actor: 'Four directions, with idle and walk animations ready to use. Pick this for people and anything that walks around.',
  prop: 'One still picture, like a sign or a rock. It can still be given animations later.',
  animated: 'A strip of frames that loops, like a flower or a flame. Events can play its other animations.',
  gif: 'A GIF that loops, like an animated flame or a creature. Its frames are read from the file, so there is nothing to cut. Pick a GIF from Graphics (import one there).',
}

interface Props {
  data: DatabaseData
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}

/** New character: pick a picture from Graphics, choose what it is (a preset), name it; the cut is suggested and shown. */
export function NewCharacterWizard({ data, open, onOpenChange, onCreated }: Props) {
  const { graphics, images, characters } = data.sprites
  const [image, setImage] = useState('')
  const [preset, setPreset] = useState<Preset>('actor')
  const [name, setName] = useState('')
  const [idEdit, setIdEdit] = useState<string | null>(null)
  const [error, setError] = useState('')
  const graphic = graphics.find((g) => g.id === image)
  // A GIF preset takes a GIF graphic; every other preset takes a picture of frames.
  const wantsGif = preset === 'gif'
  const fits = !!graphic && !!graphic.gif === wantsGif
  const grid = graphic && !wantsGif ? suggestGrid(preset, graphic.width, graphic.height) : null
  const folder = PRESET_FOLDERS[preset]
  const id = idEdit ?? `${folder}/${slugify(name, 'new')}`
  const idError = useMemo(() => (!isValidCharacterId(id) ? 'Use letters, digits, “-”, “_” and “/”.' : characters[id] ? 'A sprite with this id already exists.' : ''), [id, characters])

  const create = async () => {
    if (!graphic || !fits) return
    const def = wantsGif ? newGifCharacter(name, graphic) : newCharacter(preset, name, graphic.id, graphic)
    const r = await data.sprites.saveCharacter(id, def)
    if (!r.ok) return setError(r.error)
    onOpenChange(false)
    onCreated(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-4" aria-describedby="new-character-desc">
        <DialogHeader className="text-left">
          <DialogTitle>New sprite</DialogTitle>
          <DialogDescription id="new-character-desc" className="ed-hint">Pick a picture, say what it is and give it a name. You can change everything afterwards.</DialogDescription>
        </DialogHeader>

        <Field label={wantsGif ? 'GIF' : 'Picture'} stack info={wantsGif ? 'The GIF this sprite plays. GIFs live in Graphics (import new ones there).' : 'The picture file this sprite is cut from. Images live in Graphics (import new ones there).'}>
          <GraphicField aria-label="Picture" kind={wantsGif ? 'gif' : 'sheet'} value={fits ? image : ''} graphics={graphics} images={images} onChange={setImage} />
        </Field>
        {graphic && fits && (
          <div className="flex items-center gap-3 rounded border border-border bg-card/30 p-2">
            {images[graphic.id] && <img src={images[graphic.id]} alt="Chosen picture" className="ed-checker max-h-24 max-w-[40%] shrink-0 rounded border border-border object-contain" style={{ imageRendering: 'pixelated' }} />}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-ed-label text-foreground">{graphic.id}</span>
              {graphic.gif ? <span className="ed-hint" data-testid="gif-suggestion">{graphic.gif.frames} frame{graphic.gif.frames === 1 ? '' : 's'} of {graphic.gif.frameWidth}×{graphic.gif.frameHeight} px, plays at about {gifFps(graphic)} fps.</span> : <span className="ed-hint">{graphic.width}×{graphic.height} px</span>}
              {grid && <span className="ed-hint" data-testid="grid-suggestion">Cut as {grid.columns}×{grid.rows} frames of {grid.frameWidth}×{grid.frameHeight} px.</span>}
            </div>
          </div>
        )}

        <Field label="It is a" stack>
          <div className="flex w-full flex-col gap-1.5">
            <Segmented<Preset> className="w-full [&>button]:flex-1" aria-label="Preset" value={preset} options={(Object.keys(PRESET_LABELS) as Preset[]).map((p) => ({ value: p, label: PRESET_LABELS[p] }))} onChange={(p) => { setPreset(p); setError('') }} />
            <p className="ed-hint">{PRESET_HELP[preset]}</p>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" stack>
            <TextField aria-label="Name" value={name} onCommit={setName} placeholder="Old man" />
          </Field>
          <Field label="Id" stack info="The permanent name maps and events use to refer to this sprite.">
            <TextField aria-label="Id" value={id} onCommit={setIdEdit} />
          </Field>
        </div>
        {idError && <p role="alert" className="-mt-2 text-destructive">{idError}</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}

        <ConfirmFooter tone="primary" note="Nothing is saved until you press Create." onCancel={() => onOpenChange(false)} onConfirm={() => void create()} confirmLabel="Create" disabled={!fits || !!idError} />
      </DialogContent>
    </Dialog>
  )
}
