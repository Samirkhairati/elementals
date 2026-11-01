import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Grid3x3, Upload } from 'lucide-react'
import { sheetFrameRect } from '../../../../../shared/engine/characters'
import { buildGraphicTree, formatBytes, graphicUsage, unusedGraphics, type GraphicTreeNode } from '@/lib/databaseModel'
import { Checkbox, Select } from '../ui/fields'
import { Badge, EdButton, InfoTip, Segmented } from '../ui/controls'
import { ImageThumb, Tile, TileGroups, groupByFolder } from './browse'
import type { DatabaseData } from './useDatabaseData'
import type { TableProps } from './shared'
import { defaultGraphicId } from '@/lib/databaseModel'

function Tree({ node, depth, selected, onSelect, open, toggle, unused, images }: { node: GraphicTreeNode; depth: number; selected: string; onSelect: (id: string) => void; open: Set<string>; toggle: (p: string) => void; unused: Set<string>; images: Record<string, string> }) {
  return (
    <ul role={depth === 0 ? 'tree' : 'group'}>
      {node.children.map((c) =>
        c.kind === 'folder' ? (
          <li key={c.path} role="treeitem" aria-expanded={open.has(c.path)}>
            <button type="button" className="flex w-full items-center gap-1 py-0.5 text-left text-ed-label" style={{ paddingLeft: depth * 12 }} onClick={() => toggle(c.path)}>
              {open.has(c.path) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {c.name}
            </button>
            {open.has(c.path) && <Tree node={c} depth={depth + 1} selected={selected} onSelect={onSelect} open={open} toggle={toggle} unused={unused} images={images} />}
          </li>
        ) : (
          <li key={c.path} role="treeitem" aria-selected={selected === c.path}>
            <button
              type="button"
              data-selected={selected === c.path ? 'true' : undefined}
              className="ed-row flex h-auto w-full items-center gap-2 py-0.5 text-left text-ed-label"
              style={{ paddingLeft: depth * 12 + 16 }}
              onClick={() => onSelect(c.path)}
            >
              <ImageThumb url={images[c.path]} size={24} />
              <span className="truncate">{c.name}</span>
              {unused.has(c.path) && <Badge title="No sprite uses this graphic">unused</Badge>}
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

const folderPaths = (graphics: { id: string }[]): string[] => [...new Set(graphics.flatMap((g) => g.id.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))))]

export function GraphicsBrowser({ data, query, selected, onSelect, mode }: TableProps) {
  const { graphics, characters, images } = data.sprites
  const tree = useMemo(() => buildGraphicTree(graphics, query), [graphics, query])
  const unused = useMemo(() => new Set(unusedGraphics(graphics, characters)), [graphics, characters])
  const [closed, setClosed] = useState<Set<string>>(new Set())
  // folders start open; the user closes the ones they do not need
  const open = useMemo(() => new Set(folderPaths(graphics).filter((p) => !closed.has(p))), [graphics, closed])
  const toggle = (p: string) => setClosed((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })
  if (graphics.length === 0) return <p className="ed-hint p-3">No graphics yet. Import an image to start.</p>
  if (tree.children.length === 0) return <p className="ed-hint p-3">No graphic matches “{query}”.</p>
  if (mode === 'tiles') {
    const q = query.trim().toLowerCase()
    const shown = graphics.filter((g) => !q || g.id.toLowerCase().includes(q)).sort((a, b) => (a.id < b.id ? -1 : 1))
    return (
      <TileGroups groups={groupByFolder(shown, (g) => g.id)}>
        {(g) => <Tile key={g.id} selected={selected === g.id} name={g.id.slice(g.id.lastIndexOf('/') + 1)} title={g.id} hint={unused.has(g.id) ? 'unused' : `${g.width}×${g.height}`} thumb={<ImageThumb url={images[g.id]} size={56} />} onClick={() => onSelect(g.id)} />}
      </TileGroups>
    )
  }
  return <Tree node={tree} depth={0} selected={selected} onSelect={onSelect} open={open} toggle={toggle} unused={unused} images={images} />
}

const ZOOMS = [1, 2, 4, 8] as const

export function GraphicDetail({ data, id }: { data: DatabaseData; id: string }) {
  const { graphics, characters } = data.sprites
  const graphic = graphics.find((g) => g.id === id)
  const usage = useMemo(() => graphicUsage(characters)[id] ?? [], [characters, id])
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(2)
  const [pixelGrid, setPixelGrid] = useState(false)
  const [overlay, setOverlay] = useState('')
  const [copied, setCopied] = useState(false)
  if (!graphic) return <p className="ed-hint p-4">Pick a graphic on the left.</p>

  const url = data.sprites.images[id]
  const overlaySheet = usage.find((u) => `${u.characterId}:${u.sheet}` === overlay)
  const sheetDef = overlaySheet ? characters[overlaySheet.characterId]?.def.sheets[overlaySheet.sheet] : undefined
  const cell = sheetDef ? sheetFrameRect(sheetDef, 0, graphic.width) : null

  const grid: React.CSSProperties = {}
  const layers: string[] = []
  if (pixelGrid && zoom >= 4) layers.push(`linear-gradient(to right, rgba(0,0,0,.25) 1px, transparent 1px) 0 0 / ${zoom}px ${zoom}px`, `linear-gradient(to bottom, rgba(0,0,0,.25) 1px, transparent 1px) 0 0 / ${zoom}px ${zoom}px`)
  if (cell && sheetDef) {
    const w = (sheetDef.frameWidth + sheetDef.spacing) * zoom
    const h = (sheetDef.frameHeight + sheetDef.spacing) * zoom
    const o = sheetDef.margin * zoom
    layers.push(`linear-gradient(to right, rgba(220,38,38,.8) 1px, transparent 1px) ${o}px ${o}px / ${w}px ${h}px`, `linear-gradient(to bottom, rgba(220,38,38,.8) 1px, transparent 1px) ${o}px ${o}px / ${w}px ${h}px`)
  }
  if (layers.length) grid.background = layers.join(', ')

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4" data-testid="graphic-detail">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-ed-title">{id.split('/').pop()}</h2>
        {usage.length === 0 && <Badge>unused</Badge>}
        <span className="ed-hint">{graphic.width}×{graphic.height} px · {formatBytes(graphic.bytes)} · {new Date(graphic.mtimeMs).toLocaleDateString()}</span>
        <button type="button" className="ed-iconbtn" title="Copy the graphic id" aria-label="Copy graphic id" onClick={() => { void navigator.clipboard?.writeText(id); setCopied(true) }}>
          <Copy className="h-3.5 w-3.5" />
        </button>
        <code className="ed-hint">{copied ? 'copied' : id}</code>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={String(zoom)} options={ZOOMS.map((z) => ({ value: String(z), label: `${z}×` }))} onChange={(v) => setZoom(Number(v) as (typeof ZOOMS)[number])} aria-label="Zoom" />
        <Checkbox className="ed-hint" checked={pixelGrid} onChange={setPixelGrid} label="Pixel grid" />
        <label className="ed-hint flex items-center gap-1">
          <Grid3x3 className="h-3.5 w-3.5" /> Overlay a sprite’s cut
          <Select className="w-auto min-w-[140px]" value={overlay} aria-label="Overlay a character's cut" options={[{ value: '', label: 'none' }, ...usage.map((u) => ({ value: `${u.characterId}:${u.sheet}`, label: `${u.characterName} · ${u.sheet}` }))]} onChange={setOverlay} />
          <InfoTip>Draws the frame grid a sprite uses on this image, so you can check how it is cut. It changes nothing.</InfoTip>
        </label>
      </div>
      <div className="overflow-auto rounded border border-border" style={{ background: 'repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 0 0 / 16px 16px' }}>
        <div className="relative inline-block" style={{ width: graphic.width * zoom, height: graphic.height * zoom }}>
          {url ? <img src={url} alt={id} width={graphic.width * zoom} height={graphic.height * zoom} style={{ imageRendering: 'pixelated' }} /> : <span className="ed-hint p-3">Preview unavailable.</span>}
          <div className="pointer-events-none absolute inset-0" style={grid} data-testid="graphic-grid" />
        </div>
      </div>
      <section>
        <h3 className="text-ed-label">Used by ({usage.length})</h3>
        {usage.length === 0 ? <p className="ed-hint">No sprite uses this graphic.</p> : (
          <ul>{usage.map((u) => <li key={`${u.characterId}:${u.sheet}`}>{u.characterName} <span className="ed-hint">{u.characterId} · sheet {u.sheet}</span></li>)}</ul>
        )}
      </section>
      <div className="flex items-center gap-2">
        <EdButton disabled title="Rename, move and delete arrive with the safe-rename flow, which lists every reference it rewrites.">Rename…</EdButton>
        <EdButton disabled title="Rename, move and delete arrive with the safe-rename flow, which lists every reference it rewrites.">Delete</EdButton>
        <InfoTip>Rename, move and delete stay disabled until the reference-rewrite flow can list and fix everything that uses a graphic.</InfoTip>
      </div>
    </div>
  )
}

/** Import form shown above the browser: pick a PNG, choose the graphic id, copy it into project/graphics. */
export function ImportGraphic({ data, onSelect: onImported }: { data: DatabaseData; onSelect: (id: string) => void }) {
  const [source, setSource] = useState<{ path: string; id: string } | null>(null)
  const [error, setError] = useState('')
  const pick = async () => {
    const r = await data.sprites.pickFile()
    if (!r.ok) return setError(r.error)
    if (r.sourcePath) setSource({ path: r.sourcePath, id: defaultGraphicId('imported', `${r.defaultName}.png`)?.replace('sprites/imported/', 'imported/') ?? 'imported/image.png' })
  }
  const submit = async () => {
    if (!source) return
    const r = await data.sprites.importGraphic(source.path, source.id)
    if (!r.ok) return setError(r.error)
    setSource(null)
    setError('')
    onImported(source.id)
  }
  return (
    <div className="flex flex-col gap-1 border-b border-border p-2">
      <EdButton size="sm" onClick={() => void pick()}><Upload /> Import…</EdButton>
      {source && (
        <div className="flex items-center gap-1">
          <input className="ed-input" aria-label="Graphic id" value={source.id} onChange={(e) => setSource({ ...source, id: e.target.value })} />
          <EdButton size="sm" variant="primary" onClick={() => void submit()}>Add</EdButton>
        </div>
      )}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  )
}
