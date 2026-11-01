import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { summarizeMap } from '@/lib/databaseModel'
import type { DatabaseData } from './useDatabaseData'
import type { TableProps } from './shared'

export function MapsBrowser({ data, query, selected, onSelect }: TableProps) {
  const q = query.trim().toLowerCase()
  const list = data.maps.filter((m) => !q || m.name.toLowerCase().includes(q))
  if (data.maps.length === 0) return <p className="ed-hint p-3">No maps yet.</p>
  return (
    <ul>
      {list.map((m) => (
        <li key={m.fileName}>
          <button type="button" data-selected={selected === m.fileName ? 'true' : undefined} className="ed-row w-full py-0.5 text-left text-ed-label" onClick={() => onSelect(m.fileName)}>{m.name || m.fileName}</button>
        </li>
      ))}
    </ul>
  )
}

export function MapDetail({ data, id }: { data: DatabaseData; id: string }) {
  const map = data.maps.find((m) => m.fileName === id)
  const summary = useMemo(() => (map ? summarizeMap(map) : null), [map])
  if (!map || !summary) return <p className="ed-hint p-4">Pick a map on the left.</p>
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="map-detail">
      <h2 className="text-ed-title">{summary.name}</h2>
      <p className="ed-hint">{summary.width}×{summary.height} tiles · {summary.layers} layers · {summary.entities} entities</p>
      <section><h3 className="text-ed-label">Tilesets ({summary.tilesets.length})</h3><p>{summary.tilesets.join(', ') || '—'}</p></section>
      <section><h3 className="text-ed-label">Characters ({summary.characters.length})</h3><p>{summary.characters.join(', ') || '—'}</p></section>
      <Link to="/editor" className="ed-btn w-fit">Open in Map Editor</Link>
    </div>
  )
}
