import { useMemo } from 'react'
import { tilesetGrid, tilesetUsage } from '@/lib/databaseModel'
import { Badge, InfoTip } from '../ui/controls'
import { TILE_SIZE } from '../../../../../shared/engine/constants'
import type { DatabaseData } from './useDatabaseData'
import type { TableProps } from './shared'

export function TilesetsBrowser({ data, query, selected, onSelect }: TableProps) {
  const usage = useMemo(() => tilesetUsage(data.maps), [data.maps])
  const q = query.trim().toLowerCase()
  const list = data.tilesets.filter((t) => !q || t.name.toLowerCase().includes(q) || t.fileName.toLowerCase().includes(q))
  if (data.tilesets.length === 0) return <p className="ed-hint p-3">No tilesets yet. Import them in the Map Editor.</p>
  return (
    <ul>
      {list.map((t) => (
        <li key={t.fileName}>
          <button type="button" data-selected={selected === t.fileName ? 'true' : undefined} className="ed-row flex w-full items-center gap-2 py-0.5 text-left text-ed-label" onClick={() => onSelect(t.fileName)}>
            <span className="truncate">{t.name}</span>
            {!(usage[t.fileName]?.length) && <Badge title="No map paints with this tileset">unused</Badge>}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function TilesetDetail({ data, id }: { data: DatabaseData; id: string }) {
  const tileset = data.tilesets.find((t) => t.fileName === id)
  const usage = useMemo(() => tilesetUsage(data.maps)[id] ?? [], [data.maps, id])
  if (!tileset) return <p className="ed-hint p-4">Pick a tileset on the left.</p>
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4" data-testid="tileset-detail">
      <h2 className="text-ed-title">{tileset.name}</h2>
      <TilesetFacts url={tileset.dataUrl} />
      <section>
        <h3 className="text-ed-label">Used by maps ({usage.length}) <InfoTip>Tilesets are edited where they are today: in the Map Editor’s tileset panel.</InfoTip></h3>
        {usage.length === 0 ? <p className="ed-hint">No map uses this tileset.</p> : <ul>{usage.map((u) => <li key={u.mapFile}>{u.mapName} <span className="ed-hint">{u.layers.join(', ')}</span></li>)}</ul>}
      </section>
    </div>
  )
}

function TilesetFacts({ url }: { url: string }) {
  // The image size is read from the loaded picture; the tile grid is at the project's tile size.
  return (
    <TilesetImage url={url} render={(w, h) => {
      const g = tilesetGrid(w, h)
      return (
        <>
          <p className="ed-hint">{w}×{h} px · {TILE_SIZE}px tiles · {g.columns}×{g.rows} = {g.count} tiles</p>
          <div className="overflow-auto rounded border border-border">
            <div className="relative inline-block" style={{ width: w, height: h }}>
              <img src={url} alt="" width={w} height={h} style={{ imageRendering: 'pixelated' }} />
              <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(to right, rgba(0,0,0,.3) 1px, transparent 1px) 0 0 / ${TILE_SIZE}px ${TILE_SIZE}px, linear-gradient(to bottom, rgba(0,0,0,.3) 1px, transparent 1px) 0 0 / ${TILE_SIZE}px ${TILE_SIZE}px` }} />
            </div>
          </div>
        </>
      )
    }} />
  )
}

import { useEffect, useState, type ReactNode } from 'react'
function TilesetImage({ url, render }: { url: string; render: (w: number, h: number) => ReactNode }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const img = new Image()
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }, [url])
  return size ? <>{render(size.w, size.h)}</> : <p className="ed-hint">Loading…</p>
}
