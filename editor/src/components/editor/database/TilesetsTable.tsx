import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { folderOfId, joinId, leafOfId } from '@/lib/assetOps'
import type { LibraryItem } from '@/lib/libraryTree'
import { tilesetGrid } from '@/lib/databaseModel'
import { TILE_SIZE } from '../../../../../shared/engine/constants'
import { Badge, EdButton, Field } from '../ui/controls'
import { ImageThumb } from './browse'
import { ImageViewer } from './ImageViewer'
import { LibraryBrowser, type DragPayload } from './LibraryBrowser'
import { ChangeDialog, DeleteDialog, NameDialog } from './LibraryDialogs'
import { LibraryToolbar } from './LibraryToolbar'
import { ReferencesSection } from './ReferencesSection'
import { FOLDER_NAME, type Outcome } from './graphicActions'
import { folderOfTileset, stemOf, tilesetActions, type TilesetActions } from './tilesetActions'
import type { DatabaseData } from './useDatabaseData'
import type { LibraryControls, TableProps } from './shared'

const FILE_STEM = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

type FolderDialog = { kind: 'new'; parent: string } | { kind: 'change'; folder: string } | { kind: 'delete'; folder: string } | null

export function TilesetsBrowser({ data, query, selected, onSelect, mode, library }: TableProps) {
  const actions = tilesetActions(data)
  const used = data.refs.counts('tileset')
  const items = useMemo<LibraryItem[]>(() => data.tilesets.map((t) => ({ key: t.fileName, name: t.name, folder: folderOfTileset(t) })), [data.tilesets])
  const urlOf = (key: string) => data.tilesets.find((t) => t.fileName === key)?.dataUrl
  const [dialog, setDialog] = useState<FolderDialog>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const move = async (drag: DragPayload, target: string) => {
    if (drag.kind === 'item') {
      const t = data.tilesets.find((x) => x.fileName === drag.key)
      if (!t || folderOfTileset(t) === target) return
      setOutcome(await actions.move(t, target))
    } else {
      if (!actions.canMoveFolder(drag.key, target)) return
      const next = joinId(target, leafOfId(drag.key))
      const r = await actions.moveFolder(drag.key, target)
      setOutcome(r)
      if (r.ok && selected && data.tilesets.find((t) => t.fileName === selected && folderOfTileset(t).startsWith(drag.key))) onSelect(selected)
      void next
    }
  }

  return (
    <>
      {outcome && (outcome.ok ? <p role="status" className="ed-hint px-1 pb-1">{outcome.message}</p> : <p role="alert" className="px-1 pb-1 text-destructive">{outcome.error}</p>)}
      <LibraryBrowser
        items={items}
        folders={actions.folders}
        query={query}
        mode={mode}
        selected={selected}
        onSelect={onSelect}
        thumb={(item, px) => <ImageThumb url={urlOf(item.key)} size={px} />}
        badge={(item) => (used[item.key] ? null : <Badge title="No map paints with this tileset">unused</Badge>)}
        hint={(item) => (used[item.key] ? undefined : 'unused')}
        onMove={(d, t) => void move(d, t)}
        folderActions={{ onCreate: (parent) => setDialog({ kind: 'new', parent }), onRename: (folder) => setDialog({ kind: 'change', folder }), onDelete: (folder) => setDialog({ kind: 'delete', folder }) }}
        emptyText="No tilesets yet. Use Import…, or drop images here."
        library={library}
      />
      {dialog?.kind === 'new' && <NewTilesetFolder parent={dialog.parent} actions={actions} onDone={setOutcome} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'change' && <ChangeTilesetFolder folder={dialog.folder} actions={actions} onDone={setOutcome} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <DeleteTilesetFolder folder={dialog.folder} actions={actions} onDone={setOutcome} onClose={() => setDialog(null)} />}
    </>
  )
}

function NewTilesetFolder({ parent, actions, onDone, onClose }: { parent: string; actions: TilesetActions; onDone: (o: Outcome) => void; onClose: () => void }) {
  return (
    <NameDialog
      open
      title={parent ? `New folder in ${parent}` : 'New folder'}
      description="Folders only organise the library. Maps find a tileset by its file name, so moving one never breaks them."
      label="Folder name"
      confirmLabel="Create"
      validate={(v) => (FOLDER_NAME.test(v) ? (actions.folders.includes(joinId(parent, v)) ? 'That folder already exists.' : '') : 'Use letters, digits, “-” and “_”.')}
      onSubmit={async (v) => { const r = await actions.createFolder(parent, v); onDone(r); return r.error }}
      onClose={onClose}
    />
  )
}

function ChangeTilesetFolder({ folder, actions, onDone, onClose }: { folder: string; actions: TilesetActions; onDone: (o: Outcome) => void; onClose: () => void }) {
  const [name, setName] = useState(leafOfId(folder))
  const next = joinId(folderOfId(folder), name)
  const problem = !FOLDER_NAME.test(name) ? 'Use letters, digits, “-” and “_” in the name.' : next === folder ? '' : actions.folders.includes(next) ? `A folder called “${next}” already exists.` : ''
  return (
    <ChangeDialog
      open
      title={`Rename folder “${folder}”`}
      description="The tilesets inside keep their file names, so no map changes. To move the folder, drag it onto another folder."
      plan={{ ok: !problem && next !== folder, problem, changes: [], references: [], characters: [], maps: [] }}
      confirmLabel="Rename"
      onConfirm={async () => { const r = await actions.changeFolder(folder, next); onDone(r); return r.error }}
      onClose={onClose}
    >
      <Field label="Name" stack><input className="ed-input" aria-label="Folder name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </ChangeDialog>
  )
}

function DeleteTilesetFolder({ folder, actions, onDone, onClose }: { folder: string; actions: TilesetActions; onDone: (o: Outcome) => void; onClose: () => void }) {
  const inside = actions.inFolder(folder)
  return (
    <DeleteDialog
      open
      title="Delete folder?"
      subject={folder}
      description={inside.length ? `The folder and the ${inside.length} unused tileset${inside.length === 1 ? '' : 's'} in it are removed from the project.` : 'The empty folder is removed.'}
      guard={actions.deleteGuard(inside.map((t) => t.fileName))}
      blockedHint="Repaint those maps first, or move the tilesets that are in use somewhere else."
      onConfirm={async () => { const r = await actions.removeFolder(folder); onDone(r); return r.error }}
      onClose={onClose}
    />
  )
}

export function TilesetDetail({ data, id, onSelect }: { data: DatabaseData; id: string; tab?: string; onSelect?: (id: string) => void }) {
  const tileset = data.tilesets.find((t) => t.fileName === id)
  const refs = useMemo(() => data.refs.of({ table: 'tileset', id }), [data.refs, id])
  const loaded = useImageSize(tileset?.width ? undefined : tileset?.dataUrl)
  const size = tileset?.width && tileset.height ? { w: tileset.width, h: tileset.height } : loaded
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const actions = tilesetActions(data)
  if (!tileset) return <p className="ed-hint p-4">Pick a tileset on the left.</p>
  const grid = size ? tilesetGrid(size.w, size.h) : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4" data-testid="tileset-detail">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-ed-title">{tileset.name}</h2>
        {refs.length === 0 && <Badge title="No map paints with this tileset">unused</Badge>}
        {size && grid && <span className="ed-hint">{size.w}×{size.h} px · {TILE_SIZE}px tiles · {grid.columns}×{grid.rows} = {grid.count} tiles</span>}
        <code className="ed-hint">{tileset.fileName}</code>
        <span className="ml-auto flex items-center gap-2">
          <EdButton size="sm" onClick={() => setDialog('edit')}><Pencil /> Rename…</EdButton>
          <EdButton size="sm" variant="danger" onClick={() => setDialog('delete')}><Trash2 /> Delete</EdButton>
        </span>
      </div>
      {outcome && <p role={outcome.ok ? 'status' : 'alert'} className={outcome.ok ? 'ed-hint' : 'text-destructive'}>{outcome.ok ? outcome.message : outcome.error}</p>}

      <div className="flex min-h-[320px] flex-1 flex-col">
        {size ? <ImageViewer key={id} url={tileset.dataUrl} width={size.w} height={size.h} alt={tileset.name} tileSize={TILE_SIZE} /> : <p className="ed-hint">Loading…</p>}
      </div>

      <ReferencesSection title="Used by maps" refs={refs} empty="No map paints with this tileset. It is safe to rename, move or delete." />

      {dialog === 'edit' && <EditTileset tileset={tileset} actions={actions} onDone={(o, next) => { setOutcome(o); if (o.ok) onSelect?.(next) }} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <DeleteDialog
          open
          title="Delete tileset?"
          subject={tileset.name}
          description="The tileset image is removed from the project. This cannot be undone."
          guard={actions.deleteGuard([tileset.fileName])}
          blockedHint="Repaint those layers first, or rename the tileset instead."
          onConfirm={async () => { const r = await actions.remove(tileset); setOutcome(r); if (r.ok) onSelect?.(''); return r.error }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function EditTileset({ tileset, actions, onDone, onClose }: { tileset: DatabaseData['tilesets'][number]; actions: TilesetActions; onDone: (o: Outcome, newId: string) => void; onClose: () => void }) {
  const [typedName, setTypedName] = useState<string | null>(null)
  const [stem, setStem] = useState(stemOf(tileset.fileName))
  // A tileset without a name of its own is shown by its file name, so its name follows the file name until edited.
  const derived = tileset.name === stemOf(tileset.fileName)
  const name = typedName ?? (derived && FILE_STEM.test(stem) ? stem : tileset.name)
  const edit = { name, stem, folder: folderOfTileset(tileset) }
  const plan = FILE_STEM.test(stem) ? actions.plan(tileset, edit) : { ok: false, problem: 'Use letters, digits, “-” and “_” in the file name.', changes: [], references: [], characters: [], maps: [] }
  return (
    <ChangeDialog
      open
      title={`Rename “${tileset.name}”`}
      description="Maps paint with a tileset by its file name. Changing it rewrites every tile painted from it, in every map. To move it, drag it onto a folder in the list."
      plan={plan}
      confirmLabel="Save & update"
      onConfirm={async () => { const r = await actions.edit(tileset, edit); onDone(r, `${stem}.png`); return r.error }}
      onClose={onClose}
    >
      <Field label="Name" stack info="The name shown in the editor."><input className="ed-input" aria-label="Tileset name" value={name} onChange={(e) => setTypedName(e.target.value)} /></Field>
      <Field label="File name" stack info="The id maps use. Change it only if you want the file renamed; the maps are updated for you."><input className="ed-input" aria-label="Tileset file name" value={stem} onChange={(e) => setStem(e.target.value)} /></Field>
    </ChangeDialog>
  )
}

function useImageSize(url?: string): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    setSize(null)
    if (!url) return
    const img = new Image()
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }, [url])
  return size
}

/** Toolbar above the list: import tilesets (several at once), make a folder. */
export function TilesetsToolbar({ data, library }: { data: DatabaseData; onSelect: (id: string) => void; library?: LibraryControls }) {
  const actions = tilesetActions(data)
  return (
    <LibraryToolbar
      library={library}
      info="Import copies PNGs into the project: pick several, drag them from your computer onto the list or onto a folder, or paste a copied picture or screenshot (Ctrl/Cmd+V). Each one gets a naming step first. They go into the folder you clicked last. The map editor lists what you add here and lets you pick it."
      newFolder={(onClose, parent) => <NewTilesetFolder parent={parent} actions={actions} onDone={() => undefined} onClose={onClose} />}
    />
  )
}
