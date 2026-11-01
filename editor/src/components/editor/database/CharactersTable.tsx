import { useMemo } from 'react'
import { characterCounts } from '@/lib/databaseModel'
import { Badge } from '../ui/controls'
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
            {counts[c.id]?.errors > 0 && <Badge tone="warn" title="Errors">{counts[c.id].errors}</Badge>}
            {counts[c.id]?.errors === 0 && counts[c.id]?.warnings > 0 && <Badge title="Warnings">{counts[c.id].warnings}</Badge>}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function CharacterDetail({ data, id }: { data: DatabaseData; id: string }) {
  const c = data.sprites.characters[id]
  if (!c) return <p className="ed-hint p-4">Pick a character on the left.</p>
  return (
    <div className="flex flex-col gap-2 p-4" data-testid="character-detail">
      <h2 className="text-ed-title">{c.def.name}</h2>
      <p className="ed-hint">{c.id} · facing {c.def.facing} · {Object.keys(c.def.sheets).length} sheets · {Object.keys(c.def.clips).length} animations</p>
    </div>
  )
}
