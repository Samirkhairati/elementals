import { Plus, Trash2 } from 'lucide-react'
import type { CharacterDef } from '../../../../../../shared/engine/characters'
import type { GraphicInfo } from '../../../../../../shared/engine/graphics'
import { addSheet, cutFromGrid, gridOf, removeSheet, sheetSummary, sheetUsers, updateSheet } from '@/lib/characterEdit'
import { EdButton, Field, FieldRow, IconButton, InfoTip, NumberField, Section } from '../../ui/controls'
import { PivotPicker } from './PivotPicker'

interface Props {
  def: CharacterDef
  onChange: (def: CharacterDef) => void
  graphics: GraphicInfo[]
}

export function SheetsTab({ def, onChange, graphics }: Props) {
  const sizeOf = (image: string) => graphics.find((g) => g.id === image)
  return (
    <div className="flex flex-col gap-2" data-testid="sheets-tab">
      {Object.entries(def.sheets).map(([key, sheet]) => {
        const size = sizeOf(sheet.image)
        const grid = size ? gridOf(sheet, size) : null
        const users = sheetUsers(def, key)
        return (
          <Section key={key} title={key} summary={sheetSummary(sheet, size)} info="One picture and how it is cut into frames.">
            <Field label="Image" info="The picture file this sheet is cut from. Images live in Graphics; you can pick one that other characters already use.">
              <select aria-label={`Image of ${key}`} className="ed-input w-auto min-w-[160px]" value={sheet.image} onChange={(e) => onChange(updateSheet(def, key, { image: e.target.value }))}>
                {!sizeOf(sheet.image) && <option value={sheet.image}>{sheet.image} (missing)</option>}
                {graphics.map((g) => <option key={g.id} value={g.id}>{g.id}</option>)}
              </select>
            </Field>
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
            <Section title="Advanced" summary={`margin ${sheet.margin} · spacing ${sheet.spacing}`} defaultOpen={false}>
              <FieldRow>
                <span className="text-ed-label">Margin</span>
                <NumberField aria-label={`Margin of ${key}`} size="xs" min={0} value={sheet.margin} onCommit={(v) => onChange(updateSheet(def, key, { margin: v }))} />
                <InfoTip>Empty pixels around the whole image before the first frame.</InfoTip>
                <span className="ml-3 text-ed-label">Spacing</span>
                <NumberField aria-label={`Spacing of ${key}`} size="xs" min={0} value={sheet.spacing} onCommit={(v) => onChange(updateSheet(def, key, { spacing: v }))} />
                <InfoTip>Empty pixels between neighbouring frames.</InfoTip>
              </FieldRow>
              <FieldRow>
                <span className="text-ed-label">Pivot override</span>
                <PivotPicker value={sheet.pivot ?? def.pivot} onChange={(p) => onChange(updateSheet(def, key, { pivot: p }))} />
                {sheet.pivot && <EdButton size="sm" onClick={() => onChange(updateSheet(def, key, { pivot: undefined }))}>Use the character’s</EdButton>}
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
        <select aria-label="Add a sheet from" className="ed-input w-auto min-w-[160px]" value="" onChange={(e) => { const g = sizeOf(e.target.value); if (g) onChange(addSheet(def, g.id, g, 'sheet').def) }}>
          <option value="">+ Add sheet…</option>
          {graphics.map((g) => <option key={g.id} value={g.id}>{g.id}</option>)}
        </select>
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="ed-hint">Pick an image from Graphics (import new ones in the Graphics table).</span>
      </FieldRow>
    </div>
  )
}
