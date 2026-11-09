import { useState } from 'react'
import { Plus, Trash2, Wand2 } from 'lucide-react'
import type { CharacterDef } from '../../../../../../shared/engine/characters'
import type { GraphicInfo } from '../../../../../../shared/engine/graphics'
import { addGifAnimation, addSheet, cutFromGrid, gifFps, gifGraphics, gridOf, removeSheet, setSheetGif, setSheetPicture, sheetSource, sheetSummary, sheetUsers, stillGraphics, updateSheet, type SheetSource } from '@/lib/characterEdit'
import { readImagePixels } from '@/lib/imagePixels'
import { describeDetection, detectSheetGrid } from '@/lib/sheetDetect'
import { PicturePicker } from '../../dialogs/PicturePicker'
import { GraphicField } from './GraphicField'
import { EdButton, Field, FieldRow, IconButton, InfoTip, NumberField, Section, Segmented } from '../../ui/controls'
import { PivotPicker } from './PivotPicker'
import { SheetGridPreview } from './SheetGridPreview'

interface Props {
  def: CharacterDef
  onChange: (def: CharacterDef) => void
  graphics: GraphicInfo[]
  /** data: URL of each graphic, for the cut preview and for detecting the cut. */
  images?: Record<string, string>
}

const CUT_INFO = 'A sheet is cut into an even grid of equal frames, numbered 0, 1, 2… left to right, top to bottom. The grid comes from the frame width and height (with the margin around the image and the spacing between frames). Set columns × rows and the size is worked out, or let “Detect from picture” find the gaps between sprites.'

export function SheetsTab({ def, onChange, graphics, images = {} }: Props) {
  const sizeOf = (image: string) => graphics.find((g) => g.id === image)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [picking, setPicking] = useState(false)
  const [pickingGif, setPickingGif] = useState(false)
  // A sheet whose source is being switched: the picker for the new kind is open for it.
  const [switching, setSwitching] = useState<{ key: string; to: SheetSource } | null>(null)
  const note = (key: string, text: string) => setNotes((n) => ({ ...n, [key]: text }))

  const detect = async (key: string) => {
    const sheet = def.sheets[key]
    const size = sizeOf(sheet.image)
    const url = images[sheet.image]
    if (!size || !url) return note(key, 'The image is missing, so there is nothing to look at.')
    try {
      const found = detectSheetGrid(await readImagePixels(url))
      const current = gridOf(sheet, size)
      const columns = found.columns ?? Math.max(1, current.columns)
      const rows = found.rows ?? Math.max(1, current.rows)
      if (found.columns === null && found.rows === null) return note(key, describeDetection(found, { columns, rows, ...cutFromGrid(size, columns, rows, sheet.margin, sheet.spacing) }))
      const cut = cutFromGrid(size, columns, rows, 0, 0)
      onChange(updateSheet(def, key, { ...cut, margin: 0, spacing: 0 }))
      note(key, describeDetection(found, { columns, rows, ...cut }))
    } catch (e) {
      note(key, e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="flex flex-col gap-2" data-testid="sheets-tab">
      {Object.entries(def.sheets).map(([key, sheet]) => {
        const size = sizeOf(sheet.image)
        const grid = size ? gridOf(sheet, size) : null
        const users = sheetUsers(def, key)
        const source = sheetSource(sheet)
        const isGif = source === 'gif'
        return (
          <Section key={key} title={key} summary={isGif ? gifSummary(size) : sheetSummary(sheet, size)} info="One picture, or one GIF, and how it is cut into frames.">
            <Field label="Source" info="A spritesheet is a picture of frames side by side that you cut into a grid. A GIF is an animation: its frames are read from the file, so there is nothing to cut, and its animation plays all of them (you set the speed).">
              <Segmented<SheetSource>
                aria-label={`Source of ${key}`}
                value={source}
                options={[{ value: 'sheet', label: 'Spritesheet' }, { value: 'gif', label: 'GIF' }]}
                onChange={(to) => to !== source && setSwitching({ key, to })}
              />
            </Field>
            <Field label={isGif ? 'GIF' : 'Image'} info={isGif ? 'The GIF this sheet plays. GIFs live in Graphics (import one there); you can pick one that other sprites already use.' : 'The picture file this sheet is cut from. Images live in Graphics; you can pick one that other sprites already use.'}>
              <GraphicField
                aria-label={`Image of ${key}`}
                value={sheet.image}
                missing={!sizeOf(sheet.image)}
                kind={source}
                graphics={graphics}
                images={images}
                onChange={(v) => {
                  const g = sizeOf(v)
                  onChange(isGif && g ? setSheetGif(def, key, g) : updateSheet(def, key, { image: v }))
                }}
              />
            </Field>
            {isGif && size?.gif && (
              <p className="ed-hint" data-testid={`gif-info-${key}`}>
                {size.gif.frames} frame{size.gif.frames === 1 ? '' : 's'} of {size.gif.frameWidth}×{size.gif.frameHeight} px, made to play at about {gifFps(size)} fps. Its animations play every frame; set their speed in Animations.
              </p>
            )}
            {isGif && size && !size.gif && <p role="alert" className="text-destructive">This is not a GIF graphic.</p>}
            {size && images[sheet.image] && (
              <div className="flex flex-wrap items-start gap-3">
                <SheetGridPreview url={images[sheet.image]} sheet={sheet} size={size} />
                <div className="flex min-w-[200px] flex-1 flex-col gap-2">
                  {!isGif && (
                    <FieldRow>
                      <EdButton size="sm" onClick={() => void detect(key)}><Wand2 /> Detect from picture</EdButton>
                      <InfoTip>{CUT_INFO}</InfoTip>
                    </FieldRow>
                  )}
                  {notes[key] && <p role="status" className="ed-hint" data-testid={`detect-note-${key}`}>{notes[key]}</p>}
                  <p className="ed-hint">{isGif ? 'The frames of the GIF in order, side by side. The number is what animations use to refer to a frame.' : 'Each box is one frame; the number is what animations use to refer to it.'}</p>
                </div>
              </div>
            )}
            {!isGif && <>
            <FieldRow>
              <span className="text-ed-label">Columns × Rows</span>
              <NumberField aria-label={`Columns of ${key}`} size="xs" min={1} value={grid?.columns ?? 1} onCommit={(c) => size && onChange(updateSheet(def, key, cutFromGrid(size, c, grid?.rows || 1, sheet.margin, sheet.spacing)))} />
              ×
              <NumberField aria-label={`Rows of ${key}`} size="xs" min={1} value={grid?.rows ?? 1} onCommit={(r) => size && onChange(updateSheet(def, key, cutFromGrid(size, grid?.columns || 1, r, sheet.margin, sheet.spacing)))} />
              <InfoTip>How many frames the image has across and down. The frame size is worked out from this.</InfoTip>
              {grid && <span className="ed-hint">{grid.count} frames</span>}
            </FieldRow>
            <FieldRow>
              <span className="text-ed-label">Frame</span>
              <NumberField aria-label={`Frame width of ${key}`} size="sm" min={1} unit="px" value={sheet.frameWidth} onCommit={(v) => onChange(updateSheet(def, key, { frameWidth: v }))} />
              ×
              <NumberField aria-label={`Frame height of ${key}`} size="sm" min={1} unit="px" value={sheet.frameHeight} onCommit={(v) => onChange(updateSheet(def, key, { frameHeight: v }))} />
              <InfoTip>The width and height of one frame in pixels. Calculated from columns and rows; change it only if the image has odd sizes.</InfoTip>
            </FieldRow>
            </>}
            <Section title="Advanced" summary={isGif ? 'pivot' : `margin ${sheet.margin} · spacing ${sheet.spacing}`} defaultOpen={false}>
              {!isGif && (
              <FieldRow>
                <span className="text-ed-label">Margin</span>
                <NumberField aria-label={`Margin of ${key}`} size="xs" min={0} value={sheet.margin} onCommit={(v) => onChange(updateSheet(def, key, { margin: v }))} />
                <InfoTip>Empty pixels around the whole image before the first frame.</InfoTip>
                <span className="ml-3 text-ed-label">Spacing</span>
                <NumberField aria-label={`Spacing of ${key}`} size="xs" min={0} value={sheet.spacing} onCommit={(v) => onChange(updateSheet(def, key, { spacing: v }))} />
                <InfoTip>Empty pixels between neighbouring frames.</InfoTip>
              </FieldRow>
              )}
              <FieldRow>
                <span className="text-ed-label">Pivot override</span>
                <PivotPicker value={sheet.pivot ?? def.pivot} onChange={(p) => onChange(updateSheet(def, key, { pivot: p }))} />
                {sheet.pivot && <EdButton size="sm" onClick={() => onChange(updateSheet(def, key, { pivot: undefined }))}>Use the sprite’s</EdButton>}
                <InfoTip>Use a different pivot for animations on this sheet, for example when its frames are bigger than the others.</InfoTip>
              </FieldRow>
            </Section>
            <FieldRow>
              <span className="ed-hint">{users.length > 0 ? `Used by ${users.join(', ')}` : 'Not used by any animation'}</span>
              <IconButton tone="danger" className="ml-auto" title={users.length > 0 ? `Used by ${users.join(', ')}; remove those first` : 'Remove this sheet'} aria-label={`Remove sheet ${key}`} disabled={users.length > 0} onClick={() => onChange(removeSheet(def, key))}><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </FieldRow>
          </Section>
        )
      })}
      <FieldRow>
        <EdButton size="sm" aria-label="Add a sheet" onClick={() => setPicking(true)}><Plus /> Add sheet…</EdButton>
        <PicturePicker open={picking} onOpenChange={setPicking} tabs={['graphics']} title="Add a sheet: choose a picture" graphics={stillGraphics(graphics)} images={images} onPick={(p) => { const g = p.graphicId ? sizeOf(p.graphicId) : undefined; if (g) onChange(addSheet(def, g.id, g, 'sheet').def) }} />
        <EdButton size="sm" aria-label="Add a GIF" onClick={() => setPickingGif(true)}><Plus /> Add GIF…</EdButton>
        <PicturePicker open={pickingGif} onOpenChange={setPickingGif} tabs={['graphics']} title="Add a GIF animation: choose a GIF" graphics={gifGraphics(graphics)} images={images} onPick={(p) => { const g = p.graphicId ? sizeOf(p.graphicId) : undefined; if (g?.gif) onChange(addGifAnimation(def, g).def) }} />
        <PicturePicker
          open={switching !== null}
          onOpenChange={(o) => !o && setSwitching(null)}
          tabs={['graphics']}
          title={switching?.to === 'gif' ? 'Play a GIF: choose a GIF' : 'Use a spritesheet: choose a picture'}
          graphics={switching?.to === 'gif' ? gifGraphics(graphics) : stillGraphics(graphics)}
          images={images}
          onPick={(p) => {
            const g = p.graphicId ? sizeOf(p.graphicId) : undefined
            if (g && switching) onChange(switching.to === 'gif' ? setSheetGif(def, switching.key, g) : setSheetPicture(def, switching.key, g))
          }}
        />
        <span className="ed-hint">Pick a picture or a GIF from Graphics (import new ones in the Graphics table).</span>
      </FieldRow>
    </div>
  )
}

/** "3 frames of 64×48 px" for a collapsed GIF sheet. */
function gifSummary(size?: GraphicInfo): string {
  return size?.gif ? `GIF · ${size.gif.frames} frame${size.gif.frames === 1 ? '' : 's'} of ${size.gif.frameWidth}×${size.gif.frameHeight} px` : 'GIF'
}
