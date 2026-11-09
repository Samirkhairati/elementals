// "Replace picture": put another image in the place of a library picture. The id stays, so every sprite cut, crop and
// map that uses it now shows the new image. The new one is pasted (Ctrl/Cmd+V), dropped in, or chosen with the picker.

import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, FolderOpen } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { clipboardHasFiles, pastedPngs } from '@/lib/droppedFiles'
import { EdButton, InfoTip } from '../ui/controls'
import { ConfirmFooter } from '../dialogs/ConfirmParts'
import { ImageThumb } from './browse'
import { acceptable, dropCandidates, looseFiles, pickCandidates, type Candidate, type ImageKind } from './importFlow'

interface Props {
  id: string
  current: { url: string | undefined; width: number; height: number }
  /** Copies the picked file over the picture; resolves with an error message, or '' when it worked. */
  onReplace: (sourcePath: string) => Promise<string>
  onClose: () => void
}

/** What changes in size, or '' when nothing does (or the new size is not known yet). */
export function sizeNote(current: { width: number; height: number }, next: { width: number; height: number } | null): string {
  if (!next || (next.width === current.width && next.height === current.height)) return ''
  return `The new picture is ${next.width}×${next.height} px, the current one ${current.width}×${current.height} px. Sprite cuts and crops that use it keep their pixel positions, so check them afterwards.`
}

export function ReplaceGraphicDialog(props: Props) {
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-xl" aria-describedby="replace-dialog-desc">
        <ReplaceBody {...props} />
      </DialogContent>
    </Dialog>
  )
}

function ReplaceBody({ id, current, onReplace, onClose }: Props) {
  const [picked, setPicked] = useState<Candidate | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  // A GIF is replaced by a GIF, a PNG by a PNG (the id keeps its extension).
  const kind: ImageKind = /\.gif$/i.test(id) ? 'gif' : 'png'
  const pickedRef = useRef(picked)
  pickedRef.current = picked

  const take = async (files: File[], pasted = false) => {
    const r = await dropCandidates(looseFiles(files.slice(0, 1)), { pasted, accept: [kind] })
    if (!r.ok) return setError(r.error)
    setError('')
    setSize(null)
    setPicked(r.candidates[0])
  }

  // Ctrl/Cmd+V anywhere in the dialog.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!clipboardHasFiles(e.clipboardData)) return
      e.preventDefault()
      void pastedPngs(e.clipboardData).then((files) => { if (files.length > 0) void take(files, true) })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // The new picture's size, read from the picture itself.
  useEffect(() => {
    if (!picked?.preview) return
    let live = true
    const img = new Image()
    img.onload = () => live && setSize({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = picked.preview
    return () => { live = false }
  }, [picked])

  const choose = async () => {
    const r = await pickCandidates()
    if (r.ok) {
      const kept = acceptable(r.candidates, [kind])
      if (kept.candidates.length === 0) return setError(`Choose a ${kind.toUpperCase()} image: this picture is a ${kind.toUpperCase()}.`)
      setError(''); setSize(null); setPicked(kept.candidates[0])
    } else if (!r.canceled) setError(r.error)
  }

  const submit = async () => {
    if (!picked || busy) return
    setBusy(true)
    const failure = await onReplace(picked.path)
    setBusy(false)
    if (failure) setError(failure)
    else onClose()
  }

  // A GIF's size is its frames' size, the current one is its whole sheet: they are not comparable.
  const note = kind === 'gif' ? '' : sizeNote(current, size)

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className="flex items-center gap-1.5">
          Replace picture
          <InfoTip>The picture keeps its id, so every sprite cut, crop and map that uses it shows the new image. Paste one with Ctrl/Cmd+V, drop a PNG on the box, or choose a file.</InfoTip>
        </DialogTitle>
        <code className="block truncate rounded-md border border-border bg-muted/40 px-2 py-1 text-ed-label" title={id}>{id}</code>
        <DialogDescription id="replace-dialog-desc" className="sr-only">Choose the image that takes the place of {id}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <figure className="flex flex-col items-center gap-1.5">
          <ImageThumb url={current.url} size={160} />
          <figcaption className="ed-hint">Now · {current.width}×{current.height} px</figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-1.5">
          <div
            data-testid="replace-drop"
            data-over={over ? 'true' : undefined}
            className="flex h-40 w-40 items-center justify-center rounded-sm border border-dashed border-border text-center data-[over=true]:border-primary data-[over=true]:bg-primary/10"
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void take(Array.from(e.dataTransfer.files)) }}
          >
            {picked ? (
              <ImageThumb url={picked.preview} size={158} />
            ) : (
              <span className="ed-hint flex flex-col items-center gap-1 px-3"><ClipboardPaste className="h-5 w-5" />Paste or drop a PNG</span>
            )}
          </div>
          <figcaption className="ed-hint">{picked ? `New · ${size ? `${size.width}×${size.height} px` : picked.fileName}` : 'New'}</figcaption>
        </figure>
      </div>

      <div className="flex justify-center"><EdButton size="sm" onClick={() => void choose()}><FolderOpen /> Choose file…</EdButton></div>
      {note && <p role="status" className="text-ed-label text-[hsl(var(--solid))]">{note}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}

      <ConfirmFooter tone="primary" onCancel={onClose} onConfirm={() => void submit()} confirmLabel={busy ? 'Replacing…' : 'Replace'} disabled={!picked || busy} />
    </>
  )
}
