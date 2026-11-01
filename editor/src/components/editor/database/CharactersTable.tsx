import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { characterCounts } from '@/lib/databaseModel'
import { Badge, EdButton } from '../ui/controls'
import { CharacterEditor } from './characters/CharacterEditor'
import { NewCharacterWizard } from './characters/NewCharacterWizard'
import type { DatabaseData } from './useDatabaseData'
import type { TableProps } from './shared'

export function CharactersBrowser({ data, query, selected, onSelect }: TableProps) {
  const { characters, graphics } = data.sprites
  const counts = useMemo(() => characterCounts(characters, graphics), [characters, graphics])
  const q = query.trim().toLowerCase()
  const list = Object.values(characters).filter((c) => !q || c.id.toLowerCase().includes(q) || c.def.name.toLowerCase().includes(q) || c.def.tags.some((t) => t.toLowerCase().includes(q))).sort((a, b) => (a.id < b.id ? -1 : 1))
  if (list.length === 0) return <p className="ed-hint p-3">No characters{q ? ` match “${query}”` : ' yet'}.</p>
  return (
    <ul>
      {list.map((c) => (
        <li key={c.id}>
          <button type="button" data-selected={selected === c.id ? 'true' : undefined} className="ed-row flex w-full items-center gap-2 py-0.5 text-left text-ed-label" onClick={() => onSelect(c.id)}>
            <span className="truncate">{c.def.name || c.id}</span>
            <span className="ed-hint truncate">{c.id}</span>
            <span className="ed-hint" title="Places that use this character">{data.refs.counts('character')[c.id] ?? 0}</span>
            {counts[c.id]?.errors > 0 && <Badge tone="warn" title="Errors">{counts[c.id].errors}</Badge>}
            {counts[c.id]?.errors === 0 && counts[c.id]?.warnings > 0 && <Badge title="Warnings">{counts[c.id].warnings}</Badge>}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function CharacterDetail({ data, id, tab, onSelect }: { data: DatabaseData; id: string; tab?: string; onSelect?: (id: string) => void }) {
  return <CharacterEditor data={data} id={id} tab={tab} onSelect={onSelect} />
}

export function CharactersToolbar({ data, onSelect }: { data: DatabaseData; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border p-2">
      <EdButton size="sm" onClick={() => setOpen(true)}><Plus /> New character…</EdButton>
      <NewCharacterWizard data={data} open={open} onOpenChange={setOpen} onCreated={onSelect} />
    </div>
  )
}
