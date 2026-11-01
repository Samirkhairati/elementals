import { useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Bug, Grid3x3, Image, Lock, Map as MapIcon, MessageSquareText, Package, PersonStanding, Search, ToggleLeft, Zap, type LucideIcon } from 'lucide-react'
import { DATABASE_TABLES, GROUP_LABELS, characterCounts, getTable, unusedGraphics, type DatabaseTable, type TableGroup } from '@/lib/databaseModel'
import { Badge, InfoTip } from '../ui/controls'
import { useDatabaseData, type DatabaseData } from './useDatabaseData'
import { CharacterDetail, CharactersBrowser, CharactersToolbar } from './CharactersTable'
import { ViewToggle, useViewMode } from './browse'
import { FlagsTable } from './FlagsTable'
import { GraphicDetail, GraphicsBrowser, ImportGraphic } from './GraphicsTable'
import { MapDetail, MapsBrowser } from './MapsTable'
import { TilesetDetail, TilesetsBrowser } from './TilesetsTable'
import type { TableProps } from './shared'

const ICONS: Record<string, LucideIcon> = { Image, Grid3x3, PersonStanding, ToggleLeft, Map: MapIcon, MessageSquareText, Bug, Package, Zap }

export interface DatabaseSearch {
  table?: string
  id?: string
  tab?: string
}

interface TableView {
  Browser: React.ComponentType<TableProps>
  Detail: React.ComponentType<{ data: DatabaseData; id: string; tab?: string; onSelect?: (id: string) => void }>
  /** Extra controls above the browser. */
  Toolbar?: React.ComponentType<{ data: DatabaseData; onSelect: (id: string) => void }>
  /** The browser can show tiles with pictures as well as a list. */
  tiles?: boolean
  /** The table uses the whole content area (no browser/detail split). */
  full?: React.ComponentType<{ data: DatabaseData }>
}

/** Table id -> its components. A new table = one entry here and one in DATABASE_TABLES. */
const VIEWS: Record<string, TableView> = {
  graphics: { Browser: GraphicsBrowser, Detail: GraphicDetail, Toolbar: ImportGraphic, tiles: true },
  tilesets: { Browser: TilesetsBrowser, Detail: TilesetDetail, tiles: true },
  characters: { Browser: CharactersBrowser, Detail: CharacterDetail, Toolbar: CharactersToolbar, tiles: true },
  maps: { Browser: MapsBrowser, Detail: MapDetail },
  flags: { Browser: () => null, Detail: () => null, full: FlagsTable },
}

function counterFor(table: DatabaseTable, data: DatabaseData): { label: string; tone?: 'warn' } | null {
  const { characters, graphics } = data.sprites
  switch (table.id) {
    case 'graphics': return { label: String(graphics.length) }
    case 'tilesets': return { label: String(data.tilesets.length) }
    case 'maps': return { label: String(data.maps.length) }
    case 'characters': {
      const counts = Object.values(characterCounts(characters, graphics))
      const errors = counts.reduce((n, c) => n + c.errors, 0)
      const warnings = counts.reduce((n, c) => n + c.warnings, 0)
      return errors > 0 ? { label: `${errors} ✕`, tone: 'warn' } : warnings > 0 ? { label: `${warnings} !` } : { label: String(counts.length) }
    }
    default: return null
  }
}

export function DatabasePage() {
  const data = useDatabaseData()
  const search = useSearch({ strict: false }) as DatabaseSearch
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useViewMode(search.table ?? 'characters')
  const table = getTable(search.table) ?? getTable('characters')!
  const view = VIEWS[table.id]
  const selected = search.id ?? ''
  const go = (next: DatabaseSearch) => void navigate({ to: '/database', search: next as never })

  const groups = useMemo(() => {
    const map = new Map<TableGroup, DatabaseTable[]>()
    for (const t of DATABASE_TABLES) if (t.status !== 'planned') map.set(t.group, [...(map.get(t.group) ?? []), t])
    return [...map.entries()]
  }, [])
  const planned = DATABASE_TABLES.filter((t) => t.status === 'planned')

  const row = (t: DatabaseTable) => {
    const Icon = ICONS[t.icon] ?? Image
    const counter = counterFor(t, data)
    const isPlanned = t.status === 'planned'
    return (
      <li key={t.id}>
        <button
          type="button"
          disabled={isPlanned}
          title={isPlanned ? t.info : undefined}
          data-selected={t.id === table.id ? 'true' : undefined}
          className="ed-row flex w-full items-center gap-2.5 text-left disabled:opacity-50"
          onClick={() => { setQuery(''); go({ table: t.id }) }}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">{t.label}</span>
          {t.access === 'readonly' && !isPlanned && <Lock className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Read-only" />}
          {counter && (counter.tone ? <Badge tone={counter.tone}>{counter.label}</Badge> : <span className="ed-mono min-w-[1.5ch] text-right text-ed-label text-muted-foreground">{counter.label}</span>)}
        </button>
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full bg-sidebar" data-testid="database-page">
      <nav aria-label="Database tables" className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-sidebar-border px-2 py-3">
        <h1 className="px-2 text-ed-title">Database</h1>
        {data.sprites.error && <p role="alert" className="px-2 text-destructive">{data.sprites.error}</p>}
        {groups.map(([group, tables]) => (
          <div key={group}>
            <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">{GROUP_LABELS[group]}</div>
            <ul className="flex flex-col gap-0.5">{tables.map(row)}</ul>
          </div>
        ))}
        {planned.length > 0 && (
          <div className="mt-auto">
            <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">Planned</div>
            <ul className="flex flex-col gap-0.5">{planned.map(row)}</ul>
          </div>
        )}
      </nav>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={table.label}>
        <header className="flex h-toolbar shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
          <h2 className="text-ed-title">{table.label}</h2>
          {table.access === 'readonly' && <Badge title={table.info}><Lock className="mr-1 inline h-3 w-3" />Read-only</Badge>}
          <InfoTip>{table.info}</InfoTip>
          {!view.full && (
            <div className="relative ml-auto flex items-center">
              <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
              <input className="ed-input pl-7" placeholder={`Search ${table.label.toLowerCase()}…`} aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
        </header>
        {view.full ? (
          <div className="min-h-0 flex-1"><view.full data={data} /></div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border">
              {view.Toolbar && <view.Toolbar data={data} onSelect={(id) => go({ table: table.id, id })} />}
              {view.tiles && (
                <div className="flex items-center justify-between px-2 pt-2">
                  <span className="ed-hint">Show as</span>
                  <ViewToggle mode={mode} onChange={setMode} />
                </div>
              )}
              <div className="p-2"><view.Browser data={data} query={query} selected={selected} mode={view.tiles ? mode : 'list'} onSelect={(id) => go({ table: table.id, id })} /></div>
            </div>
            <div className="min-h-0 min-w-0 flex-1"><view.Detail data={data} id={selected} tab={search.tab} onSelect={(id) => go({ table: table.id, id })} /></div>
          </div>
        )}
      </section>
    </div>
  )
}

// kept for the tests that render single tables
export { unusedGraphics }
