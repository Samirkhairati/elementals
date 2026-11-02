import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Copy, FolderPlus, Pencil, Trash2, Upload } from 'lucide-react'
import { canMoveFolder, folderOfId, graphicDeleteGuard, joinId, leafOfId } from '@/lib/assetOps'
import { formatBytes, defaultGraphicId } from '@/lib/databaseModel'
import { graphicUsage } from '@/lib/databaseModel'
import type { LibraryItem } from '@/lib/libraryTree'
import { Select } from '../ui/fields'
import { Badge, EdButton, Field, InfoTip } from '../ui/controls'
import { ImageThumb } from './browse'
import { ImageViewer, type SheetCut } from './ImageViewer'
import { LibraryBrowser, type DragPayload } from './LibraryBrowser'
import { ChangeDialog, DeleteDialog, NameDialog } from './LibraryDialogs'
import { ReferencesSection } from './ReferencesSection'
import { FOLDER_NAME, graphicActions, type Outcome } from './graphicActions'
import type { DatabaseData } from './useDatabaseData'
import type { TableProps } from './shared'

const TOP = '(top level)'
const folderOptions = (folders: string[], exclude?: string) => [{ value: TOP, label: 'Top level' }, ...folders.filter((f) => !exclude || canMoveFolder(exclude, f) || f === folderOfId(exclude)).map((f) => ({ value: f }))]
const toFolder = (v: string): string => (v === TOP ? '' : v)

/** A line that says what the last action did (or why it failed). */
function StatusLine({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null
  return outcome.ok ? <p role="status" className="ed-hint px-1 pb-1">{outcome.message}</p> : <p role="alert" className="px-1 pb-1 text-destructive">{outcome.error}</p>
}

type FolderDialog = { kind: 'new'; parent: string } | { kind: 'change'; folder: string } | { kind: 'delete'; folder: string } | null

export function GraphicsBrowser({ data, query, selected, onSelect, mode }: TableProps) {
  const { graphics, images } = data.sprites
  const actions = graphicActions(data)
  const used = data.refs.counts('graphic')
  const items = useMemo<LibraryItem[]>(() => graphics.map((g) => ({ key: g.id, name: leafOfId(g.id), folder: folderOfId(g.id) })), [graphics])
  const [dialog, setDialog] = useState<FolderDialog>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const size = (key: string) => graphics.find((g) => g.id === key)

  const move = async (drag: DragPayload, target: string) => {
    if (drag.kind === 'item') {
      if (folderOfId(drag.key) === target) return
      const r = await actions.rename(drag.key, joinId(target, leafOfId(drag.key)))
      setOutcome(r)
      if (r.ok && selected === drag.key) onSelect(joinId(target, leafOfId(drag.key)))
    } else {
      const next = joinId(target, leafOfId(drag.key))
      if (next === drag.key) return
      const r = await actions.changeFolder(drag.key, next)
      setOutcome(r)
      if (r.ok && selected.startsWith(`${drag.key}/`)) onSelect(joinId(next, selected.slice(drag.key.length + 1)))
    }
  }

  return (
    <>
      <StatusLine outcome={outcome} />
      <LibraryBrowser
        items={items}
        folders={actions.folders}
        query={query}
        mode={mode}
        selected={selected}
        onSelect={onSelect}
        thumb={(item, px) => <ImageThumb url={images[item.key]} size={px} />}
        badge={(item) => (used[item.key] ? null : <Badge title="No sprite or map uses this picture">unused</Badge>)}
        hint={(item) => (used[item.key] ? `${size(item.key)?.width}×${size(item.key)?.height}` : 'unused')}
        onMove={(d, t) => void move(d, t)}
        folderActions={{ onCreate: (parent) => setDialog({ kind: 'new', parent }), onRename: (folder) => setDialog({ kind: 'change', folder }), onDelete: (folder) => setDialog({ kind: 'delete', folder }) }}
        emptyText="No pictures yet. Import an image to start."
      />
      {dialog?.kind === 'new' && <NewFolder parent={dialog.parent} actions={actions} onDone={setOutcome} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'change' && <ChangeFolder folder={dialog.folder} actions={actions} onDone={(o, next) => { setOutcome(o); if (o.ok && selected.startsWith(`${dialog.folder}/`)) onSelect(joinId(next, selected.slice(dialog.folder.length + 1))) }} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <DeleteFolder folder={dialog.folder} data={data} actions={actions} onDone={setOutcome} onClose={() => setDialog(null)} />}
    </>
  )
}

function NewFolder({ parent, actions, onDone, onClose }: { parent: string; actions: ReturnType<typeof graphicActions>; onDone: (o: Outcome) => void; onClose: () => void }) {
  return (
    <NameDialog
      open
      title={parent ? `New folder in ${parent}` : 'New folder'}
      description="Folders only organise the library; pictures inside keep working."
      label="Folder name"
      confirmLabel="Create"
      validate={(v) => (FOLDER_NAME.test(v) ? (actions.folders.includes(joinId(parent, v)) ? 'That folder already exists.' : '') : 'Use letters, digits, “-” and “_”.')}
      onSubmit={async (v) => { const r = await actions.createFolder(parent, v); onDone(r); return r.error }}
      onClose={onClose}
    />
  )
}

function ChangeFolder({ folder, actions, onDone, onClose }: { folder: string; actions: ReturnType<typeof graphicActions>; onDone: (o: Outcome, newPath: string) => void; onClose: () => void }) {
  const [name, setName] = useState(leafOfId(folder))
  const [parent, setParent] = useState(folderOfId(folder) || TOP)
  const next = joinId(toFolder(parent), name)
  const valid = FOLDER_NAME.test(name)
  const plan = next === folder ? { ...actions.plan([]), ok: false } : valid ? (actions.folders.includes(next) && next !== folder ? { ...actions.planFolder(folder, next), ok: false, problem: `A folder called “${next}” already exists.` } : actions.planFolder(folder, next)) : { ...actions.plan([]), ok: false, problem: 'Use letters, digits, “-” and “_” in the name.' }
  return (
    <ChangeDialog
      open
      title={`Rename or move folder “${folder}”`}
      description="Every picture inside gets a new id. Sprites and maps that use them are updated for you."
      plan={plan}
      confirmLabel="Rename & update"
      onConfirm={async () => { const r = await actions.changeFolder(folder, next); onDone(r, next); return r.error }}
      onClose={onClose}
    >
      <Field label="Name" stack><input className="ed-input" aria-label="Folder name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Inside" stack><Select aria-label="Inside folder" value={parent} options={folderOptions(actions.folders, folder)} onChange={setParent} /></Field>
    </ChangeDialog>
  )
}

function DeleteFolder({ folder, data, actions, onDone, onClose }: { folder: string; data: DatabaseData; actions: ReturnType<typeof graphicActions>; onDone: (o: Outcome) => void; onClose: () => void }) {
  const inside = data.sprites.graphics.map((g) => g.id).filter((id) => id.startsWith(`${folder}/`))
  const guard = graphicDeleteGuard(data.refs, inside)
  return (
    <DeleteDialog
      open
      title={`Delete folder “${folder}”?`}
      description={inside.length ? `The folder and the ${inside.length} unused picture${inside.length === 1 ? '' : 's'} in it are removed from the project.` : 'The empty folder is removed.'}
      guard={guard}
      blockedHint="Change those first, or move the pictures that are in use somewhere else."
      onConfirm={async () => { const r = await actions.removeFolder(folder); onDone(r); return r.error }}
      onClose={onClose}
    />
  )
}

export function GraphicDetail({ data, id, onSelect }: { data: DatabaseData; id: string; tab?: string; onSelect?: (id: string) => void }) {
  const { graphics, characters, images } = data.sprites
  const graphic = graphics.find((g) => g.id === id)
  const usage = useMemo(() => graphicUsage(characters)[id] ?? [], [characters, id])
  const refs = useMemo(() => data.refs.of({ table: 'graphic', id }), [data.refs, id])
  // The maps that show a sprite which is cut from this picture: a second hop, so "where does this end up?" has an answer.
  const reach = useMemo(() => usage.flatMap((u) => data.refs.of({ table: 'character', id: u.characterId }).filter((r) => r.source.table === 'map')), [usage, data.refs])
  const [copied, setCopied] = useState(false)
  const [dialog, setDialog] = useState<'change' | 'delete' | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const actions = graphicActions(data)
  if (!graphic) return <p className="ed-hint p-4">Pick a picture on the left.</p>

  const cuts: SheetCut[] = usage.flatMap((u) => {
    const sheet = characters[u.characterId]?.def.sheets[u.sheet]
    return sheet ? [{ key: `${u.characterId}:${u.sheet}`, label: `${u.characterName} · ${u.sheet}`, sheet }] : []
  })
  const unused = refs.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4" data-testid="graphic-detail">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-ed-title">{leafOfId(id)}</h2>
        {unused && <Badge title="No sprite or map uses this picture">unused</Badge>}
        <span className="ed-hint">{graphic.width}×{graphic.height} px · {formatBytes(graphic.bytes)} · {new Date(graphic.mtimeMs).toLocaleDateString()}</span>
        <button type="button" className="ed-iconbtn" title="Copy the graphic id" aria-label="Copy graphic id" onClick={() => { void navigator.clipboard?.writeText(id); setCopied(true) }}>
          <Copy className="h-3.5 w-3.5" />
        </button>
        <code className="ed-hint">{copied ? 'copied' : id}</code>
        <span className="ml-auto flex items-center gap-2">
          <EdButton size="sm" onClick={() => setDialog('change')}><Pencil /> Rename / move…</EdButton>
          <EdButton size="sm" variant="danger" onClick={() => setDialog('delete')}><Trash2 /> Delete</EdButton>
        </span>
      </div>
      {outcome && <p role={outcome.ok ? 'status' : 'alert'} className={outcome.ok ? 'ed-hint' : 'text-destructive'}>{outcome.ok ? outcome.message : outcome.error}</p>}

      <div className="flex min-h-[320px] flex-1 flex-col">
        <ImageViewer
          key={id}
          url={images[id]}
          width={graphic.width}
          height={graphic.height}
          alt={id}
          cuts={cuts}
          editCut={(cut) => (
            <> <Link to="/database" search={{ table: 'characters', id: cut.key.split(':')[0], tab: 'sheets' } as never} className="underline">Edit this cut</Link></>
          )}
        />
      </div>

      <ReferencesSection refs={refs} empty="Nothing uses this picture. It is safe to rename, move or delete." />
      {reach.length > 0 && <ReferencesSection title="Ends up in" refs={reach} empty="" />}

      {dialog === 'change' && <ChangeGraphic id={id} data={data} actions={actions} onDone={(o, next) => { setOutcome(o); if (o.ok) onSelect?.(next) }} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <DeleteDialog
          open
          title={`Delete “${id}”?`}
          description="The picture file is removed from the project. This cannot be undone."
          guard={actions.deleteGuard([id])}
          blockedHint="Change those first, or rename it instead."
          onConfirm={async () => { const r = await actions.remove(id); setOutcome(r); if (r.ok) onSelect?.(''); return r.error }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function ChangeGraphic({ id, data, actions, onDone, onClose }: { id: string; data: DatabaseData; actions: ReturnType<typeof graphicActions>; onDone: (o: Outcome, newId: string) => void; onClose: () => void }) {
  void data
  const [name, setName] = useState(leafOfId(id).replace(/\.png$/i, ''))
  const [folder, setFolder] = useState(folderOfId(id) || TOP)
  const next = joinId(toFolder(folder), `${name}.png`)
  // Nothing typed yet: the button stays off without scolding.
  const plan = next === id ? { ...actions.plan([]), ok: false } : actions.plan([{ from: id, to: next }])
  return (
    <ChangeDialog
      open
      title={`Rename or move “${id}”`}
      description="Sprites and maps that use this picture are updated for you."
      plan={plan}
      confirmLabel="Rename & update"
      onConfirm={async () => { const r = await actions.rename(id, next); onDone(r, next); return r.error }}
      onClose={onClose}
    >
      <Field label="Name" stack><input className="ed-input" aria-label="Picture name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Folder" stack><Select aria-label="Folder" value={folder} options={folderOptions(actions.folders)} onChange={setFolder} /></Field>
      <p className="ed-hint">New id: <code>{next}</code></p>
    </ChangeDialog>
  )
}

/** Toolbar above the list: import a picture, make a folder. */
export function GraphicsToolbar({ data, onSelect: onImported }: { data: DatabaseData; onSelect: (id: string) => void }) {
  const [source, setSource] = useState<{ path: string; id: string } | null>(null)
  const [error, setError] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const actions = graphicActions(data)
  const pick = async () => {
    const r = await data.sprites.pickFile()
    if (!r.ok) return setError(r.error)
    if (r.sourcePath) setSource({ path: r.sourcePath, id: defaultGraphicId('imported', `${r.defaultName}.png`)?.replace('sprites/imported/', 'imported/') ?? 'imported/image.png' })
  }
  const submit = async () => {
    if (!source) return
    const r = await data.sprites.importGraphic(source.path, source.id)
    if (!r.ok) return setError(r.error)
    const id = source.id
    setSource(null)
    setError('')
    await data.reload()
    onImported(id)
  }
  return (
    <div className="flex flex-col gap-1 border-b border-border p-2">
      <div className="flex items-center gap-1">
        <EdButton size="sm" onClick={() => void pick()}><Upload /> Import…</EdButton>
        <EdButton size="sm" onClick={() => setFolderOpen(true)}><FolderPlus /> New folder…</EdButton>
        <InfoTip>Import copies a PNG into the project. Put it in a folder by typing the folder in its id (folder/name.png); rename and rearrange afterwards from here and every sprite and map follows.</InfoTip>
      </div>
      {source && (
        <div className="flex items-center gap-1">
          <input className="ed-input" aria-label="Graphic id" value={source.id} onChange={(e) => setSource({ ...source, id: e.target.value })} />
          <EdButton size="sm" variant="primary" onClick={() => void submit()}>Add</EdButton>
        </div>
      )}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {folderOpen && <NewFolder parent="" actions={actions} onDone={() => undefined} onClose={() => setFolderOpen(false)} />}
    </div>
  )
}
