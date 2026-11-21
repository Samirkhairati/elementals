// The prefab dialogs of the Scene panel: Save as Prefab (a Node and everything inside it, named; saving under the name of
// an existing prefab, or from a node placed from one, updates that prefab) and Prefabs (the project's prefabs: place,
// rename, delete). Opened from anywhere through `openPrefabDialog`; `PrefabDialogs` is mounted once by the Scene panel.

import { useState, useSyncExternalStore } from 'react'
import { Pencil, Sparkles, Stamp, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NODE_TYPES, walk, type SceneNode } from '../../../../../shared/sceneTree'
import { prefabFromNode, prefabId, type NodePrefab } from '../../../../../shared/prefabs'
import { deletePrefab, renamePrefab, savePrefab, usePrefabLibrary } from '@/lib/prefabLibrary'
import { sceneIndex } from '@/lib/sceneIndex'
import { IconButton } from '../ui/controls'
import { InlineConfirm } from '../ui/InlineConfirm'
import { RenameInput } from '../ui/RenameInput'
import { NamedIcon } from '../ui/icons'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'

type DialogState = { mode: 'save'; nodeId: string } | { mode: 'manage'; parentId: string | null } | null

let dialog: DialogState = null
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Opens Save as Prefab for a node, or the prefab list (placing goes into `parentId`). */
export function openPrefabDialog(next: DialogState): void {
  dialog = next
  for (const l of listeners) l()
}

const select = (c: EditorContextValue) => ({ nodes: c.activeMap?.nodes, editNode: c.editNode, startPlacement: c.startPlacement })

/** The prefab a name would replace: the one with that name (any case), else none. */
export function prefabNamed(prefabs: readonly NodePrefab[], name: string): NodePrefab | undefined {
  const key = name.trim().toLowerCase()
  return prefabs.find((p) => p.name.trim().toLowerCase() === key)
}

function SavePrefab({ node, onClose }: { node: SceneNode; onClose: () => void }) {
  const ctx = useEditorSelector(select)
  const lib = usePrefabLibrary()
  const linked = 'prefab' in node && typeof node.prefab === 'string' ? lib.file.prefabs.find((p) => p.id === node.prefab) : undefined
  const [name, setName] = useState(linked?.name ?? node.name)
  const existing = prefabNamed(lib.file.prefabs, name)
  const count = walk([node]).length

  const save = () => {
    const clean = name.trim()
    if (!clean) return
    const id = existing?.id ?? prefabId(clean, lib.file.prefabs.map((p) => p.id))
    savePrefab(prefabFromNode(node, id, clean, { description: existing?.description, icon: existing?.icon ?? 'package' }))
    ctx.editNode(node.id, { prefab: id })
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <DialogHeader>
        <DialogTitle>Save as Prefab</DialogTitle>
        <DialogDescription>
          {NODE_TYPES[node.type].label} &quot;{node.name}&quot;{count > 1 ? ` and the ${count - 1} node${count === 2 ? '' : 's'} inside it` : ''}, with its anchor as the prefab&apos;s origin.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5 py-3">
        <label className="ed-label" htmlFor="prefab-name">
          Prefab name
        </label>
        <Input id="prefab-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} />
        {existing ? (
          <p className="text-ed-label text-amber-400" data-testid="prefab-replaces">
            Replaces the prefab &quot;{existing.name}&quot;: nodes placed from it before keep what they have.
          </p>
        ) : (
          <p className="text-ed-label text-muted-foreground">A new prefab: right-click a Node › Add Child Node › Prefab (or the map › Node › Prefab) to place it.</p>
        )}
      </div>
      <DialogFooter className="gap-2 sm:space-x-0">
        <button type="button" onClick={onClose} className="ed-btn">
          Cancel
        </button>
        <button type="submit" className="ed-btn" data-variant="primary" data-dialog-confirm disabled={!name.trim()}>
          {existing ? 'Update prefab' : 'Save prefab'}
        </button>
      </DialogFooter>
    </form>
  )
}

function ManagePrefabs({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const ctx = useEditorSelector(select)
  const lib = usePrefabLibrary()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  return (
    <>
      <DialogHeader>
        <DialogTitle>Prefabs</DialogTitle>
        <DialogDescription>Saved node trees of this project. Save a Node as a prefab from its right-click menu; saving it under the same name updates the prefab.</DialogDescription>
      </DialogHeader>
      <div className="flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto py-2" data-testid="prefab-list">
        {lib.file.prefabs.length === 0 && <div className="ed-empty">No prefabs yet</div>}
        {lib.file.prefabs.map((p) => (
          <div key={p.id} className="flex flex-col">
            <div className="ed-row group gap-2 px-1">
              <NamedIcon name={p.icon ?? 'package'} className="text-muted-foreground" />
              {renaming === p.id ? (
                <RenameInput initial={p.name} label="Prefab name" onRename={(name) => renamePrefab(p.id, name)} onClose={() => setRenaming(null)} />
              ) : (
                <span className="ed-row-label" title={p.description ?? p.name} onDoubleClick={() => setRenaming(p.id)}>
                  {p.name}
                </span>
              )}
              <span className="ed-badge" title="Nodes in it">
                {walk([p.node]).length}
              </span>
              <IconButton
                aria-label={`Place ${p.name}`}
                title="Place it: click the map where its anchor goes"
                onClick={() => {
                  ctx.startPlacement({ name: p.name, prefab: p, parentId })
                  onClose()
                }}
              >
                <Stamp />
              </IconButton>
              <IconButton aria-label={`Rename ${p.name}`} title="Rename" onClick={() => setRenaming(p.id)}>
                <Pencil />
              </IconButton>
              <IconButton aria-label={`Delete ${p.name}`} title="Delete" onClick={() => setDeleting(p.id)}>
                <Trash2 />
              </IconButton>
            </div>
            {deleting === p.id && (
              <InlineConfirm
                label={`Delete ${p.name}?`}
                confirmLabel="Delete prefab"
                onConfirm={() => {
                  deletePrefab(p.id)
                  setDeleting(null)
                }}
                onCancel={() => setDeleting(null)}
                className="mx-1 mb-1"
              >
                Delete the prefab &quot;{p.name}&quot;? Nodes already placed from it stay on their maps.
              </InlineConfirm>
            )}
          </div>
        ))}
      </div>
      <DialogFooter>
        <button type="button" onClick={onClose} className="ed-btn" data-dialog-confirm>
          <Sparkles /> Done
        </button>
      </DialogFooter>
    </>
  )
}

export function PrefabDialogs() {
  const state = useSyncExternalStore(subscribe, () => dialog)
  const ctx = useEditorSelector(select)
  const close = () => openPrefabDialog(null)
  const node = state?.mode === 'save' && ctx.nodes ? sceneIndex(ctx.nodes).byId.get(state.nodeId)?.node : undefined
  const open = state?.mode === 'manage' || !!node
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        {state?.mode === 'manage' ? <ManagePrefabs parentId={state.parentId} onClose={close} /> : node ? <SavePrefab key={node.id} node={node} onClose={close} /> : null}
      </DialogContent>
    </Dialog>
  )
}
