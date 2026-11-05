// Resize one picture item. Pictures are scaled nearest neighbour (picture pixels are never blended), by one factor, so the
// shape stays: type the width or the height you want and the scale follows, or pick a whole-number factor. Nothing is cut or
// copied; the item stores a scale, and the game draws it at the same whole-pixel size.

import { useState } from 'react'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import type { ImageItem } from '@/types/editor'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MAX_SCALE, MIN_SCALE, SCALE_PRESETS, scaleForSize, scaledSize } from '@/lib/imageScale'
import { EdButton, Field, NumberField } from '../ui/controls'
import { ZoomPane } from '../ui/ZoomPane'
import { ImageItemView } from '../sprites/ImageItemView'
import { ConfirmFooter } from './ConfirmParts'

interface Props {
  open: boolean
  item: Pick<ImageItem, 'assetId' | 'graphicId' | 'crop'>
  assets: Record<string, SpriteAssetInfo>
  /** Size of what the item shows at scale 1. */
  size: { w: number; h: number }
  scale: number
  onApply: (scale: number) => void
  onClose: () => void
}

export function ResizeImageDialog({ open, onClose, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* The content (and with it the draft) is built fresh each time the dialog opens. */}
      <DialogContent className="max-w-2xl" aria-describedby="resize-image-desc">
        <ResizeBody onClose={onClose} {...rest} />
      </DialogContent>
    </Dialog>
  )
}

function ResizeBody({ item, assets, size, scale, onApply, onClose }: Omit<Props, 'open'>) {
  const [draft, setDraft] = useState(scale)
  const shown = scaledSize(size, draft)
  const apply = () => {
    if (draft !== scale) onApply(draft)
    onClose()
  }
  const fromWidth = (w: number) => {
    const s = scaleForSize(size.w, w)
    if (s !== null) setDraft(s)
  }
  const fromHeight = (h: number) => {
    const s = scaleForSize(size.h, h)
    if (s !== null) setDraft(s)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Resize picture</DialogTitle>
        <DialogDescription id="resize-image-desc" className="ed-hint">
          {size.w}×{size.h} px now at ×{scale}. Pixels stay sharp: the picture is enlarged or shrunk without smoothing, and its shape is kept.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex h-72 min-h-0 flex-col" data-testid="resize-preview">
          <ZoomPane width={Math.max(1, shown.w)} height={Math.max(1, shown.h)} maxFit={8} hint={false} compact>
            {(zoom) => <ImageItemView item={item} assets={assets} zoom={zoom} itemScale={draft} />}
          </ZoomPane>
        </div>
        <div className="flex flex-col gap-2">
          <Field label="Width">
            <NumberField aria-label="Width" value={Math.round(shown.w)} min={1} integer unit="px" onCommit={fromWidth} />
          </Field>
          <Field label="Height">
            <NumberField aria-label="Height" value={Math.round(shown.h)} min={1} integer unit="px" onCommit={fromHeight} />
          </Field>
          <Field label="Scale" info={`Between ×${MIN_SCALE} and ×${MAX_SCALE}. The game rounds the size to whole pixels.`}>
            <NumberField aria-label="Scale" value={draft} min={MIN_SCALE} max={MAX_SCALE} step={0.25} unit="×" onCommit={setDraft} />
          </Field>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Scale presets">
            {SCALE_PRESETS.map((p) => (
              <EdButton key={p} size="sm" aria-label={`Scale ×${p}`} aria-pressed={draft === p} onClick={() => setDraft(p)}>
                ×{p}
              </EdButton>
            ))}
          </div>
        </div>
      </div>
      <ConfirmFooter tone="primary" confirmLabel="Resize" disabled={draft === scale} onCancel={onClose} onConfirm={apply} note={`${shown.w}×${shown.h} px`} />
    </>
  )
}
