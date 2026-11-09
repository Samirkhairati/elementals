// "Import N pictures": every picked or dropped file with a small preview and the name it will be filed under
// (the file name by default, editable), plus where it goes. Used by the Graphics and Tilesets libraries.

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { joinDirs } from '@/lib/assetOps'
import { checkRowNames } from '@/lib/importNames'
import { EdButton } from '../ui/controls'
import { ImageThumb } from './browse'
import { defaultRowNames, type Candidate, type ImportResult, type Importer } from './importFlow'

interface Props {
  candidates: Candidate[]
  importer: Importer
  /** Where the pictures go to begin with ('' = the top level). */
  folder: string
  onClose: () => void
  /** Called with what was imported once the dialog is done (it closes itself). */
  onImported: (result: ImportResult, folder: string) => void
}

export function ImportDialog(props: Props) {
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-xl" aria-describedby="import-dialog-desc">
        <ImportBody {...props} />
      </DialogContent>
    </Dialog>
  )
}

function ImportBody({ candidates, importer, folder: startFolder, onClose, onImported }: Props) {
  const { noun } = importer
  const [rows, setRows] = useState(() => {
    const names = defaultRowNames(candidates, noun, (dir) => importer.taken(joinDirs(startFolder, dir)), importer.flat)
    return candidates.map((c, i) => ({ c, name: names[i] }))
  })
  const [folder, setFolder] = useState(startFolder)
  const [busy, setBusy] = useState(false)
  const [failures, setFailures] = useState<Record<string, string>>({})

  // Files that came out of an imported folder keep its structure below the destination, so what is taken is per folder.
  const problems = useMemo(
    () => checkRowNames(rows.map((r) => ({ dir: r.c.dir ?? '', name: r.name })), (dir) => importer.taken(joinDirs(folder, dir)), importer.flat),
    [rows, importer, folder]
  )
  const nested = rows.filter((r) => r.c.dir).length
  const blocked = rows.length === 0 || problems.some(Boolean) || busy
  const plural = rows.length === 1 ? noun : `${noun}s`
  const folders = ['', ...importer.folders]

  const submit = async () => {
    setBusy(true)
    const result = await importer.run(rows.map((r) => ({ path: r.c.path, dir: r.c.dir ?? '', name: r.name })), folder)
    setBusy(false)
    if (result.failed.length === 0) {
      onImported(result, folder)
      onClose()
      return
    }
    // Keep only the rows that did not go in, each with what went wrong.
    const failed = new Map(result.failed.map((f) => [f.path, f.error]))
    setFailures(Object.fromEntries(rows.filter((r) => failed.has(r.c.path)).map((r) => [r.c.key, failed.get(r.c.path) ?? ''])))
    setRows((cur) => cur.filter((r) => failed.has(r.c.path)))
    if (result.imported.length > 0) onImported(result, folder)
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!blocked) void submit() }} className="flex flex-col gap-3">
      <DialogHeader className="text-left">
        <DialogTitle>Import {rows.length} {plural}</DialogTitle>
        <DialogDescription id="import-dialog-desc" className="ed-hint">
          Each one is filed under the name next to its preview. The file name is used by default; change it if you like.{nested > 0 && ' Pictures from a folder keep their folders under the destination.'}
        </DialogDescription>
      </DialogHeader>

      <label className="flex items-center gap-2 text-ed-label">
        <span className="shrink-0 text-muted-foreground">Into</span>
        <select className="ed-input flex-1" aria-label="Destination folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
          {folders.map((f) => <option key={f} value={f}>{f || '(top level)'}</option>)}
        </select>
      </label>

      <ul className="flex max-h-[45vh] flex-col gap-1.5 overflow-y-auto pr-1" aria-label={`${noun}s to import`}>
        {rows.map((r, i) => {
          const error = failures[r.c.key] || problems[i]
          return (
            <li key={r.c.key} className="flex items-center gap-3 rounded-md border border-border bg-card/30 p-1.5">
              <ImageThumb url={r.c.preview} size={48} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  {r.c.dir && <span className="ed-hint max-w-[40%] shrink-0 truncate" title={r.c.dir}>{r.c.dir}/</span>}
                  <input
                    className="ed-input"
                    aria-label={`Name for ${r.c.fileName}`}
                    aria-invalid={error ? true : undefined}
                    value={r.name}
                    onChange={(e) => { const name = e.target.value; setRows((cur) => cur.map((x) => (x.c.key === r.c.key ? { ...x, name } : x))); setFailures((f) => ({ ...f, [r.c.key]: '' })) }}
                  />
                  <span className="ed-hint shrink-0">.png</span>
                </div>
                {error ? <p role="alert" className="text-destructive">{error}</p> : <p className="ed-hint truncate" title={r.c.fileName}>from {r.c.fileName}</p>}
              </div>
              <button type="button" className="ed-iconbtn shrink-0" title="Leave this one out" aria-label={`Leave out ${r.c.fileName}`} onClick={() => setRows((cur) => cur.filter((x) => x.c.key !== r.c.key))}><X /></button>
            </li>
          )
        })}
        {rows.length === 0 && <li className="ed-hint p-2">Nothing left to import.</li>}
      </ul>

      <div className="flex justify-end gap-2">
        <EdButton type="button" onClick={onClose}>Cancel</EdButton>
        <EdButton type="submit" variant="primary" data-dialog-confirm disabled={blocked}>{busy ? 'Importing…' : `Import ${rows.length} ${plural}`}</EdButton>
      </div>
    </form>
  )
}
