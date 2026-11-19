// The right-hand panel while a Node is active (it takes the place of the tileset panels). The sprites themselves (and
// the Nodes holding them) are rows of the Scene panel, added there with Add Child Node › Sprite (which opens the picture
// browser kept here); this panel shows the sprite waiting to be placed and the picked one: a zoomable preview with the
// Crop button, and its properties. The Node's own name, z and opacity are in the Properties panel on the left.

import { stillGraphics } from '@/lib/characterEdit'
import React, { useEffect, useRef, useState } from 'react'
import { Crop, Scaling, Stamp, X } from 'lucide-react'
import { imagePickLabel, imagePickName } from '@/lib/graphicAssets'
import { flippedItemBounds, itemSourceSize } from '@/lib/imageItems'
import { snapPicture } from '@/lib/imageSnap'
import { describeBindings } from '@/lib/shortcuts'
import { useBindings } from '@/store/shortcutStore'
import type { ImageItem } from '@/types/editor'
import { drawOrderPictures, isBranch, type BranchNode } from '../../../../../shared/sceneTree'
import { lockedNode, pictureLocked, sceneIndex } from '@/lib/sceneIndex'
import { OPEN_PICTURE_PICKER_EVENT } from '@/lib/picturePickerEvent'
import { Card, EdButton, Field, IconButton, NumberField, TextField, Toggle } from '../ui/controls'
import { ZoomPane } from '../ui/ZoomPane'
import { ImageItemView } from '../sprites/ImageItemView'
import { ScaleField } from './ScaleField'
import { scaledSize } from '@/lib/imageScale'
import { PicturePicker, type PictureImport } from '../dialogs/PicturePicker'
import { importFilesInto } from '../database/importFlow'
import { pastedFolder } from '@/lib/pictureTree'
import { CropImageDialog } from '../dialogs/CropImageDialog'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'

const selectImages = (c: EditorContextValue) => ({
  nodes: c.activeMap?.nodes,
  activeLayerId: c.activeLayerId,
  spriteList: c.spriteList,
  graphics: c.graphics,
  graphicImages: c.graphicImages,
  spriteAssets: c.spriteAssets,
  pendingImage: c.pendingImage,
  startImagePlacement: c.startImagePlacement,
  cancelImagePlacement: c.cancelImagePlacement,
  selectedImageId: c.selectedImageId,
  resizingImageId: c.resizingImageId,
  setResizingImageId: c.setResizingImageId,
  pickedImageIds: c.pickedImageIds,
  openImageGroupId: c.openImageGroupId,
  groupNodes: c.groupNodes,
  ungroupNode: c.ungroupNode,
  placeMultiple: c.placeMultiple,
  updateImage: c.updateImage,
  mapName: c.activeMap?.name ?? null,
  importGraphic: c.importGraphic,
})

const NO_ASSETS = {}
const NO_NODES: never[] = []
const nameOf = (img: ImageItem) => img.name || imagePickName(img)

export function ImagesPanel() {
  const ctx = useEditorSelector(selectImages)
  const index = sceneIndex(ctx.nodes ?? NO_NODES)
  const found = index.byId.get(ctx.activeLayerId ?? '')?.node
  // The Node the sprites are added to: the active one (a sprite's own host when a sprite is picked).
  const layer = found && isBranch(found) ? found : null
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  // The shortcuts act on whatever the panel can do right now (set below, once the picked item is known).
  const actions = useRef<{ crop?: () => void; resize?: () => void; group?: () => void; ungroup?: () => void }>({})
  useShortcuts({
    'image.crop': (e) => { if (actions.current.crop) { e.preventDefault(); actions.current.crop() } },
    'image.resize': (e) => { if (actions.current.resize) { e.preventDefault(); actions.current.resize() } },
    'image.group': (e) => { if (actions.current.group) { e.preventDefault(); actions.current.group() } },
    'image.ungroup': (e) => { if (actions.current.ungroup) { e.preventDefault(); actions.current.ungroup() } },
  })
  // The Scene panel's "Add picture…" entries ask for the picker.
  useEffect(() => {
    const open = () => setPickerOpen(true)
    window.addEventListener(OPEN_PICTURE_PICKER_EVENT, open)
    return () => window.removeEventListener(OPEN_PICTURE_PICKER_EVENT, open)
  }, [])
  // Enter or Esc finishes resizing (the handles go away), unless a field is being typed in.
  const { resizingImageId, setResizingImageId } = ctx
  useEffect(() => {
    if (!resizingImageId) return
    const stop = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      setResizingImageId(null)
    }
    window.addEventListener('keydown', stop)
    return () => window.removeEventListener('keydown', stop)
  }, [resizingImageId, setResizingImageId])
  // The scale being typed, shown in the preview before Enter applies it (belongs to one item).
  const [scaleDraft, setScaleDraft] = useState<{ id: string; scale: number } | null>(null)
  const assets = ctx.spriteAssets ?? NO_ASSETS

  const images = layer ? drawOrderPictures(layer) : []
  const selectedNode = ctx.selectedImageId ? index.byId.get(ctx.selectedImageId)?.node : undefined
  const selected = selectedNode?.type === 'picture' && images.some((i) => i.id === selectedNode.id) ? selectedNode : null
  const picked = ctx.pickedImageIds
  const bindings = useBindings()
  const placeKeys = describeBindings('image.placeMultiple', bindings)
  const cropKeys = describeBindings('image.crop', bindings)
  const resizeKeys = describeBindings('image.resize', bindings)

  if (!layer) return <div className="ed-empty select-none">Select a Node to place sprites.</div>

  // The layer (or a group above it) is locked; a locked picture is frozen too.
  const locked = lockedNode(index, layer.id) || (selected ? pictureLocked(index, selected.id) : false)
  const layerLocked = lockedNode(index, layer.id)
  const pendingLabel = ctx.pendingImage ? imagePickLabel(ctx.pendingImage) : ''
  const graphic = selected?.graphicId ? ctx.graphics.find((g) => g.id === selected.graphicId) : undefined
  const previewScale = selected && scaleDraft?.id === selected.id ? scaleDraft.scale : (selected?.scale ?? 1)
  // A cropped picture previews as the whole picture with the part the item shows outlined; anything else as the item itself.
  const whole = selected?.graphicId && selected.crop ? { graphicId: selected.graphicId } : null
  const sourceSize = selected ? itemSourceSize(whole ?? selected, assets) : null
  const previewSize = sourceSize && scaledSize(sourceSize, previewScale)
  const canCrop = !!selected && !locked && !!graphic && !!ctx.graphicImages[graphic.id]
  const itemSize = selected ? itemSourceSize(selected, assets) : null
  const canResize = !!selected && !locked && !!itemSize
  const resizing = !!selected && ctx.resizingImageId === selected.id
  const toggleResize = () => selected && ctx.setResizingImageId(resizing ? null : selected.id)
  // Group puts the picked pictures in a new group; Ungroup acts on the open group, or the group of the picked picture.
  const below = selected ? (index.byId.get(selected.id)?.ancestors ?? []) : []
  const parentGroup = below.slice(below.indexOf(layer) + 1).reverse().find((a): a is BranchNode => isBranch(a))
  const groupOfPicked = ctx.openImageGroupId ?? parentGroup?.id ?? null
  actions.current = {
    group: !layerLocked && picked.length > 0 ? () => ctx.groupNodes(picked) : undefined,
    ungroup: !layerLocked && groupOfPicked ? () => ctx.ungroupNode(groupOfPicked) : undefined,
    crop: canCrop && !cropOpen ? () => setCropOpen(true) : undefined,
    resize: canResize && !cropOpen ? toggleResize : undefined,
  }
  // After a crop, the preview centres on (and fits) the cropped part of the whole picture.
  const cropFocus = whole && selected?.crop ? { x: selected.crop.x * previewScale, y: selected.crop.y * previewScale, w: selected.crop.w * previewScale, h: selected.crop.h * previewScale } : null

  const openGroup = ctx.openImageGroupId ? (index.byId.get(ctx.openImageGroupId)?.node as BranchNode | undefined) : undefined
  // New pictures from the picker (uploaded, dropped, pasted) are filed under pasted/<map name> and placed straight away.
  const importTo = pastedFolder(ctx.mapName)
  const importPictures: PictureImport = async (files) => {
    const r = await importFilesInto(files, importTo, ctx.graphics.map((g) => g.id), ctx.importGraphic)
    return r.ok ? { ok: true, picks: r.ids.map((graphicId) => ({ graphicId })) } : r
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left" data-testid="images-panel">
      <PicturePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={openGroup ? `Add a picture to ${openGroup.name}` : `Add a picture to ${layer.name}`}
        sprites={ctx.spriteList}
        graphics={stillGraphics(ctx.graphics)}
        gifsLeftOut={ctx.graphics.length - stillGraphics(ctx.graphics).length}
        images={ctx.graphicImages}
        onPick={ctx.startImagePlacement}
        onImport={importPictures}
        importTo={importTo}
      />
      {ctx.pendingImage && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-ed-label" data-testid="placing-banner">
          <span className="min-w-0 flex-1 truncate">Placing {pendingLabel}: click the map (Esc to stop)</span>
          <IconButton title="Stop placing" aria-label="Stop placing" onClick={ctx.cancelImagePlacement}>
            <X />
          </IconButton>
        </div>
      )}
      {!selected && !ctx.pendingImage && (
        <div className="ed-empty select-none" data-testid="images-empty">
          {picked.length > 1 ? `${picked.length} sprites picked` : `No sprite picked in ${layer.name}`}
        </div>
      )}

      {selected && (
        <Card
          caps
          title={<span title={imagePickLabel(selected)}>{nameOf(selected)}</span>}
          actions={
            <>
              <EdButton
                size="sm"
                aria-label="Crop image"
                title={`${selected.graphicId ? 'Choose which part of the picture this item shows' : 'Only pictures can be cropped, sprites have their own frames'}${cropKeys ? ` (${cropKeys})` : ''}`}
                aria-keyshortcuts={cropKeys || undefined}
                disabled={!canCrop}
                onClick={() => setCropOpen(true)}
              >
                <Crop />
                Crop…
              </EdButton>
              <EdButton
                size="sm"
                variant={resizing ? 'primary' : undefined}
                aria-label="Resize image"
                aria-pressed={resizing}
                title={`${resizing ? 'Drag a corner of the picture on the map to resize it. Click again (or Enter, Esc) to finish' : 'Show handles on the map to make the picture bigger or smaller'}${resizeKeys ? ` (${resizeKeys})` : ''}`}
                aria-keyshortcuts={resizeKeys || undefined}
                disabled={!canResize}
                onClick={toggleResize}
              >
                <Scaling />
                {resizing ? 'Done' : 'Resize'}
              </EdButton>
              <IconButton
                title={`Place more of this one: same picture, crop, scale and flips${placeKeys ? ` (${placeKeys})` : ''}`}
                aria-label="Place more of this image"
                disabled={locked}
                onClick={() => ctx.placeMultiple(layer.id, selected.id)}
              >
                <Stamp />
              </IconButton>
            </>
          }
          data-testid="image-props"
        >
          {previewSize && (
            <div className="flex h-60 min-h-0 flex-col" data-testid="image-preview">
              <ZoomPane key={`${selected.id}`} width={previewSize.w} height={previewSize.h} maxFit={8} hint={false} compact focus={cropFocus}>
                {(zoom) => (
                  <div className="relative" style={{ width: Math.round(previewSize.w * zoom), height: Math.round(previewSize.h * zoom) }}>
                    <ImageItemView item={whole ?? selected} assets={assets} zoom={zoom} itemScale={previewScale} />
                    {whole && selected.crop && (
                      <div
                        data-testid="crop-outline"
                        title={`The part this item shows: ${selected.crop.w}×${selected.crop.h} px from ${selected.crop.x}, ${selected.crop.y}`}
                        className="pointer-events-none absolute border border-dashed border-yellow-400"
                        style={{
                          left: selected.crop.x * previewScale * zoom,
                          top: selected.crop.y * previewScale * zoom,
                          width: selected.crop.w * previewScale * zoom,
                          height: selected.crop.h * previewScale * zoom,
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
                        }}
                      />
                    )}
                  </div>
                )}
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
                const p = snapPicture(flippedItemBounds(selected, assets, true), selected.x, selected.y)
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
        </Card>
      )}
    </div>
  )
}
