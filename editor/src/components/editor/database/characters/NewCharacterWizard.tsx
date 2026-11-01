import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PRESET_LABELS, newCharacter, slugify, suggestGrid, type Preset } from '@/lib/characterEdit'
import { isValidCharacterId } from '../../../../../../shared/engine/graphics'
import { EdButton, Field, FieldRow, InfoTip, Segmented, TextField } from '../../ui/controls'
import type { DatabaseData } from '../useDatabaseData'

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
  const grid = graphic ? suggestGrid(preset, graphic.width, graphic.height) : null
  const folder = preset === 'actor' ? 'characters' : 'objects'
  const id = idEdit ?? `${folder}/${slugify(name, 'new')}`
  const idError = useMemo(() => (!isValidCharacterId(id) ? 'Use letters, digits, “-”, “_” and “/”.' : characters[id] ? 'A character with this id already exists.' : ''), [id, characters])

  const create = async () => {
    if (!graphic) return
    const def = newCharacter(preset, name, graphic.id, graphic)
    const r = await data.sprites.saveCharacter(id, def)
    if (!r.ok) return setError(r.error)
    onOpenChange(false)
    onCreated(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="new-character-desc">
        <DialogHeader className="text-left">
          <DialogTitle>New character</DialogTitle>
          <DialogDescription id="new-character-desc">Pick a picture, say what it is, and give it a name. You can change everything afterwards.</DialogDescription>
        </DialogHeader>
        <Field label="Picture" stack info="The picture file this character is cut from. Images live in Graphics (import new ones there).">
          <select aria-label="Picture" className="ed-input" value={image} onChange={(e) => setImage(e.target.value)}>
            <option value="">Choose a graphic…</option>
            {graphics.map((g) => <option key={g.id} value={g.id}>{g.id} ({g.width}×{g.height})</option>)}
          </select>
        </Field>
        {graphic && images[graphic.id] && <img src={images[graphic.id]} alt="Chosen picture" className="max-h-32 self-start rounded border border-border" style={{ imageRendering: 'pixelated' }} />}
        <Field label="It is a" stack info="Actors have four directions (walk, idle). An object is one picture; an animated prop plays its frames in a loop.">
          <Segmented<Preset> aria-label="Preset" value={preset} options={(Object.keys(PRESET_LABELS) as Preset[]).map((p) => ({ value: p, label: PRESET_LABELS[p] }))} onChange={setPreset} />
        </Field>
        {grid && <p className="ed-hint" data-testid="grid-suggestion">Cut as {grid.columns}×{grid.rows} frames of {grid.frameWidth}×{grid.frameHeight} px.</p>}
        <Field label="Name" stack>
          <TextField aria-label="Name" value={name} onCommit={setName} placeholder="Old man" />
        </Field>
        <Field label="Id" stack info="The permanent name maps and events use to refer to this character.">
          <FieldRow>
            <TextField aria-label="Id" value={id} onCommit={setIdEdit} />
            {idError && <span role="alert" className="text-destructive">{idError}</span>}
          </FieldRow>
        </Field>
        <InfoTip>Nothing is saved until you press Create.</InfoTip>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <EdButton onClick={() => onOpenChange(false)}>Cancel</EdButton>
          <EdButton variant="primary" disabled={!graphic || !!idError} onClick={() => void create()}>Create</EdButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
