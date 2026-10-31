// Import flow for a new sprite sheet: choose a PNG -> kind, name/id and frame size with a LIVE grid on the
// sheet and the computed columns x rows -> import.
//
// The file picker only returns a path, so to show the real pixels the dialog imports the file once as a
// throw-away draft (straight through electronAPI, so it never shows up in the editor's sprite list) and
// removes it again when the dialog closes; the real asset is created by `importSprite` on "Import".

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileImage, Loader2, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { EdButton, Field, NumberField, Segmented, TextField } from '../ui/controls'
import { SheetViewer, SheetZoomControls, useSheetZoom } from './SheetViewer'
import { fileBaseName, isFileDrag, pathOfDroppedFile, pngFilesOf } from '@/lib/droppedFiles'
import { checkSheetDimensions, defaultSpriteMeta, sheetGrid } from '../../../../../shared/engine/sprites'
import type { SpriteKind } from '../../../../../shared/engine/types'

export const SPRITE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i

export function slugifySpriteName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sprite'
  )
}

/** Default id for a new sprite: inside `folder` when the import was started from one, else characters/ or objects/. */
export function defaultSpriteId(kind: SpriteKind, name: string, folder = ''): string {
  const base = folder || (kind === 'character' ? 'characters' : 'objects')
  return `${base}/${slugifySpriteName(name)}`
}

const KIND_OPTIONS = [
  { value: 'character' as const, label: 'Character', title: '4 directions x walk frames (and optional run)' },
  { value: 'object' as const, label: 'Object', title: 'A static image or a few frames' },
  { value: 'animated' as const, label: 'Animated', title: 'Frames with named animations' },
]

const selectImport = (c: EditorContextValue) => ({
  pickSpriteFile: c.pickSpriteFile,
  importSprite: c.importSprite,
  spriteAssets: c.spriteAssets,
})

interface Draft {
  id: string
  url: string
  width: number
  height: number
}

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('The image could not be decoded'))
    img.src = url
  })
}

interface ImportSpriteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the new asset id after a successful import. */
  onImported?: (assetId: string) => void
  /** Folder (sprite id path, '' = root) the new asset goes into by default. */
  folder?: string
  /** A PNG that is already chosen (e.g. dropped onto the Assets panel): loaded as soon as the dialog opens. */
  initialSource?: { path: string; name: string } | null
}

export function ImportSpriteDialog({ open, onOpenChange, onImported, folder = '', initialSource = null }: ImportSpriteDialogProps) {
  const ctx = useEditorSelector(selectImport)
  const [source, setSource] = useState<{ path: string; name: string } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [kind, setKind] = useState<SpriteKind>('object')
  const [name, setName] = useState('')
  const [idOverride, setIdOverride] = useState<string | null>(null)
  const [frameW, setFrameW] = useState(32)
  const [frameH, setFrameH] = useState(32)
  const [busy, setBusy] = useState<'picking' | 'importing' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const draftRef = useRef<Draft | null>(null)

  const dropDraft = useCallback(async () => {
    const d = draftRef.current
    draftRef.current = null
    if (d) await window.electronAPI?.deleteSprite(d.id).catch(() => undefined)
  }, [])

  const reset = useCallback(() => {
    setSource(null)
    setDraft(null)
    setName('')
    setIdOverride(null)
    setKind('object')
    setError(null)
    setBusy(null)
  }, [])

  // Closing (by any route) removes the draft.
  useEffect(() => {
    if (!open) {
      void dropDraft()
      reset()
    }
  }, [open, dropDraft, reset])
  useEffect(() => () => void dropDraft(), [dropDraft])

  const applyKindDefaults = (k: SpriteKind, d: Draft | null) => {
    if (!d) return
    const meta = defaultSpriteMeta(k, { sheetWidth: d.width, sheetHeight: d.height })
    setFrameW(meta.frameWidth)
    setFrameH(meta.frameHeight)
  }

  /** Import `sourcePath` once as a throw-away draft so the real pixels can be shown. */
  const loadSource = async (sourcePath: string, defaultName: string) => {
    await dropDraft()
    const draftId = `import-preview-${Math.random().toString(36).slice(2, 8)}`
    try {
      const res = await window.electronAPI.importSprite(sourcePath, { id: draftId, name: defaultName, kind: 'object' })
      if (!res.success) throw new Error(res.error)
      const url = Object.values(res.asset.sheets)[0]
      if (!url) throw new Error('The imported sheet has no image')
      const size = await loadImageSize(url)
      const d: Draft = { id: res.asset.id, url, width: size.width, height: size.height }
      draftRef.current = d
      setDraft(d)
      setSource({ path: sourcePath, name: defaultName })
      setName(defaultName)
      setIdOverride(null)
      applyKindDefaults(kind, d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
  }

  const choose = async () => {
    setError(null)
    setBusy('picking')
    const picked = await ctx.pickSpriteFile()
    if (!picked.ok) {
      setBusy(null)
      setError(picked.error)
      return
    }
    if (!picked.sourcePath) {
      setBusy(null) // cancelled
      return
    }
    await loadSource(picked.sourcePath, picked.defaultName)
  }

  // A file handed in by the opener (drag and drop) is loaded once per opening.
  const initialKey = open && initialSource ? initialSource.path : null
  useEffect(() => {
    if (!initialKey || !initialSource) return
    setError(null)
    setBusy('picking')
    void loadSource(initialSource.path, initialSource.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  const dropFile = async (e: React.DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return
    e.preventDefault()
    const file = pngFilesOf(e.dataTransfer)[0]
    if (!file) {
      setError('Only PNG sheets can be imported')
      return
    }
    setError(null)
    setBusy('picking')
    try {
      await loadSource(await pathOfDroppedFile(file), fileBaseName(file))
    } catch (err) {
      setBusy(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const changeKind = (k: SpriteKind) => {
    setKind(k)
    applyKindDefaults(k, draft)
  }

  const id = idOverride ?? defaultSpriteId(kind, name, folder)
  const idError = !SPRITE_ID_PATTERN.test(id)
    ? 'Use letters, digits, - and _, separated by /'
    : ctx.spriteAssets[id]
      ? `"${id}" already exists`
      : null

  const preview = useMemo(() => {
    if (!draft) return null
    const meta = { ...defaultSpriteMeta(kind, { sheetWidth: draft.width, sheetHeight: draft.height, name }), frameWidth: Math.max(1, frameW), frameHeight: Math.max(1, frameH) }
    const grid = sheetGrid(meta, draft.width, draft.height)
    const warnings = checkSheetDimensions(meta, Object.fromEntries([[meta.character?.sheets.walk ?? meta.sheet ?? 'sheet.png', { width: draft.width, height: draft.height }]]))
    return { meta, grid, warnings }
  }, [draft, kind, name, frameW, frameH])

  const sheetZoom = useSheetZoom(draft ? Math.max(1, Math.min(6, Math.floor(480 / Math.max(draft.width, 1)))) : 1)
  const canImport = !!source && !!draft && !idError && frameW >= 1 && frameH >= 1 && busy === null && !!preview && preview.grid.count > 0

  const doImport = async () => {
    if (!source || !draft) return
    setBusy('importing')
    setError(null)
    await dropDraft()
    const res = await ctx.importSprite(source.path, { id, name: name.trim() || source.name, kind, frameWidth: frameW, frameHeight: frameH })
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onImported?.(res.asset.id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        aria-describedby="import-sprite-desc"
        onDragOver={(e) => isFileDrag(e.dataTransfer) && e.preventDefault()}
        onDrop={dropFile}
      >
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="text-ed-title">Import sprite</DialogTitle>
          <DialogDescription id="import-sprite-desc" className="ed-hint">
            Choose a PNG sheet, tell the editor how it is cut into frames and check the grid before importing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
          <div className="flex w-[240px] shrink-0 flex-col gap-2 overflow-y-auto">
            <EdButton onClick={choose} disabled={busy !== null} variant={source ? 'default' : 'primary'}>
              {busy === 'picking' ? <Loader2 className="animate-spin" /> : <FileImage />}
              {source ? 'Choose another PNG…' : 'Choose PNG…'}
            </EdButton>
            {source && <div className="ed-hint truncate" title={source.path}>{source.name}.png · {draft?.width}×{draft?.height}px</div>}

            {draft && (
              <>
                <div className="ed-section-title mt-2">Kind</div>
                <Segmented value={kind} options={KIND_OPTIONS} onChange={changeKind} aria-label="Sprite kind" className="w-full" />
                <div className="ed-hint">
                  {kind === 'character' && 'Rows: down, left, right, up. Frames per row = columns.'}
                  {kind === 'object' && 'A single image (or a sheet you pick frames from).'}
                  {kind === 'animated' && 'A strip of frames; an "idle" loop is created for you.'}
                </div>

                <div className="ed-section-title mt-2">Name</div>
                <Field label="Name" stack>
                  <TextField value={name} onCommit={setName} aria-label="Sprite name" />
                </Field>
                <Field label="Asset id" stack>
                  <TextField value={id} onCommit={(v) => setIdOverride(v.trim())} aria-label="Asset id" />
                </Field>
                {idError && <div className="text-ed-label text-solid">{idError}</div>}

                <div className="ed-section-title mt-2">Frame size</div>
                <Field label="Width">
                  <NumberField value={frameW} min={1} max={4096} unit="px" onCommit={setFrameW} aria-label="Frame width" />
                </Field>
                <Field label="Height">
                  <NumberField value={frameH} min={1} max={4096} unit="px" onCommit={setFrameH} aria-label="Frame height" />
                </Field>
                {preview && (
                  <div className="rounded-md border border-border bg-muted/30 p-2 text-ed-body" data-testid="import-grid-summary">
                    {preview.grid.columns} × {preview.grid.rows} = <b>{preview.grid.count}</b> frames
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {draft && preview ? (
              <>
                <div className="flex justify-end">
                  <SheetZoomControls z={sheetZoom} />
                </div>
                <SheetViewer
                  src={draft.url}
                  imageWidth={draft.width}
                  imageHeight={draft.height}
                  frameWidth={Math.max(1, frameW)}
                  frameHeight={Math.max(1, frameH)}
                  zoom={sheetZoom.zoom}
                  onZoomChange={sheetZoom.setZoom}
                  maxHeight={380}
                  columns={kind === 'character' ? preview.meta.character?.framesPerDirection : undefined}
                  rowLabels={kind === 'character' ? ['↓ down', '← left', '→ right', '↑ up'] : undefined}
                />
                {preview.warnings.map((w) => (
                  <div key={w} className="flex items-start gap-2 text-ed-label text-warning">
                    <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </>
            ) : (
              <div className="ed-empty rounded-md border border-dashed border-border">
                <FileImage className="h-6 w-6 opacity-50" />
                <span>No sheet chosen yet</span>
                <span className="ed-hint">PNG sheets only · or drop one here</span>
              </div>
            )}
          </div>
        </div>

        {error && <div className="mx-4 mb-2 rounded-md border border-solid/40 bg-solid/10 px-3 py-2 text-ed-label text-solid">{error}</div>}

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <EdButton onClick={() => onOpenChange(false)}>Cancel</EdButton>
          <EdButton variant="primary" disabled={!canImport} onClick={doImport}>
            {busy === 'importing' ? <Loader2 className="animate-spin" /> : null}
            Import sprite
          </EdButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
