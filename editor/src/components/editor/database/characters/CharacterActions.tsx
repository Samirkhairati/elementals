import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { applyCharacterRename, deleteGuard, planCharacterRename } from '@/lib/renameFlow'
import { groupReferences } from '@/lib/referenceIndex'
import { EdButton, TextField } from '../../ui/controls'
import type { DatabaseData } from '../useDatabaseData'

const summarize = (refs: { source: { table: string; mapName?: string } }[]): string => {
  const maps = new Set(refs.filter((r) => r.source.table === 'map').map((r) => r.source.mapName))
  const prefabs = refs.filter((r) => r.source.table === 'prefab').length
  return `${refs.length} reference${refs.length === 1 ? '' : 's'} in ${maps.size} map${maps.size === 1 ? '' : 's'}${prefabs ? `, ${prefabs} prefab${prefabs === 1 ? '' : 's'}` : ''}`
}

interface Props {
  data: DatabaseData
  id: string
  mode: 'rename' | 'delete' | null
  onClose: () => void
  onDone: (newId: string | null) => void
}

/** Rename-with-rewrite and delete-with-guard dialogs (spec §11.4). */
export function CharacterActions({ data, id, mode, onClose, onDone }: Props) {
  const [to, setTo] = useState(id)
  const [error, setError] = useState('')
  const taken = useMemo(() => new Set(Object.keys(data.sprites.characters)), [data.sprites.characters])
  const plan = useMemo(() => planCharacterRename(data.refs, data.maps, taken, id, to), [data.refs, data.maps, taken, id, to])
  const guard = useMemo(() => deleteGuard(data.refs, id), [data.refs, id])

  const rename = async () => {
    const result = await applyCharacterRename(plan, id, to, {
      renameCharacter: (a, b) => data.sprites.rename(a, b),
      saveMap: async (m) => {
        const r = await window.electronAPI?.saveMap(m.folderPath, m.fileName, m)
        return r?.success ? { ok: true as const } : { ok: false as const, error: r?.error ?? 'not saved' }
      },
    })
    await data.reload()
    if (!result.ok) return setError(result.error)
    onDone(to)
  }
  const remove = async () => {
    const r = await data.sprites.remove(id)
    if (!r.ok) return setError(r.error)
    await data.reload()
    onDone(null)
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby="character-action-desc">
        {mode === 'rename' ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>Rename “{id}”</DialogTitle>
              <DialogDescription id="character-action-desc">Maps and events refer to a sprite by id. Renaming updates every place it is used.</DialogDescription>
            </DialogHeader>
            <TextField aria-label="New id" value={to} onCommit={setTo} />
            {plan.problem && <p role="alert" className="text-destructive">{plan.problem}</p>}
            {!plan.problem && (
              <div data-testid="rename-preview" className="text-ed-label">
                <p>{summarize(plan.references)}; {plan.maps.length} map file{plan.maps.length === 1 ? '' : 's'} will be rewritten.</p>
                {plan.unrewritable.length > 0 && <p className="ed-hint">{plan.unrewritable.length} prefab default{plan.unrewritable.length === 1 ? ' is' : 's are'} defined in code and keep the old id.</p>}
                <ul className="max-h-40 overflow-auto">{groupReferences(plan.references).flatMap((g) => g.entities.flatMap((e) => e.refs.map((r, i) => <li key={`${g.map}${e.entity}${i}`}>{r.label}</li>)))}</ul>
              </div>
            )}
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <div className="flex justify-end gap-2"><EdButton onClick={onClose}>Cancel</EdButton><EdButton variant="primary" disabled={!plan.ok} onClick={() => void rename()}>Rewrite &amp; rename</EdButton></div>
          </>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>Delete “{id}”?</DialogTitle>
              <DialogDescription id="character-action-desc">{guard.allowed ? 'Nothing uses this sprite. The record is removed; its graphics stay in the library.' : 'Something still uses this sprite, so it cannot be deleted.'}</DialogDescription>
            </DialogHeader>
            {!guard.allowed && (
              <div data-testid="delete-blocked" className="text-ed-label">
                <p>{summarize(guard.references)}:</p>
                <ul className="max-h-40 overflow-auto">{guard.references.map((r, i) => <li key={i}>{r.label}</li>)}</ul>
                <p className="ed-hint">Change those first, or rename the sprite instead.</p>
              </div>
            )}
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <div className="flex justify-end gap-2"><EdButton onClick={onClose}>Cancel</EdButton><EdButton variant="danger" disabled={!guard.allowed} onClick={() => void remove()}>Delete</EdButton></div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
