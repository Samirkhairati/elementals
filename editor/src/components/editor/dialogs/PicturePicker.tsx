import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderOpen, ImagePlus, Loader2, Search, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { GraphicInfo } from '../../../../../shared/engine/graphics'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import type { ImagePick } from '@/lib/graphicAssets'
import { pastedPngs } from '@/lib/droppedFiles'
import { inFolder, pictureFolderTree, type PictureFolder } from '@/lib/pictureTree'
import { InfoTip, Segmented } from '../ui/controls'
import { GraphicThumb, Tile, TileGroups, groupByFolder } from '../database/browse'
import { groupAssets, splitAssetId } from '../inspector/SpritePicker'
import { SpriteThumb } from '../sprites/SpriteThumb'

export type PictureTab = 'graphics' | 'sprites' | 'new'

const TAB_LABELS: Record<PictureTab, string> = { graphics: 'Pictures', sprites: 'Sprites', new: 'New' }

/** What adding new pictures from the picker gives back: what to pick, or why it failed. */
export type PictureImport = (files: File[]) => Promise<{ ok: true; picks: ImagePick[] } | { ok: false; error: string }>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which kinds can be picked, in tab order (pictures first by default). A New tab is added when `onImport` is set. */
  tabs?: PictureTab[]
  title?: string
  sprites?: SpriteAssetInfo[]
  graphics?: GraphicInfo[]
  /** data: URL of every graphic by id. */
  images?: Record<string, string>
  /** Highlighted entry. */
  value?: ImagePick
  onPick: (pick: ImagePick) => void
  /** Adds pictures (uploaded, dropped or pasted) to the library; the first one is then picked. */
  onImport?: PictureImport
  /** The library folder `onImport` files them in, shown on the New tab. */
  importTo?: string
  /** Extra content under the grid (an import form, for example). */
  footer?: React.ReactNode
}

/** Graphics matching `query` (id), sorted, grouped by folder. */
export function groupGraphics(graphics: readonly GraphicInfo[], query: string): { folder: string; items: GraphicInfo[] }[] {
  const q = query.trim().toLowerCase()
  const shown = graphics.filter((g) => !q || g.id.toLowerCase().includes(q)).sort((a, b) => (a.id < b.id ? -1 : 1))
  return groupByFolder(shown, (g) => g.id)
}

/**
 * One browser for everything that can be drawn: plain pictures from the graphics library, sprites (people, objects,
 * animated props) and, where the caller can add them, new pictures (uploaded, dropped or pasted). Pictures and sprites
 * are browsed as tiles beside their folder tree, with search. Used wherever the editor asks "which picture?".
 */
export function PicturePicker({ open, onOpenChange, tabs = ['graphics', 'sprites'], title = 'Choose a picture', sprites = [], graphics = [], images = {}, value, onPick, onImport, importTo, footer }: Props) {
  const allTabs = useMemo(() => (onImport && !tabs.includes('new') ? [...tabs, 'new' as const] : tabs), [tabs, onImport])
  const [tab, setTab] = useState<PictureTab>(allTabs[0])
  const [query, setQuery] = useState('')
  const [folders, setFolders] = useState<Partial<Record<PictureTab, string>>>({})
  const current = allTabs.includes(tab) ? tab : allTabs[0]
  const folder = folders[current] ?? ''
  const setFolder = (path: string) => setFolders((f) => ({ ...f, [current]: path }))

  const tree = useMemo(
    () => (current === 'sprites' ? pictureFolderTree(sprites.map((s) => s.id)) : current === 'graphics' ? pictureFolderTree(graphics.map((g) => g.id)) : null),
    [current, sprites, graphics]
  )
  const spriteGroups = useMemo(() => groupAssets(sprites.filter((s) => inFolder(s.id, folder)), query), [sprites, query, folder])
  const graphicGroups = useMemo(() => groupGraphics(graphics.filter((g) => inFolder(g.id, folder)), query), [graphics, query, folder])
  const counts: Record<PictureTab, number> = { sprites: sprites.length, graphics: graphics.length, new: 0 }

  const pick = (p: ImagePick) => {
    onPick(p)
    onOpenChange(false)
  }

  // ── New pictures: uploaded, dropped (on any tab) or pasted ──────────────────────────────────────
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const addFiles = async (files: File[]) => {
    if (!onImport || busy) return
    if (files.length === 0) return setError('That is not a picture.')
    setTab('new')
    setBusy(true)
    setError('')
    try {
      const r = await onImport(files)
      if (!r.ok) setError(r.error || 'Could not add the picture.')
      else if (r.picks[0]) pick(r.picks[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const addFilesRef = useRef(addFiles)
  addFilesRef.current = addFiles

  // Ctrl/Cmd+V on the New tab adds the picture on the clipboard.
  useEffect(() => {
    if (!open || current !== 'new' || !onImport) return
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'file') return
      e.preventDefault()
      void pastedPngs(e.clipboardData).then((files) => addFilesRef.current(files))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open, current, onImport])

  useEffect(() => {
    if (!open) {
      setError('')
      setDragging(false)
    }
  }, [open])

  const dropProps = onImport
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
          e.preventDefault()
          setDragging(true)
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        },
        onDrop: (e: React.DragEvent) => {
          if (!e.dataTransfer?.files?.length) return
          e.preventDefault()
          setDragging(false)
          void pastedPngs(e.dataTransfer).then((files) => addFiles(files))
        },
      }
    : {}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col gap-0 overflow-hidden p-0" aria-describedby="picture-picker-desc">
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="text-ed-title">{title}</DialogTitle>
          <DialogDescription id="picture-picker-desc" className="ed-hint">
            {allTabs.filter((t) => t !== 'new').map((t) => `${counts[t]} ${TAB_LABELS[t].toLowerCase()}`).join(' · ')} in this project
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          {allTabs.length > 1 && (
            <Segmented<PictureTab>
              aria-label="Kind of picture"
              value={current}
              options={allTabs.map((t) => ({ value: t, label: t === 'new' ? TAB_LABELS.new : `${TAB_LABELS[t]} · ${counts[t]}` }))}
              onChange={(t) => { setTab(t); setError('') }}
            />
          )}
          {current !== 'new' && (
            <div className="ed-input-wrap flex-1">
              <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
              <input autoFocus className="ed-input pl-7" placeholder={`Search ${TAB_LABELS[current].toLowerCase()}…`} aria-label="Search pictures" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
        </div>

        <div className="relative flex min-h-0 flex-1" {...dropProps}>
          {dragging && current !== 'new' && (
            <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10 text-ed-label">
              Drop to add it{importTo ? ` to ${importTo}` : ''}
            </div>
          )}
          {tree && tree.folders.length > 0 && (
            <nav className="w-52 shrink-0 overflow-y-auto border-r border-border p-2" aria-label="Folders" data-testid="picture-folders">
              <FolderTree node={tree} selected={folder} onSelect={setFolder} depth={0} />
            </nav>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {current === 'sprites' && (
              <>
                {spriteGroups.length === 0 && <div className="ed-empty py-8">{sprites.length === 0 ? 'No sprites in the project yet.' : query ? `No sprite matches “${query}”.` : 'No sprites in this folder.'}</div>}
                <TileGroups groups={spriteGroups}>
                  {(a) => <Tile key={a.id} selected={value?.assetId === a.id} name={a.meta.name || splitAssetId(a.id).leaf} title={a.id} hint={a.meta.kind} thumb={<div className="ed-checker flex h-14 w-14 items-center justify-center rounded-sm"><SpriteThumb asset={a} size={56} /></div>} onClick={() => pick({ assetId: a.id })} />}
                </TileGroups>
              </>
            )}
            {current === 'graphics' && (
              <>
                {graphicGroups.length === 0 && (
                  <div className="ed-empty py-8">
                    {graphics.length === 0 ? (onImport ? 'No pictures yet. Add one on the New tab.' : 'No pictures yet. Import one in Database › Graphics.') : query ? `No picture matches “${query}”.` : 'No pictures in this folder.'}
                  </div>
                )}
                <TileGroups groups={graphicGroups}>
                  {(g) => <Tile key={g.id} selected={value?.graphicId === g.id} name={g.id.slice(g.id.lastIndexOf('/') + 1).replace(/\.(png|gif)$/i, '')} title={g.id} hint={g.gif ? `GIF · ${g.gif.frames} fr` : `${g.width}×${g.height}`} thumb={<GraphicThumb graphic={g} url={images[g.id]} size={56} />} onClick={() => pick({ graphicId: g.id })} />}
                </TileGroups>
              </>
            )}
            {current === 'new' && (
              <div
                data-testid="new-picture-drop"
                data-dragging={dragging ? 'true' : undefined}
                className="flex h-full min-h-60 flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-border p-6 text-center data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/10"
              >
                {busy ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <ImagePlus className="h-8 w-8 text-muted-foreground" />}
                <div className="flex items-center gap-1 text-ed-body">
                  {busy ? 'Adding…' : 'Drop a picture here, or paste one (Ctrl/Cmd+V)'}
                  <InfoTip>
                    The picture is added to the graphics library{importTo ? ` in ${importTo}` : ''} and you place it on the map straight away. Move or rename it later in Database › Graphics: the maps that use it follow.
                  </InfoTip>
                </div>
                <button type="button" className="ed-btn" data-variant="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
                  <Upload />
                  Choose file…
                </button>
                {importTo && <span className="ed-badge" title="Where new pictures are saved">{importTo}</span>}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/gif,image/jpeg,image/webp,image/bmp"
                  multiple
                  hidden
                  aria-label="Choose picture files"
                  onChange={(e) => {
                    const files = Array.from(e.currentTarget.files ?? [])
                    e.currentTarget.value = ''
                    void pastedPngs({ files, items: [] } as unknown as DataTransfer).then((pngs) => addFiles(pngs))
                  }}
                />
                {error && <p role="alert" className="text-ed-label text-red-400">{error}</p>}
              </div>
            )}
          </div>
        </div>
        {footer && <div className="border-t border-border px-4 py-2">{footer}</div>}
      </DialogContent>
    </Dialog>
  )
}

/** The folder tree beside the tiles: click a folder to see what is in it (and below it). */
function FolderTree({ node, selected, onSelect, depth }: { node: PictureFolder; selected: string; onSelect: (path: string) => void; depth: number }) {
  const [open, setOpen] = useState(depth === 0 || selected.startsWith(`${node.path}/`) || selected === node.path)
  const isRoot = node.path === ''
  return (
    <div className="flex flex-col gap-0.5">
      <div
        role="treeitem"
        aria-selected={selected === node.path}
        aria-expanded={node.folders.length > 0 ? open : undefined}
        className="ed-row cursor-pointer"
        style={{ paddingLeft: 4 + depth * 12 }}
        data-selected={selected === node.path ? 'true' : undefined}
        title={isRoot ? 'Everything' : node.path}
        onClick={() => onSelect(node.path)}
        onDoubleClick={() => setOpen((o) => !o)}
      >
        {node.folders.length > 0 ? (
          <button type="button" className="ed-iconbtn" aria-label={open ? `Close ${node.name}` : `Open ${node.name}`} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
            {open ? <ChevronDown /> : <ChevronRight />}
          </button>
        ) : (
          <span className="inline-block w-6 shrink-0" />
        )}
        {open && node.folders.length > 0 ? <FolderOpen className="text-yellow-400" /> : <FolderIcon className="text-yellow-400" />}
        <span className="ed-row-label">{node.name}</span>
        <span className="ed-badge" data-tone="count">{node.count}</span>
      </div>
      {open && node.folders.map((f) => <FolderTree key={f.path} node={f} selected={selected} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  )
}
