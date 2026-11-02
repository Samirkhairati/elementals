// The right-hand panel while an image layer is active (it takes the place of the tileset panels). The layer's own
// name and z stay in the Properties panel on the left; everything about its pictures lives here: the list (reorder,
// duplicate, rename, delete), a zoomable preview of the picked item with the Crop button, and its properties.

import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Crop, Pencil, Plus, Stamp, Trash2, X } from 'lucide-react'
import type { ImageItem } from '@/types/editor'
import { imagePickLabel } from '@/lib/graphicAssets'
import { flippedItemBounds, itemSourceSize, snapImageAnchor } from '@/lib/imageItems'
import { sortedImages } from '@/lib/layerOrder'
import { Badge, EdButton, Field, IconButton, InfoTip, NumberField, TextField, Toggle } from '../ui/controls'
import { ZoomPane } from '../ui/ZoomPane'
import { ImageItemView } from '../sprites/ImageItemView'
import { ScaleField } from './ScaleField'
import { scaledSize } from '@/lib/imageScale'
import { PicturePicker } from '../dialogs/PicturePicker'
import { CropImageDialog } from '../dialogs/CropImageDialog'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'

const selectImages = (c: EditorContextValue) => ({
  layers: c.layers,
  activeLayerId: c.activeLayerId,
  spriteList: c.spriteList,
  graphics: c.graphics,
  graphicImages: c.graphicImages,
  spriteAssets: c.spriteAssets,
  snapEntityPos: c.snapEntityPos,
  pendingImage: c.pendingImage,
  startImagePlacement: c.startImagePlacement,
  cancelImagePlacement: c.cancelImagePlacement,
  selectedImageId: c.selectedImageId,
  setSelectedImageId: c.setSelectedImageId,
  updateImage: c.updateImage,
  deleteImage: c.deleteImage,
  duplicateImage: c.duplicateImage,
  reorderImage: c.reorderImage,
  moveImageTo: c.moveImageTo,
})

const NO_ASSETS = {}
const nameOf = (img: ImageItem) => img.name || imagePickLabel(img)

export function ImagesPanel() {
  const ctx = useEditorSelector(selectImages)
  const layer = ctx.layers.find((l) => l.id === ctx.activeLayerId && l.type === 'image') ?? null
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  // Dragging a row changes the draw order: the row being dragged and where it would land.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; position: 'top' | 'bottom' } | null>(null)
  // The scale being typed, shown in the preview before Enter applies it (belongs to one item).
  const [scaleDraft, setScaleDraft] = useState<{ id: string; scale: number } | null>(null)
  const assets = ctx.spriteAssets ?? NO_ASSETS

  const images = layer?.images ?? []
  // Front first, like the layer list: the top row draws over the ones below it.
  const rows = useMemo(() => sortedImages(layer?.images).reverse(), [layer?.images])
  const selected = images.find((img) => img.id === ctx.selectedImageId) ?? null

  if (!layer) return <div className="ed-empty select-none">Select an image layer to place pictures.</div>

  const locked = layer.locked
  const pendingLabel = ctx.pendingImage ? imagePickLabel(ctx.pendingImage) : ''
  const graphic = selected?.graphicId ? ctx.graphics.find((g) => g.id === selected.graphicId) : undefined
  const sourceSize = selected ? itemSourceSize(selected, assets) : null
  const previewScale = selected && scaleDraft?.id === selected.id ? scaleDraft.scale : (selected?.scale ?? 1)
  const previewSize = sourceSize && scaledSize(sourceSize, previewScale)

  return (
    <div className="flex w-full flex-col gap-3 text-left" data-testid="images-panel">
      <section className="ed-card" data-testid="image-layer-section">
        <div className="ed-card-head">
          <span className="ed-section-title flex-1">Images · {layer.name}</span>
          <InfoTip>Images snap to the grid while the magnet in the top toolbar is on, and move freely when it is off.</InfoTip>
          <Badge>{images.length}</Badge>
          <button type="button" className="ed-btn" data-size="sm" data-variant="primary" aria-label="Add image" disabled={locked} onClick={() => setPickerOpen(true)}>
            <Plus />
            Add
          </button>
          <PicturePicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            title="Add an image: pick a sprite or a picture"
            sprites={ctx.spriteList}
            graphics={ctx.graphics}
            images={ctx.graphicImages}
            onPick={ctx.startImagePlacement}
          />
        </div>
        <div className="ed-card-body">
          {ctx.pendingImage && (
            <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-ed-label" data-testid="placing-banner">
              <span className="min-w-0 flex-1 truncate">Placing {pendingLabel}: click the map (Esc to stop)</span>
              <IconButton title="Stop placing" aria-label="Stop placing" onClick={ctx.cancelImagePlacement}>
                <X />
              </IconButton>
            </div>
          )}
          {rows.length === 0 ? (
            <p className="ed-hint">No images yet. Use Add to place one.</p>
          ) : (
            <div className="flex flex-col gap-0.5" data-testid="image-list">
              {rows.map((img, i) => (
                <div
                  key={img.id}
                  className="ed-row group"
                  data-selected={img.id === ctx.selectedImageId ? 'true' : undefined}
                  data-dim={dragId === img.id ? 'true' : undefined}
                  draggable={!locked && renaming !== img.id}
                  onClick={() => ctx.setSelectedImageId(img.id)}
                  onDragStart={(e) => {
                    setDragId(img.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', img.id)
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    const r = e.currentTarget.getBoundingClientRect()
                    setDropAt(dragId === img.id ? null : { id: img.id, position: e.clientY - r.top < r.height / 2 ? 'top' : 'bottom' })
                  }}
                  onDragEnd={() => { setDragId(null); setDropAt(null) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragId && dropAt && dropAt.id === img.id) ctx.moveImageTo(layer.id, dragId, img.id, dropAt.position)
                    setDragId(null)
                    setDropAt(null)
                  }}
                >
                  {dropAt?.id === img.id && dragId !== img.id && (
                    <div className={`pointer-events-none absolute left-0 right-0 z-30 h-[2px] rounded-full bg-primary ${dropAt.position === 'top' ? '-top-[2px]' : '-bottom-[2px]'}`} />
                  )}
                  <div className="ed-checker flex h-6 w-6 shrink-0 items-center justify-center rounded-sm">
                    <ImageItemView item={img} assets={assets} size={24} />
                  </div>
                  {renaming === img.id ? (
                    <input
                      className="ed-input min-w-0 flex-1"
                      aria-label="Image name"
                      defaultValue={nameOf(img)}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={(e) => {
                        const name = e.currentTarget.value.trim()
                        if (name && name !== nameOf(img)) ctx.updateImage(layer.id, img.id, { name })
                        setRenaming(null)
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') e.currentTarget.blur()
                        else if (e.key === 'Escape') {
                          e.currentTarget.value = nameOf(img)
                          e.currentTarget.blur()
                        }
                      }}
                    />
                  ) : (
                    <span className="ed-row-label" title={imagePickLabel(img)} onDoubleClick={() => !locked && setRenaming(img.id)}>
                      {nameOf(img)}
                    </span>
                  )}
                  {img.crop && <span className="ed-badge" title={`Shows ${img.crop.w}×${img.crop.h} px of the picture, from ${img.crop.x}, ${img.crop.y}`}>crop</span>}
                  <span className="ed-row-actions hidden group-hover:flex group-focus-within:flex">
                    <IconButton title="Bring forward" aria-label="Bring forward" disabled={locked || i === 0} onClick={(e) => { e.stopPropagation(); ctx.reorderImage(layer.id, img.id, 1) }}>
                      <ArrowUp />
                    </IconButton>
                    <IconButton title="Send backward" aria-label="Send backward" disabled={locked || i === rows.length - 1} onClick={(e) => { e.stopPropagation(); ctx.reorderImage(layer.id, img.id, -1) }}>
                      <ArrowDown />
                    </IconButton>
                    <IconButton title="Rename" aria-label="Rename image" disabled={locked} onClick={(e) => { e.stopPropagation(); ctx.setSelectedImageId(img.id); setRenaming(img.id) }}>
                      <Pencil />
                    </IconButton>
                    <IconButton title="Duplicate" aria-label="Duplicate image" disabled={locked} onClick={(e) => { e.stopPropagation(); ctx.duplicateImage(layer.id, img.id) }}>
                      <Copy />
                    </IconButton>
                    <IconButton title="Delete" aria-label="Delete image" tone="danger" disabled={locked} onClick={(e) => { e.stopPropagation(); ctx.deleteImage(layer.id, img.id) }}>
                      <Trash2 />
                    </IconButton>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {selected && (
        <section className="ed-card" data-testid="image-props">
          <div className="ed-card-head">
            <span className="ed-section-title min-w-0 flex-1 truncate" title={imagePickLabel(selected)}>{nameOf(selected)}</span>
            <EdButton
              size="sm"
              aria-label="Crop image"
              title={selected.graphicId ? 'Choose which part of the picture this item shows' : 'Only pictures can be cropped, sprites have their own frames'}
              disabled={locked || !graphic || !ctx.graphicImages[graphic.id]}
              onClick={() => setCropOpen(true)}
            >
              <Crop />
              Crop…
            </EdButton>
            <IconButton
              title="Place more of this one (same picture and crop)"
              aria-label="Place more of this image"
              disabled={locked}
              onClick={() => ctx.startImagePlacement({ assetId: selected.assetId, graphicId: selected.graphicId, crop: selected.crop })}
            >
              <Stamp />
            </IconButton>
          </div>
          <div className="ed-card-body">
            {previewSize && (
              <div className="flex h-60 min-h-0 flex-col" data-testid="image-preview">
                <ZoomPane key={`${selected.id}`} width={previewSize.w} height={previewSize.h} maxFit={8} hint={false} compact>
                  {(zoom) => <ImageItemView item={selected} assets={assets} zoom={zoom} itemScale={previewScale} />}
                </ZoomPane>
              </div>
            )}
            <Field label="Name" hint="Shown in the list. Defaults to the picture's id.">
              <TextField value={nameOf(selected)} aria-label="Name" disabled={locked} onCommit={(name) => name.trim() && ctx.updateImage(layer.id, selected.id, { name: name.trim() })} />
            </Field>
            <Field label="Position" hint="Pixels on the map: where the picture's bottom-centre stands.">
              <div className="grid grid-cols-2 gap-1">
                <NumberField value={selected.x} unit="x" integer aria-label="Image x" disabled={locked} onCommit={(x) => ctx.updateImage(layer.id, selected.id, { x })} />
                <NumberField value={selected.y} unit="y" integer aria-label="Image y" disabled={locked} onCommit={(y) => ctx.updateImage(layer.id, selected.id, { y })} />
              </div>
            </Field>
            <Field label="Snap" hint="Move this image onto the tile grid.">
              <EdButton
                size="sm"
                disabled={locked}
                onClick={() => {
                  const p = snapImageAnchor(flippedItemBounds(selected, assets), selected.x, selected.y)
                  ctx.updateImage(layer.id, selected.id, { x: p.x, y: p.y })
                }}
              >
                Snap to tile
              </EdButton>
            </Field>
            <Field label="Z-index" hint="Draw order inside this layer; higher draws on top.">
              <NumberField value={selected.z ?? 0} integer aria-label="Image z-index" disabled={locked} onCommit={(z) => ctx.updateImage(layer.id, selected.id, { z })} />
            </Field>
            <Field label="Scale" stack hint="How big the picture is drawn on the map. Nearest neighbour; the game rounds to whole pixels.">
              <ScaleField
                key={selected.id}
                scale={selected.scale ?? 1}
                source={sourceSize}
                disabled={locked}
                onApply={(scale) => ctx.updateImage(layer.id, selected.id, { scale })}
                onDraft={(scale) => setScaleDraft(scale === null ? null : { id: selected.id, scale })}
              />
            </Field>
            <Field label="Opacity">
              <NumberField value={selected.opacity ?? 1} min={0} max={1} step={0.05} aria-label="Image opacity" disabled={locked} onCommit={(opacity) => ctx.updateImage(layer.id, selected.id, { opacity })} />
            </Field>
            <Field label="Flip horizontally">
              <Toggle checked={!!selected.flipX} onChange={(flipX) => ctx.updateImage(layer.id, selected.id, { flipX })} disabled={locked} aria-label="Flip image horizontally" />
            </Field>
            <Field label="Flip vertically">
              <Toggle checked={!!selected.flipY} onChange={(flipY) => ctx.updateImage(layer.id, selected.id, { flipY })} disabled={locked} aria-label="Flip image vertically" />
            </Field>
          </div>
          {graphic && (
            <CropImageDialog
              open={cropOpen}
              graphicId={graphic.id}
              url={ctx.graphicImages[graphic.id]}
              size={{ width: graphic.width, height: graphic.height }}
              crop={selected.crop}
              onApply={(crop) => ctx.updateImage(layer.id, selected.id, { crop })}
              onClose={() => setCropOpen(false)}
            />
          )}
        </section>
      )}
    </div>
  )
}
