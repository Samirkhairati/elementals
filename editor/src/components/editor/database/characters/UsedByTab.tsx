import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { groupReferences } from '@/lib/referenceIndex'
import type { DatabaseData } from '../useDatabaseData'
import type { Reference } from '../../../../../../shared/engine/references'

/** Every map, entity, event and prefab that refers to a character (grouped), with a filter by animation and the graphics it uses. */
export function UsedByTab({ data, id }: { data: DatabaseData; id: string }) {
  const [clip, setClip] = useState('')
  const def = data.sprites.characters[id]?.def
  const refs = useMemo<Reference[]>(() => data.refs.of(clip ? { table: 'character', id, clip } : { table: 'character', id }).filter((r) => r.where !== 'binding'), [data.refs, id, clip])
  const groups = useMemo(() => groupReferences(refs), [refs])
  const clipCounts = data.refs.clipCounts(id)
  return (
    <div className="flex flex-col gap-3" data-testid="used-by-tab">
      <label className="ed-hint flex items-center gap-2">
        Animation
        <select aria-label="Filter by animation" className="ed-input w-auto min-w-[120px]" value={clip} onChange={(e) => setClip(e.target.value)}>
          <option value="">all</option>
          {Object.keys(def?.clips ?? {}).map((c) => <option key={c} value={c}>{c} · {clipCounts[c] ?? 0}</option>)}
        </select>
      </label>
      {groups.length === 0 ? <p className="ed-hint">{clip ? `No map or event plays “${clip}”.` : 'Nothing uses this character yet.'}</p> : groups.map((g) => (
        <section key={g.map || 'others'}>
          <h3 className="text-ed-label font-medium">{g.map || 'Prefabs'} </h3>
          <ul>
            {g.entities.map((e) => (
              <li key={e.entity}>
                <span>{e.entity}</span>
                <ul className="ml-4">
                  {e.refs.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-ed-label">
                      <span>{r.label.split(' › ').slice(2).join(' › ') || 'Sprite'}</span>
                      <Link to="/editor" className="ed-hint underline" title={`Open ${r.source.table === 'map' ? r.source.mapName : ''} in the Map Editor`}>Open</Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {g.others.map((r, i) => <li key={i} className="text-ed-label">{r.label} <span className="ed-hint">(defined in code)</span></li>)}
          </ul>
        </section>
      ))}
      <section>
        <h3 className="text-ed-label font-medium">Uses (graphics)</h3>
        <ul>{Object.entries(def?.sheets ?? {}).map(([k, s]) => <li key={k} className="text-ed-label">{s.image} <span className="ed-hint">sheet {k}</span></li>)}</ul>
      </section>
    </div>
  )
}
