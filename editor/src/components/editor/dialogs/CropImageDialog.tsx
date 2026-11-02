// Crop one picture item: drag on the picture to pick a part, drag the box or its handles to adjust it. The item then
// shows only that rectangle of the picture file; nothing is cut out or copied, so several items can show different
// parts of the same picture.

import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ImageCrop } from '@/types/editor'
import { clampCrop, cropFromPoints, dragCrop, effectiveCrop, isWholeCrop, storedCrop, wholeCrop, type CropHandle, type PictureSize } from '@/lib/cropRect'
import { EdButton, NumberField } from '../ui/controls'
import { ZoomPane } from '../ui/ZoomPane'
import { ConfirmFooter } from './ConfirmParts'

interface Props {
  open: boolean
  graphicId: string
  /** The picture's file (data URL). */
  url: string | undefined
  size: PictureSize
  crop: ImageCrop | undefined
  /** `undefined` = the whole picture. */
  onApply: (crop: ImageCrop | undefined) => void
  onClose: () => void
}

const HANDLES: { id: Exclude<CropHandle, 'move'>; style: React.CSSProperties; cursor: string }[] = [
  { id: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize' },
  { id: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { id: 'ne', style: { left: '100%', top: 0 }, cursor: 'nesw-resize' },
  { id: 'e', style: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
  { id: 'se', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
  { id: 's', style: { left: '50%', top: '100%' }, cursor: 'ns-resize' },
  { id: 'sw', style: { left: 0, top: '100%' }, cursor: 'nesw-resize' },
  { id: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize' },
]

export function CropImageDialog({ open, onClose, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* The content (and with it the draft) is built fresh each time the dialog opens. */}
      <DialogContent className="max-w-3xl" aria-describedby="crop-dialog-desc">
        <CropBody onClose={onClose} {...rest} />
      </DialogContent>
    </Dialog>
  )
}

function CropBody({ graphicId, url, size, crop, onApply, onClose }: Omit<Props, 'open'>) {
  const [draft, setDraft] = useState<ImageCrop>(() => effectiveCrop(crop, size))
  const apply = () => {
    onApply(storedCrop(draft, size))
    onClose()
  }
  const set = (patch: Partial<ImageCrop>) => setDraft((d) => clampCrop({ ...d, ...patch }, size))

  return (
    <>
      <DialogHeader>
        <DialogTitle>Crop picture</DialogTitle>
        <DialogDescription id="crop-dialog-desc" className="ed-hint">
          {graphicId} · {size.width}×{size.height} px. The item shows only the boxed part; the picture file is not changed or copied.
        </DialogDescription>
      </DialogHeader>
      <div className="flex h-[55vh] min-h-0 flex-col">
        {url ? (
          <ZoomPane
            width={size.width}
            height={size.height}
            hint="Drag on the picture to select a part. Drag the box or its handles to adjust it. Ctrl/⌘ + scroll zooms; middle-drag or scroll moves around."
            toolbar={
              <div className="flex flex-wrap items-center gap-2" data-testid="crop-fields">
                <label className="flex items-center gap-1"><span className="ed-label">X</span><NumberField size="sm" value={draft.x} integer min={0} max={size.width - 1} aria-label="Crop x" onCommit={(x) => set({ x })} /></label>
                <label className="flex items-center gap-1"><span className="ed-label">Y</span><NumberField size="sm" value={draft.y} integer min={0} max={size.height - 1} aria-label="Crop y" onCommit={(y) => set({ y })} /></label>
                <label className="flex items-center gap-1"><span className="ed-label">W</span><NumberField size="sm" value={draft.w} integer min={1} max={size.width} aria-label="Crop width" onCommit={(w) => set({ w })} /></label>
                <label className="flex items-center gap-1"><span className="ed-label">H</span><NumberField size="sm" value={draft.h} integer min={1} max={size.height} aria-label="Crop height" onCommit={(h) => set({ h })} /></label>
                <EdButton size="sm" disabled={isWholeCrop(draft, size)} onClick={() => setDraft(wholeCrop(size))}>Whole picture</EdButton>
              </div>
            }
          >
            {(zoom) => <CropStage url={url} size={size} zoom={zoom} crop={draft} onChange={setDraft} />}
          </ZoomPane>
        ) : (
          <p className="ed-hint p-3">This picture could not be loaded.</p>
        )}
      </div>
      <ConfirmFooter tone="primary" note={`${draft.w}×${draft.h} px selected`} onCancel={onClose} onConfirm={apply} confirmLabel="Apply crop" disabled={!url} />
    </>
  )
}

interface StageProps {
  url: string
  size: PictureSize
  zoom: number
  crop: ImageCrop
  onChange: (crop: ImageCrop) => void
}

/** The picture at `zoom` with the crop box over it (everything outside the box is dimmed). */
function CropStage({ url, size, zoom, crop, onChange }: StageProps) {
  const stage = useRef<HTMLDivElement>(null)

  // Left button only; the middle button is left to the pane so it can pan.
  const begin = (e: React.MouseEvent, handle: CropHandle | 'new') => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect = stage.current?.getBoundingClientRect()
    if (!rect) return
    const toPicture = (cx: number, cy: number) => ({ x: (cx - rect.left) / zoom, y: (cy - rect.top) / zoom })
    const origin = toPicture(e.clientX, e.clientY)
    const start = crop
    const move = (ev: MouseEvent) => {
      const p = toPicture(ev.clientX, ev.clientY)
      onChange(handle === 'new' ? cropFromPoints(origin, p, size) : dragCrop(start, handle, p.x - origin.x, p.y - origin.y, size))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div ref={stage} data-testid="crop-stage" className="relative cursor-crosshair overflow-hidden" style={{ width: size.width * zoom, height: size.height * zoom }} onMouseDown={(e) => begin(e, 'new')}>
      <img src={url} alt="" draggable={false} className="ed-pixelated block h-full w-full" />
      <div
        data-testid="crop-box"
        className="absolute cursor-move border border-yellow-400"
        style={{ left: crop.x * zoom, top: crop.y * zoom, width: crop.w * zoom, height: crop.h * zoom, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
        // A box that is the whole picture has nowhere to move: dragging then starts a new selection.
        onMouseDown={(e) => begin(e, isWholeCrop(crop, size) ? 'new' : 'move')}
      >
        {HANDLES.map((h) => (
          <span
            key={h.id}
            data-handle={h.id}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-black/70 bg-yellow-400"
            style={{ ...h.style, cursor: h.cursor }}
            onMouseDown={(e) => begin(e, h.id)}
          />
        ))}
      </div>
    </div>
  )
}
