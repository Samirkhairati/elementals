import { useEffect, useMemo, useState } from 'react'
import { Save, Undo2 } from 'lucide-react'
import { validateCharacter, type CharacterDef } from '../../../../../../shared/engine/characters'
import { Badge, EdButton, Segmented } from '../../ui/controls'
import type { DatabaseData } from '../useDatabaseData'
import { AnimationsTab } from './AnimationsTab'
import { SetupTab } from './SetupTab'
import { SheetsTab } from './SheetsTab'

type Tab = 'animations' | 'sheets' | 'setup'
const TABS: { value: Tab; label: string }[] = [{ value: 'animations', label: 'Animations' }, { value: 'sheets', label: 'Sheets' }, { value: 'setup', label: 'Setup' }]

export function CharacterEditor({ data, id }: { data: DatabaseData; id: string }) {
  const stored = data.sprites.characters[id]
  const [draft, setDraft] = useState<CharacterDef | null>(stored?.def ?? null)
  const [tab, setTab] = useState<Tab>('animations')
  const [error, setError] = useState('')

  // A different character, or a fresh copy from disk (after save / reload), replaces the draft.
  useEffect(() => {
    setDraft(stored?.def ?? null)
    setError('')
  }, [id, stored?.def])

  const { graphics, images } = data.sprites
  const sizes = useMemo(() => Object.fromEntries(graphics.map((g) => [g.id, { width: g.width, height: g.height }])), [graphics])
  const check = useMemo(() => (draft ? validateCharacter(draft, { graphics: new Set(graphics.map((g) => g.id)), imageSizes: sizes }) : null), [draft, graphics, sizes])
  const dirty = !!draft && !!stored && JSON.stringify(draft) !== JSON.stringify(stored.def)

  if (!stored || !draft || !check) return <p className="ed-hint p-4">Pick a character on the left, or create one with “New character…”.</p>

  const save = async () => {
    const r = await data.sprites.saveCharacter(id, draft)
    setError(r.ok ? '' : r.error)
  }
  const errors = check.issues.filter((i) => i.severity === 'error')
  const warnings = check.issues.filter((i) => i.severity !== 'error')

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="character-detail">
      <header className="flex flex-wrap items-center gap-2 border-b border-sidebar-border px-4 py-2">
        <h2 className="text-ed-title">{draft.name || id}</h2>
        <code className="ed-hint">{id}</code>
        {dirty && <Badge tone="event">unsaved</Badge>}
        {errors.length > 0 && <Badge tone="warn" title="Errors block saving">{errors.length} error{errors.length === 1 ? '' : 's'}</Badge>}
        {warnings.length > 0 && <Badge title="Warnings do not block saving">{warnings.length} note{warnings.length === 1 ? '' : 's'}</Badge>}
        <div className="ml-auto flex items-center gap-1">
          <EdButton size="sm" disabled={!dirty} onClick={() => setDraft(stored.def)}><Undo2 /> Revert</EdButton>
          <EdButton size="sm" variant="primary" disabled={!dirty || errors.length > 0} onClick={() => void save()}><Save /> Save</EdButton>
        </div>
      </header>
      {error && <p role="alert" className="px-4 py-1 text-destructive">{error}</p>}
      <div className="px-4 py-2"><Segmented<Tab> aria-label="Character sections" value={tab} options={TABS} onChange={setTab} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {check.issues.length > 0 && (
          <ul aria-label="Problems" className="mb-3 text-ed-label">
            {check.issues.map((i, n) => <li key={n} data-severity={i.severity} className={i.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{i.severity === 'error' ? '✕' : i.severity === 'warning' ? '!' : 'i'} {i.message}</li>)}
          </ul>
        )}
        {tab === 'animations' && <AnimationsTab def={draft} onChange={setDraft} images={images} sizes={sizes} />}
        {tab === 'sheets' && <SheetsTab def={draft} onChange={setDraft} graphics={graphics} />}
        {tab === 'setup' && <SetupTab id={id} def={draft} onChange={setDraft} />}
      </div>
    </div>
  )
}
