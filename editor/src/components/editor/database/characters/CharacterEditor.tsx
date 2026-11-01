import { useEffect, useMemo, useState } from 'react'
import { Save, Undo2 } from 'lucide-react'
import { validateCharacter, type CharacterDef } from '../../../../../../shared/engine/characters'
import { Badge, EdButton, Segmented } from '../../ui/controls'
import type { DatabaseData } from '../useDatabaseData'
import { planClipRenames } from '@/lib/renameFlow'
import { AnimationsTab } from './AnimationsTab'
import { CharacterActions } from './CharacterActions'
import { UsedByTab } from './UsedByTab'
import { SetupTab } from './SetupTab'
import { SheetsTab } from './SheetsTab'

type Tab = 'animations' | 'sheets' | 'setup' | 'used-by'
const TAB_LABELS: Record<Tab, string> = { animations: 'Animations', sheets: 'Sheets', setup: 'Setup', 'used-by': 'Used by' }
const isTab = (t: unknown): t is Tab => typeof t === 'string' && t in TAB_LABELS

export function CharacterEditor({ data, id, tab: tabParam, onSelect }: { data: DatabaseData; id: string; tab?: string; onSelect?: (id: string) => void }) {
  const stored = data.sprites.characters[id]
  const [draft, setDraft] = useState<CharacterDef | null>(stored?.def ?? null)
  const [tab, setTab] = useState<Tab>(isTab(tabParam) ? tabParam : 'animations')
  const [error, setError] = useState('')
  const [action, setAction] = useState<'rename' | 'delete' | null>(null)
  const [renames, setRenames] = useState<{ from: string; to: string }[]>([])

  // A different character, or a fresh copy from disk (after save / reload), replaces the draft.
  useEffect(() => {
    setDraft(stored?.def ?? null)
    setError('')
  }, [id, stored?.def])
  useEffect(() => {
    setRenames([])
    if (isTab(tabParam)) setTab(tabParam)
  }, [id, tabParam])

  const { graphics, images } = data.sprites
  const sizes = useMemo(() => Object.fromEntries(graphics.map((g) => [g.id, { width: g.width, height: g.height }])), [graphics])
  const check = useMemo(() => (draft ? validateCharacter(draft, { graphics: new Set(graphics.map((g) => g.id)), imageSizes: sizes }) : null), [draft, graphics, sizes])
  const dirty = !!draft && !!stored && JSON.stringify(draft) !== JSON.stringify(stored.def)

  if (!stored || !draft || !check) return <p className="ed-hint p-4">Pick a sprite on the left, or create one with “New sprite…”.</p>

  const save = async () => {
    const r = await data.sprites.saveCharacter(id, draft)
    if (!r.ok) return setError(r.error)
    // renamed animations: every map that named the old one is rewritten
    const failed: string[] = []
    for (const m of planClipRenames(data.maps, id, renames)) {
      const w = await window.electronAPI?.saveMap(m.folderPath, m.fileName, m)
      if (!w?.success) failed.push(m.name || m.fileName)
    }
    setRenames([])
    setError(failed.length ? `Saved, but these maps could not be updated: ${failed.join(', ')}` : '')
    if (renames.length > 0) await data.reload()
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
        <button type="button" className="ed-badge" title="Where this sprite is used" onClick={() => setTab('used-by')}>Used in {data.refs.counts('character')[id] ?? 0}</button>
        <div className="ml-auto flex items-center gap-1">
          <EdButton size="sm" onClick={() => setAction('rename')}>Rename…</EdButton>
          <EdButton size="sm" variant="danger" onClick={() => setAction('delete')}>Delete…</EdButton>
          <EdButton size="sm" disabled={!dirty} onClick={() => { setDraft(stored.def); setRenames([]) }}><Undo2 /> Revert</EdButton>
          <EdButton size="sm" variant="primary" disabled={!dirty || errors.length > 0} onClick={() => void save()}><Save /> Save</EdButton>
        </div>
      </header>
      {error && <p role="alert" className="px-4 py-1 text-destructive">{error}</p>}
      <div className="px-4 py-2"><Segmented<Tab> aria-label="Sprite sections" value={tab} options={(Object.keys(TAB_LABELS) as Tab[]).map((t) => ({ value: t, label: TAB_LABELS[t] }))} onChange={setTab} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {check.issues.length > 0 && (
          <ul aria-label="Problems" className="mb-3 text-ed-label">
            {check.issues.map((i, n) => <li key={n} data-severity={i.severity} className={i.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{i.severity === 'error' ? '✕' : i.severity === 'warning' ? '!' : 'i'} {i.message}</li>)}
          </ul>
        )}
        {tab === 'animations' && <AnimationsTab def={draft} onChange={setDraft} images={images} sizes={sizes} clipCounts={data.refs.clipCounts(id)} onRenameClip={(from, to) => setRenames((r) => [...r, { from, to }])} onOpenSheets={() => setTab('sheets')} />}
        {tab === 'sheets' && <SheetsTab def={draft} onChange={setDraft} graphics={graphics} images={images} />}
        {tab === 'setup' && <SetupTab id={id} def={draft} onChange={setDraft} />}
        {tab === 'used-by' && <UsedByTab data={data} id={id} />}
        <CharacterActions data={data} id={id} mode={action} onClose={() => setAction(null)} onDone={(next) => { setAction(null); onSelect?.(next ?? '') }} />
      </div>
    </div>
  )
}
