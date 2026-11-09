// The right-hand panel while an image layer is active (it takes the place of the tileset panels). The layer's own
// name and z stay in the Properties panel on the left; everything about its pictures lives here: the list (reorder,
// duplicate, rename, delete), a zoomable preview of the picked item with the Crop button, and its properties.

import { stillGraphics } from '@/lib/characterEdit'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, CopyPlus, Crop, Folder as FolderIcon, FolderInput, FolderMinus, FolderPlus, Group as GroupIcon, Lock, Scaling, Ungroup, Unlock, Pencil, Plus, Stamp, Trash2, X } from 'lucide-react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import type { ImageItem } from '@/types/editor'
import { imagePickLabel, imagePickName } from '@/lib/graphicAssets'
import { flippedItemBounds, itemSourceSize } from '@/lib/imageItems'
import { snapPicture } from '@/lib/imageSnap'
import { describeBindings } from '@/lib/shortcuts'
import { useBindings } from '@/store/shortcutStore'
import { sortedImages } from '@/lib/layerOrder'
import { imageRows } from '@/lib/imageGroups'
import type { ImageGroup } from '@/types/editor'
import { Badge, EdButton, Field, IconButton, InfoTip, NumberField, TextField, Toggle } from '../ui/controls'
import { ZoomPane } from '../ui/ZoomPane'
import { ImageItemView } from '../sprites/ImageItemView'
import { ScaleField } from './ScaleField'
import { scaledSize } from '@/lib/imageScale'
import { PicturePicker } from '../dialogs/PicturePicker'
import { CropImageDialog } from '../dialogs/CropImageDialog'
import { useShortcuts } from '@/hooks/useShortcuts'
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
  resizingImageId: c.resizingImageId,
  setResizingImageId: c.setResizingImageId,
  pickedImageIds: c.pickedImageIds,
  selectImage: c.selectImage,
  openImageGroupId: c.openImageGroupId,
  selectImageGroup: c.selectImageGroup,
  groupPickedImages: c.groupPickedImages,
  createImageGroup: c.createImageGroup,
  setImagesGroup: c.setImagesGroup,
  deleteImageGroup: c.deleteImageGroup,
  ungroupImageGroup: c.ungroupImageGroup,
  renameImageGroup: c.renameImageGroup,
  setImageGroupLocked: c.setImageGroupLocked,
  deleteImages: c.deleteImages,
  duplicateImages: c.duplicateImages,
  placeMultiple: c.placeMultiple,
  updateImage: c.updateImage,
  deleteImage: c.deleteImage,
  duplicateImage: c.duplicateImage,
  reorderImage: c.reorderImage,
  moveImageTo: c.moveImageTo,
})

const NO_ASSETS = {}
const nameOf = (img: ImageItem) => img.name || imagePickName(img)

export function ImagesPanel() {
  const ctx = useEditorSelector(selectImages)
  const layer = ctx.layers.find((l) => l.id === ctx.activeLayerId && l.type === 'image') ?? null
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
  const [renaming, setRenaming] = useState<string | null>(null)
  // The group whose name is open for typing (a new group opens its name straight away).
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null)
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
  const picked = ctx.pickedImageIds
  const bindings = useBindings()
  const placeKeys = describeBindings('image.placeMultiple', bindings)
  const cropKeys = describeBindings('image.crop', bindings)
  const resizeKeys = describeBindings('image.resize', bindings)
  const groupKeys = describeBindings('image.group', bindings)
  const ungroupKeys = describeBindings('image.ungroup', bindings)
  // Row buttons act on the whole picked set when the row belongs to it, otherwise on that row alone.
  const targetsOf = (id: string) => (picked.length > 1 && picked.includes(id) ? picked : [id])

  if (!layer) return <div className="ed-empty select-none">Select an image layer to place pictures.</div>

  const locked = layer.locked
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
  const groupOfPicked = ctx.openImageGroupId ?? selected?.groupId ?? null
  const groups = layer.groups ?? []
  const newGroup = (ids: readonly string[] = []) => {
    const id = ctx.createImageGroup(layer.id, ids)
    if (id) setRenamingGroup(id)
  }
  actions.current = {
    group: !locked && picked.length > 0 ? () => ctx.groupPickedImages(layer.id) : undefined,
    ungroup: !locked && groupOfPicked ? () => ctx.ungroupImageGroup(layer.id, groupOfPicked) : undefined,
    crop: canCrop && !cropOpen ? () => setCropOpen(true) : undefined,
    resize: canResize && !cropOpen ? toggleResize : undefined,
  }
  // After a crop, the preview centres on (and fits) the cropped part of the whole picture.
  const cropFocus = whole && selected?.crop ? { x: selected.crop.x * previewScale, y: selected.crop.y * previewScale, w: selected.crop.w * previewScale, h: selected.crop.h * previewScale } : null

  const renderRow = (img: ImageItem, indent = false) => {
    const i = rows.findIndex((r) => r.id === img.id)
    const targets = targetsOf(img.id)
    return (
              <ContextMenu key={img.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className="ed-row group"
                    style={indent ? { marginLeft: 16 } : undefined}
                    data-selected={picked.includes(img.id) ? 'true' : undefined}
                    data-dim={dragId === img.id ? 'true' : undefined}
                    draggable={!locked && renaming !== img.id}
                    onClick={(e) => ctx.selectImage(layer.id, img.id, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'replace')}
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
                      <IconButton title={`Place multiple: click the map to add more copies${placeKeys ? ` (${placeKeys})` : ''}`} aria-label="Place multiple" disabled={locked} onClick={(e) => { e.stopPropagation(); ctx.placeMultiple(layer.id, img.id) }}>
                        <CopyPlus />
                      </IconButton>
                      <IconButton title="Duplicate" aria-label="Duplicate image" disabled={locked} onClick={(e) => { e.stopPropagation(); ctx.duplicateImages(layer.id, targetsOf(img.id)) }}>
                        <Copy />
                      </IconButton>
                      <IconButton title="Delete" aria-label="Delete image" tone="danger" disabled={locked} onClick={(e) => { e.stopPropagation(); ctx.deleteImages(layer.id, targetsOf(img.id)) }}>
                        <Trash2 />
                      </IconButton>
                    </span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem disabled={locked} onClick={() => newGroup(targets)}>
                    <GroupIcon className="mr-2 h-3.5 w-3.5" />
                    {targets.length > 1 ? `Group ${targets.length} pictures` : 'Group this picture'}
                    {groupKeys && <ContextMenuShortcut>{groupKeys}</ContextMenuShortcut>}
                  </ContextMenuItem>
                  <ContextMenuItem disabled={locked} onClick={() => newGroup()}>
                    <FolderPlus className="mr-2 h-3.5 w-3.5" />
                    New empty group
                  </ContextMenuItem>
                  {groups.length > 0 && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger disabled={locked}>
                        <FolderInput className="mr-2 h-3.5 w-3.5" />
                        Move to group
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-44">
                        {groups.map((g) => (
                          <ContextMenuItem key={g.id} disabled={targets.every((id) => images.find((m) => m.id === id)?.groupId === g.id)} onClick={() => ctx.setImagesGroup(layer.id, targets, g.id)}>
                            <span className="truncate">{g.name}</span>
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                  {targets.some((id) => images.find((m) => m.id === id)?.groupId) && (
                    <ContextMenuItem disabled={locked} onClick={() => ctx.setImagesGroup(layer.id, targets, null)}>
                      <FolderMinus className="mr-2 h-3.5 w-3.5" />
                      Take out of group
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem disabled={locked} onClick={() => { ctx.setSelectedImageId(img.id); setRenaming(img.id) }}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem disabled={locked} onClick={() => ctx.duplicateImages(layer.id, targets)}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Duplicate
                  </ContextMenuItem>
                  <ContextMenuItem disabled={locked} className="text-destructive" onClick={() => ctx.deleteImages(layer.id, targets)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
    )
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left" data-testid="images-panel">
      <section className="ed-card" data-testid="image-layer-section">
        <div className="ed-card-head">
          <span className="ed-section-title min-w-0 flex-1 truncate" title={`Images · ${layer.name}`}>Images · {layer.name}</span>
          <InfoTip>Images snap to the grid while the magnet in the top toolbar is on, and move freely when it is off. Ctrl/Cmd+click adds or removes an image from the selection and Shift+click picks a range; Delete, Duplicate, Ctrl/Cmd+C and Ctrl/Cmd+V work on all of them.</InfoTip>
          {picked.length > 1 && <Badge>{picked.length} selected</Badge>}
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
            graphics={stillGraphics(ctx.graphics)}
            images={ctx.graphicImages}
            onPick={ctx.startImagePlacement}
          />
        </div>
        <ContextMenu>
        <ContextMenuTrigger asChild>
        <div className="ed-card-body" data-testid="image-list-area">
          {ctx.pendingImage && (
            <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-ed-label" data-testid="placing-banner">
              <span className="min-w-0 flex-1 truncate">Placing {pendingLabel}: click the map (Esc to stop)</span>
              <IconButton title="Stop placing" aria-label="Stop placing" onClick={ctx.cancelImagePlacement}>
                <X />
              </IconButton>
            </div>
          )}
          {rows.length === 0 && groups.length === 0 ? (
            <p className="ed-hint">No images yet. Use Add to place one.</p>
          ) : (
            <div className="flex flex-col gap-0.5" data-testid="image-list">
              {imageRows(images, groups).map((row) =>
                row.kind === 'item' ? (
                  renderRow(row.item)
                ) : (
                  <ImageGroupBlock
                    key={row.group.id}
                    layerId={layer.id}
                    group={row.group}
                    members={row.members}
                    locked={locked}
                    open={ctx.openImageGroupId === row.group.id}
                    selected={row.members.length > 0 && row.members.every((m) => picked.includes(m.id))}
                    ctx={ctx}
                    renderRow={(m) => renderRow(m, true)}
                    renaming={renamingGroup === row.group.id}
                    setRenaming={(on) => setRenamingGroup(on ? row.group.id : null)}
                    onNewGroup={() => newGroup()}
                    ungroupKeys={ungroupKeys}
                    dragId={dragId}
                    onDropInto={() => {
                      if (dragId) ctx.setImagesGroup(layer.id, [dragId], row.group.id)
                      setDragId(null)
                      setDropAt(null)
                    }}
                  />
                )
              )}
            </div>
          )}
        </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem disabled={locked} onClick={() => newGroup()}>
            <FolderPlus className="mr-2 h-3.5 w-3.5" />
            New group
          </ContextMenuItem>
          {picked.length > 0 && (
            <ContextMenuItem disabled={locked} onClick={() => newGroup(picked)}>
              <GroupIcon className="mr-2 h-3.5 w-3.5" />
              {picked.length > 1 ? `Group ${picked.length} pictures` : 'Group the picked picture'}
              {groupKeys && <ContextMenuShortcut>{groupKeys}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
        </ContextMenu>
      </section>

      {selected && (
        <section className="ed-card" data-testid="image-props">
          <div className="ed-card-head">
            <span className="ed-section-title min-w-0 flex-1 truncate" title={imagePickLabel(selected)}>{nameOf(selected)}</span>
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
          </div>
          <div className="ed-card-body">
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

type PanelCtx = ReturnType<typeof selectImages>

/** A group in the pictures list: its own row (select the group, lock it, rename, duplicate, delete; right-click for the rest) with its members under it. Pictures dragged onto the row join it. */
function ImageGroupBlock({
  layerId,
  group,
  members,
  locked,
  open,
  selected,
  ctx,
  renderRow,
  renaming,
  setRenaming,
  onNewGroup,
  ungroupKeys,
  dragId,
  onDropInto,
}: {
  layerId: string
  group: ImageGroup
  members: ImageItem[]
  locked: boolean
  open: boolean
  selected: boolean
  ctx: PanelCtx
  renderRow: (item: ImageItem) => React.ReactNode
  renaming: boolean
  setRenaming: (on: boolean) => void
  onNewGroup: () => void
  ungroupKeys?: string
  /** The picture row being dragged in the list, if any: dropping it on this row puts it in the group. */
  dragId: string | null
  onDropInto: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [dropping, setDropping] = useState(false)
  const ids = members.map((m) => m.id)
  const canTake = !!dragId && !locked && !ids.includes(dragId)
  return (
    <div className="flex flex-col gap-0.5" data-testid="image-group">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="ed-row group"
            data-selected={selected ? 'true' : undefined}
            data-current={open ? 'true' : undefined}
            data-drop={dropping ? 'true' : undefined}
            title={members.length === 0 ? 'An empty group: drag pictures onto it, or right-click a picture › Move to group' : open ? 'This group is selected: click a picture inside it to pick just that one' : 'Select the whole group'}
            onClick={() => ctx.selectImageGroup(layerId, group.id)}
            onDragOver={(e) => {
              if (!canTake) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropping(true)
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              if (!canTake) return
              e.preventDefault()
              e.stopPropagation()
              setDropping(false)
              onDropInto()
            }}
          >
            {dropping && <div className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary" />}
            <button
              type="button"
              className="ed-iconbtn"
              aria-label={collapsed ? `Show the pictures of ${group.name}` : `Hide the pictures of ${group.name}`}
              aria-expanded={!collapsed}
              onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c) }}
            >
              {collapsed ? <ChevronRight /> : <ChevronDown />}
            </button>
            <FolderIcon className="text-yellow-400" />
            {renaming ? (
              <input
                className="ed-input min-w-0 flex-1"
                aria-label="Group name"
                defaultValue={group.name}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => { ctx.renameImageGroup(layerId, group.id, e.currentTarget.value); setRenaming(false) }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') e.currentTarget.blur()
                  else if (e.key === 'Escape') { e.currentTarget.value = group.name; e.currentTarget.blur() }
                }}
              />
            ) : (
              <span className="ed-row-label" title={group.name} onDoubleClick={() => !locked && setRenaming(true)}>{group.name}</span>
            )}
            <Badge>{members.length}</Badge>
            <IconButton
              title={group.locked ? 'Locked: clicking a picture on the map picks the whole group. Select the group here to pick single pictures. Click to unlock.' : 'Unlocked. Lock it so that clicking any picture on the map picks the whole group.'}
              aria-label={group.locked ? `Unlock ${group.name}` : `Lock ${group.name}`}
              aria-pressed={!!group.locked}
              active={!!group.locked}
              disabled={locked}
              onClick={(e) => { e.stopPropagation(); ctx.setImageGroupLocked(layerId, group.id, !group.locked) }}
            >
              {group.locked ? <Lock /> : <Unlock />}
            </IconButton>
            <span className="ed-row-actions hidden group-hover:flex group-focus-within:flex">
              <IconButton title="Rename group" aria-label={`Rename ${group.name}`} disabled={locked} onClick={(e) => { e.stopPropagation(); setRenaming(true) }}>
                <Pencil />
              </IconButton>
              <IconButton title="Duplicate the group with all its pictures" aria-label={`Duplicate ${group.name}`} disabled={locked || members.length === 0} onClick={(e) => { e.stopPropagation(); ctx.duplicateImages(layerId, ids) }}>
                <Copy />
              </IconButton>
              <IconButton title="Delete the group and all its pictures" aria-label={`Delete ${group.name}`} tone="danger" disabled={locked} onClick={(e) => { e.stopPropagation(); ctx.deleteImageGroup(layerId, group.id) }}>
                <Trash2 />
              </IconButton>
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem disabled={locked} onClick={() => setRenaming(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem disabled={locked} onClick={onNewGroup}>
            <FolderPlus className="mr-2 h-3.5 w-3.5" />
            New group
          </ContextMenuItem>
          <ContextMenuItem disabled={locked || members.length === 0} onClick={() => ctx.duplicateImages(layerId, ids)}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Duplicate
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={locked} onClick={() => ctx.ungroupImageGroup(layerId, group.id)} title="The pictures stay where they are, as loose pictures at this level">
            <Ungroup className="mr-2 h-3.5 w-3.5" />
            Ungroup
            {ungroupKeys && <ContextMenuShortcut>{ungroupKeys}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem disabled={locked} className="text-destructive" onClick={() => ctx.deleteImageGroup(layerId, group.id)}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {members.length > 0 ? 'Delete group and pictures' : 'Delete group'}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {!collapsed && (members.length > 0 ? members.map((m) => renderRow(m)) : <p className="ed-hint pl-8" data-testid="empty-group">Empty</p>)}
    </div>
  )
}
