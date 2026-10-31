// Sprites panel: asset browser (folders, search, grid / list, usage counts) + editor for the selected asset.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Folder, ImagePlus, LayoutGrid, List, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Badge, EdButton, IconButton } from '../ui/controls'
import { SpriteThumb } from './SpriteThumb'
import { SpriteEditor } from './SpriteEditor'
import { ImportSpriteDialog } from './ImportSpriteDialog'
import { countSpriteUsage } from './usage'
import { groupAssets, splitAssetId } from '../inspector/SpritePicker'

const selectPanel = (c: EditorContextValue) => ({
  spriteList: c.spriteList,
  spriteAssets: c.spriteAssets,
  spriteWarnings: c.spriteWarnings,
  reloadSprites: c.reloadSprites,
  maps: c.maps,
  activeMap: c.activeMap,
  entities: c.entities,
})

const KIND_TONE: Record<string, 'move' | 'event' | undefined> = { character: 'move', animated: 'event', object: undefined }

type ViewMode = 'grid' | 'list'

function AssetItem({ asset, mode, selected, usage, onSelect }: { asset: SpriteAssetInfo; mode: ViewMode; selected: boolean; usage: number; onSelect: () => void }) {
  const name = asset.meta.name || splitAssetId(asset.id).leaf
  if (mode === 'list') {
    return (
      <button type="button" className="ed-row" data-selected={selected ? 'true' : undefined} onClick={onSelect} title={asset.id} aria-label={`Sprite ${asset.id}`}>
        <SpriteThumb asset={asset} size={20} />
        <span className="ed-row-label text-left">{name}</span>
        <span className="ed-row-actions">
          <Badge tone={KIND_TONE[asset.meta.kind]}>{asset.meta.kind}</Badge>
          <Badge tone={usage === 0 ? 'warn' : undefined} title="Entities using it">
            {usage}
          </Badge>
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      title={asset.id}
      aria-label={`Sprite ${asset.id}`}
      data-selected={selected ? 'true' : undefined}
      className="relative flex flex-col items-center gap-1 rounded-md border border-border bg-card/40 p-2 hover:bg-muted data-[selected=true]:border-primary data-[selected=true]:bg-primary/15"
    >
      <div className="ed-checker flex h-14 w-full items-center justify-center rounded-sm">
        <SpriteThumb asset={asset} size={48} />
      </div>
      <div className="w-full truncate text-center text-ed-label text-foreground">{name}</div>
      <div className="flex items-center gap-1">
        <Badge tone={KIND_TONE[asset.meta.kind]}>{asset.meta.kind}</Badge>
        <Badge tone={usage === 0 ? 'warn' : undefined} title="Entities using it">
          {usage}
        </Badge>
      </div>
    </button>
  )
}

export function SpritesPanel() {
  const ctx = useEditorSelector(selectPanel)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<ViewMode>('grid')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWide(el.getBoundingClientRect().width >= 560))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const usage = useMemo(
    () =>
      countSpriteUsage(
        ctx.maps,
        ctx.activeMap ? { fileName: ctx.activeMap.fileName, folderPath: ctx.activeMap.folderPath, entities: ctx.entities } : null,
      ),
    [ctx.maps, ctx.activeMap, ctx.entities],
  )
  const groups = useMemo(() => groupAssets(ctx.spriteList, query), [ctx.spriteList, query])
  const selected = selectedId ? ctx.spriteAssets[selectedId] : undefined

  // Selection that no longer exists (deleted / renamed elsewhere) is dropped.
  useEffect(() => {
    if (selectedId && !ctx.spriteAssets[selectedId]) setSelectedId(null)
  }, [selectedId, ctx.spriteAssets])

  const toggleFolder = (folder: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })

  const browser = (
    <div className="flex min-h-0 min-w-0 flex-col gap-2 p-2" data-testid="sprite-browser">
      <div className="flex items-center gap-1">
        <div className="ed-input-wrap flex-1">
          <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
          <input className="ed-input pl-7" placeholder="Search…" aria-label="Search sprites" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <IconButton title="Grid view" aria-label="Grid view" active={mode === 'grid'} onClick={() => setMode('grid')}>
          <LayoutGrid />
        </IconButton>
        <IconButton title="List view" aria-label="List view" active={mode === 'list'} onClick={() => setMode('list')}>
          <List />
        </IconButton>
        <IconButton title="Reload from disk" aria-label="Reload sprites" onClick={() => void ctx.reloadSprites()}>
          <RefreshCw />
        </IconButton>
      </div>
      <EdButton variant="primary" onClick={() => setImportOpen(true)}>
        <ImagePlus />
        Import sprite…
      </EdButton>

      {ctx.spriteWarnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-ed-label text-warning" role="status">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{ctx.spriteWarnings.length} sprite folder{ctx.spriteWarnings.length === 1 ? ' is' : 's are'} invalid and skipped: {ctx.spriteWarnings.map((w) => w.file).join(', ')}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {ctx.spriteList.length === 0 && (
          <div className="ed-empty py-8">
            <p>No sprites yet.</p>
            <p className="ed-hint">Import a PNG sheet to get started.</p>
          </div>
        )}
        {ctx.spriteList.length > 0 && groups.length === 0 && <div className="ed-empty py-8">No sprite matches “{query}”.</div>}
        {groups.map((g) => {
          const folderKey = g.folder || '(root)'
          const open = !collapsed.has(folderKey)
          return (
            <section key={folderKey} className="flex flex-col gap-1">
              <button type="button" className="ed-row" onClick={() => toggleFolder(folderKey)} aria-expanded={open}>
                {open ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
                {open ? <FolderOpen className="text-amber-400" /> : <Folder className="text-amber-400" />}
                <span className="ed-row-label text-left font-medium">{g.folder || 'sprites'}</span>
                <span className="ed-badge">{g.items.length}</span>
              </button>
              {open && (
                <div className={mode === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2' : 'ed-indent flex flex-col gap-0.5'}>
                  {g.items.map((a) => (
                    <AssetItem key={a.id} asset={a} mode={mode} selected={a.id === selectedId} usage={usage[a.id] ?? 0} onSelect={() => setSelectedId(a.id)} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )

  const editor = selected ? (
    <SpriteEditor key={selected.id} asset={selected} usage={usage[selected.id] ?? 0} onIdChanged={(id) => setSelectedId(id)} />
  ) : (
    <div className="ed-empty">
      <p>Select a sprite to edit it.</p>
      <p className="ed-hint">Frames, pivot, character settings and animations are edited here.</p>
    </div>
  )

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full bg-sidebar text-ed-body" data-testid="sprites-panel">
      {wide ? (
        <>
          <div className="flex w-[260px] shrink-0 flex-col border-r border-sidebar-border">{browser}</div>
          <div className="min-w-0 flex-1 overflow-y-auto">{editor}</div>
        </>
      ) : selected ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="p-2 pb-0">
            <EdButton size="sm" onClick={() => setSelectedId(null)}>
              <ChevronRight className="rotate-180" />
              All sprites
            </EdButton>
          </div>
          {editor}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{browser}</div>
      )}
      <ImportSpriteDialog open={importOpen} onOpenChange={setImportOpen} onImported={(id) => setSelectedId(id)} />
    </div>
  )
}
