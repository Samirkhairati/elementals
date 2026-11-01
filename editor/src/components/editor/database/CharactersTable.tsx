import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { characterCounts } from '@/lib/databaseModel'
import { Badge, EdButton } from '../ui/controls'
import { CharacterEditor } from './characters/CharacterEditor'
import { NewCharacterWizard } from './characters/NewCharacterWizard'
import { CharacterThumb, Tile, TileGroups, groupByFolder } from './browse'
import type { DatabaseData } from './useDatabaseData'
import type { TableProps } from './shared'

export function CharactersBrowser({ data, query, selected, onSelect, mode }: TableProps) {
  const { characters, graphics, images } = data.sprites
  const counts = useMemo(() => characterCounts(characters, graphics), [characters, graphics])
  const sizes = useMemo(() => Object.fromEntries(graphics.map((g) => [g.id, { width: g.width, height: g.height }])), [graphics])
  const q = query.trim().toLowerCase()
  const list = Object.values(characters).filter((c) => !q || c.id.toLowerCase().includes(q) || c.def.name.toLowerCase().includes(q) || c.def.tags.some((t) => t.toLowerCase().includes(q))).sort((a, b) => (a.id < b.id ? -1 : 1))
  if (list.length === 0) return <p className="ed-hint p-3">No characters{q ? ` match “${query}”` : ' yet'}.</p>
  const used = data.refs.counts('character')
  const problem = (id: string) =>
    counts[id]?.errors > 0 ? <Badge tone="warn" title="Errors">{counts[id].errors}</Badge> : counts[id]?.warnings > 0 ? <Badge title="Warnings">{counts[id].warnings}</Badge> : null

  if (mode === 'tiles') {
    return (
      <TileGroups groups={groupByFolder(list, (c) => c.id)}>
        {(c) => <Tile key={c.id} selected={selected === c.id} name={c.def.name || c.id} title={`${c.id} · used in ${used[c.id] ?? 0}`} hint={`used ${used[c.id] ?? 0}`} thumb={<CharacterThumb def={c.def} images={images} sizes={sizes} size={56} />} badge={problem(c.id)} onClick={() => onSelect(c.id)} />}
      </TileGroups>
    )
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {list.map((c) => (
        <li key={c.id}>
          <button type="button" data-selected={selected === c.id ? 'true' : undefined} className="ed-row flex h-auto w-full items-center gap-2 py-1 text-left" onClick={() => onSelect(c.id)}>
            <CharacterThumb def={c.def} images={images} sizes={sizes} size={32} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-ed-label text-foreground">{c.def.name || c.id}</span>
              <span className="ed-hint truncate">{c.id}</span>
            </span>
            <span className="ed-hint" title="Places that use this character">{used[c.id] ?? 0}</span>
            {problem(c.id)}
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
