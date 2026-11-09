// The right-hand panel while an image layer is active (it takes the place of the tileset panels). The layer's own
// name and z stay in the Properties panel on the left; everything about its pictures lives here: the list (reorder,
// duplicate, rename, delete), a zoomable preview of the picked item with the Crop button, and its properties.

import { stillGraphics } from '@/lib/characterEdit'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ClipboardPaste, Copy, CopyPlus, Crop, Edit2, Folder as FolderIcon, FolderInput, FolderMinus, FolderOpen, FolderPlus, Group as GroupIcon, ImagePlus, Images as ImagesIcon, Lock, Scaling, Ungroup, Unlock, Plus, Stamp, Trash2, X } from 'lucide-react'
import { useEditorClipboard } from '@/store/editorClipboard'
import { groupYSort, inheritedItemYSort, itemYSort, layerYSort } from '../../../../../shared/ySort'
import { YSortBadge, YSortMenuItem } from '../ui/YSortMenuItem'
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
  setImageGroupYSort: c.setImageGroupYSort,
  setImagesYSort: c.setImagesYSort,
  moveImageGroupTo: c.moveImageGroupTo,
  copyImages: c.copyImages,
  pasteImages: c.pasteImages,
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
  // Dragging a row changes the draw order: the row being dragged (a picture or a whole group) and where it would land.
  const [drag, setDrag] = useState<Drag | null>(null)
  const [dropAt, setDropAt] = useState<DropAt | null>(null)
  const dragId = drag?.kind === 'item' ? drag.id : null
  const endDrag = () => { setDrag(null); setDropAt(null) }
  const canPasteImages = useEditorClipboard((st) => st.content?.kind === 'images')
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
  const editKeys = { copy: describeBindings('edit.copy', bindings), paste: describeBindings('edit.paste', bindings), duplicate: describeBindings('edit.duplicate', bindings) }
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

  const groupOf = (id: string | undefined) => (id ? groups.find((g) => g.id === id) : undefined)
  /** Members of a group, front first. */
  const membersFront = (groupId: string) => rows.filter((r) => r.groupId === groupId)

  /** Where a dragged row would land on a picture row (a group lands beside the whole group the picture is in). */
  const overItem = (e: React.DragEvent, img: ImageItem) => {
    if (!drag || locked) return
    if (drag.kind === 'item' && drag.id === img.id) return setDropAt(null)
    if (drag.kind === 'group' && img.groupId === drag.id) return setDropAt(null)
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    setDropAt({ kind: 'item', id: img.id, position: e.clientY - r.top < r.height / 2 ? 'top' : 'bottom' })
  }
  const dropOnItem = (e: React.DragEvent, img: ImageItem) => {
    e.preventDefault()
    if (drag && dropAt?.kind === 'item' && dropAt.id === img.id && dropAt.position !== 'into') {
      if (drag.kind === 'item') ctx.moveImageTo(layer.id, drag.id, img.id, dropAt.position)
      else if (img.groupId) ctx.moveImageGroupTo(layer.id, drag.id, { kind: 'group', id: img.groupId }, dropAt.position)
      else ctx.moveImageGroupTo(layer.id, drag.id, { kind: 'item', id: img.id }, dropAt.position)
    }
    endDrag()
  }
  /** On a group row: a picture goes above / below it (loose) or into it (the middle); a group goes above or below. */
  const overGroup = (e: React.DragEvent, group: ImageGroup) => {
    if (!drag || locked || (drag.kind === 'group' && drag.id === group.id)) return setDropAt(null)
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const f = (e.clientY - r.top) / r.height
    const empty = membersFront(group.id).length === 0
    const position: DropAt['position'] = drag.kind === 'item' ? (empty || (f > 0.25 && f < 0.75) ? 'into' : f <= 0.25 ? 'top' : 'bottom') : f < 0.5 ? 'top' : 'bottom'
    if (drag.kind === 'group' && empty) return setDropAt(null)
    setDropAt({ kind: 'group', id: group.id, position })
  }
  const dropOnGroup = (e: React.DragEvent, group: ImageGroup) => {
    e.preventDefault()
    e.stopPropagation()
    const members = membersFront(group.id)
    if (drag && dropAt?.kind === 'group' && dropAt.id === group.id) {
      if (drag.kind === 'group') ctx.moveImageGroupTo(layer.id, drag.id, { kind: 'group', id: group.id }, dropAt.position === 'top' ? 'top' : 'bottom')
      else if (dropAt.position === 'into') ctx.setImagesGroup(layer.id, [drag.id], group.id)
      else if (members.length > 0) {
        const edge = dropAt.position === 'top' ? members[0] : members[members.length - 1]
        ctx.moveImageTo(layer.id, drag.id, edge.id, dropAt.position, null)
      }
    }
    endDrag()
  }

  const renderRow = (img: ImageItem, indent = false) => {
    const i = rows.findIndex((r) => r.id === img.id)
    const targets = targetsOf(img.id)
    const ySorted = itemYSort(img, layer, ctx.layers)
    return (
              <ContextMenu key={img.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={indent ? 'ed-row ed-indent' : 'ed-row'}
                    data-testid="image-row"
                    data-selected={picked.includes(img.id) ? 'true' : undefined}
                    data-dim={dragId === img.id ? 'true' : undefined}
                    draggable={!locked && renaming !== img.id}
                    onClick={(e) => ctx.selectImage(layer.id, img.id, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'replace')}
                    onDoubleClick={() => !locked && setRenaming(img.id)}
                    onDragStart={(e) => {
                      e.stopPropagation()
                      setDrag({ kind: 'item', id: img.id })
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', img.id)
                    }}
                    onDragOver={(e) => overItem(e, img)}
                    onDragEnd={endDrag}
                    onDrop={(e) => dropOnItem(e, img)}
                  >
                    {dropAt?.kind === 'item' && dropAt.id === img.id && dropAt.position !== 'into' && (
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
                          if (e.key === 'Enter') {
                            const name = e.currentTarget.value.trim()
                            if (name && name !== nameOf(img)) ctx.updateImage(layer.id, img.id, { name })
                            setRenaming(null)
                          } else if (e.key === 'Escape') setRenaming(null)
                        }}
                      />
                    ) : (
                      <span className="ed-row-label" title={imagePickLabel(img)}>
                        {nameOf(img)}
                      </span>
                    )}
                    {img.crop && <span className="ed-badge" title={`Shows ${img.crop.w}×${img.crop.h} px of the picture, from ${img.crop.x}, ${img.crop.y}`}>crop</span>}
                    {ySorted && <YSortBadge inherited={img.ySort === undefined} />}
                  </div>
                </ContextMenuTrigger>
                {/* Focus stays where the menu put it (Rename opens a name field that must keep it). */}
                <ContextMenuContent className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <ContextMenuItem disabled={locked} onClick={() => { ctx.setSelectedImageId(img.id); setRenaming(img.id) }}>
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem disabled={locked} onClick={() => ctx.placeMultiple(layer.id, img.id)} title="Click the map to add more copies: same picture, crop, scale and flips">
                    <Stamp className="mr-2 h-3.5 w-3.5" />
                    Place more copies
                    {placeKeys && <ContextMenuShortcut>{placeKeys}</ContextMenuShortcut>}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem disabled={locked || i === 0} onClick={() => ctx.reorderImage(layer.id, img.id, 1)}>
                    <ArrowUp className="mr-2 h-3.5 w-3.5" />
                    Bring forward
                  </ContextMenuItem>
                  <ContextMenuItem disabled={locked || i === rows.length - 1} onClick={() => ctx.reorderImage(layer.id, img.id, -1)}>
                    <ArrowDown className="mr-2 h-3.5 w-3.5" />
                    Send backward
                  </ContextMenuItem>
                  <ContextMenuSeparator />
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
                  <YSortMenuItem
                    own={img.ySort}
                    inherited={inheritedItemYSort(img, layer, ctx.layers)}
                    from={groupOf(img.groupId)?.ySort !== undefined ? 'group' : 'layer'}
                    disabled={locked}
                    title="Draw among the characters by how far down the picture stands"
                    onChange={(v) => ctx.setImagesYSort(layer.id, targets, v)}
                  />
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => ctx.copyImages(layer.id, targets)}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copy
                    {editKeys.copy && <ContextMenuShortcut>{editKeys.copy}</ContextMenuShortcut>}
                  </ContextMenuItem>
                  <ContextMenuItem disabled={locked} onClick={() => ctx.duplicateImages(layer.id, targets)}>
                    <CopyPlus className="mr-2 h-3.5 w-3.5" />
                    Duplicate
                    {editKeys.duplicate && <ContextMenuShortcut>{editKeys.duplicate}</ContextMenuShortcut>}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem disabled={locked} className="text-red-400 focus:bg-red-500/10 focus:text-red-400" onClick={() => ctx.deleteImages(layer.id, targets)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {targets.length > 1 ? `Delete ${targets.length} pictures` : 'Delete'}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
    )
  }

  /** The Add button and the "Add picture inside" entry: with a group open, what is placed joins it. */
  const openPicker = (groupId?: string) => {
    if (groupId) ctx.selectImageGroup(layer.id, groupId)
    setPickerOpen(true)
  }
  const openGroup = groups.find((g) => g.id === ctx.openImageGroupId) ?? null

  return (
    <div className="flex w-full flex-col gap-3 text-left" data-testid="images-panel">
      <section className="ed-card" data-testid="image-layer-section">
        <div className="ed-card-head">
          <span className="ed-section-title min-w-0 flex-1 truncate" title={`Images · ${layer.name}`}>Images · {layer.name}</span>
          <InfoTip>Images snap to the grid while the magnet in the top toolbar is on, and move freely when it is off. Ctrl/Cmd+click adds or removes an image from the selection and Shift+click picks a range; Delete, Duplicate, Ctrl/Cmd+C and Ctrl/Cmd+V work on all of them.</InfoTip>
          {picked.length > 1 && <Badge>{picked.length} selected</Badge>}
          <Badge>{images.length}</Badge>
          <button type="button" className="ed-btn" data-size="sm" data-variant="primary" aria-label="Add image" title={openGroup ? `Add a picture to the group ${openGroup.name}` : 'Add a picture to this layer'} disabled={locked} onClick={() => openPicker()}>
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
                    selected={ctx.openImageGroupId === row.group.id || (row.members.length > 0 && row.members.every((m) => picked.includes(m.id)))}
                    ctx={ctx}
                    renderRow={(m) => renderRow(m, true)}
                    renaming={renamingGroup === row.group.id}
                    setRenaming={(on) => setRenamingGroup(on ? row.group.id : null)}
                    onNewGroup={() => newGroup()}
                    onAddInside={() => openPicker(row.group.id)}
                    ySorted={groupYSort(layer, row.group.id, ctx.layers)}
                    layerYSorted={layerYSort(layer, ctx.layers)}
                    canPaste={canPasteImages}
                    keys={{ ungroup: ungroupKeys, ...editKeys }}
                    dragging={drag?.kind === 'group' && drag.id === row.group.id}
                    drop={dropAt?.kind === 'group' && dropAt.id === row.group.id ? dropAt.position : null}
                    onDragStart={(e) => {
                      setDrag({ kind: 'group', id: row.group.id })
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', row.group.id)
                    }}
                    onDragOver={(e) => overGroup(e, row.group)}
                    onDragEnd={endDrag}
                    onDragLeave={() => setDropAt((d) => (d?.kind === 'group' && d.id === row.group.id ? null : d))}
                    onDrop={(e) => dropOnGroup(e, row.group)}
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

type Drag = { kind: 'item' | 'group'; id: string }
type DropAt = { kind: 'item' | 'group'; id: string; position: 'top' | 'bottom' | 'into' }

/**
 * A group in the pictures list, drawn like a folder of the layer list: its row (click selects the group, the chevron
 * opens or closes it, drag it to move all its pictures up or down; right-click for the rest) with its members under it.
 * Pictures dropped on the middle of the row join it.
 */
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
  onAddInside,
  ySorted,
  layerYSorted,
  canPaste,
  keys,
  dragging,
  drop,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragLeave,
  onDrop,
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
  onAddInside: () => void
  ySorted: boolean
  layerYSorted: boolean
  canPaste: boolean
  keys: { ungroup?: string; copy?: string; paste?: string; duplicate?: string }
  dragging: boolean
  drop: DropAt['position'] | null
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const ids = members.map((m) => m.id)
  return (
    <div className="flex flex-col gap-0.5" data-testid="image-group">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="ed-row"
            data-testid="image-group-row"
            data-selected={selected ? 'true' : undefined}
            data-current={open && !selected ? 'true' : undefined}
            data-drop={drop === 'into' ? 'true' : undefined}
            data-dim={dragging ? 'true' : undefined}
            title={members.length === 0 ? 'An empty group: drag pictures onto it, or select it and use Add' : open ? 'This group is selected: what you add goes into it' : 'Select the whole group'}
            draggable={!locked && !renaming}
            onClick={() => ctx.selectImageGroup(layerId, group.id)}
            onDoubleClick={() => !locked && setRenaming(true)}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDragLeave()
            }}
            onDragEnd={onDragEnd}
            onDrop={onDrop}
          >
            {drop && drop !== 'into' && (
              <div className={`pointer-events-none absolute left-0 right-0 z-30 h-[2px] rounded-full bg-primary ${drop === 'top' ? '-top-[2px]' : '-bottom-[2px]'}`} />
            )}
            <button
              type="button"
              className="ed-iconbtn"
              aria-label={collapsed ? `Show the pictures of ${group.name}` : `Hide the pictures of ${group.name}`}
              aria-expanded={!collapsed}
              onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c) }}
            >
              {collapsed ? <ChevronRight /> : <ChevronDown />}
            </button>
            {collapsed ? <FolderIcon className="text-yellow-400" /> : <FolderOpen className="text-yellow-400" />}
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
                  if (e.key === 'Enter') { ctx.renameImageGroup(layerId, group.id, e.currentTarget.value); setRenaming(false) }
                  else if (e.key === 'Escape') setRenaming(false)
                }}
              />
            ) : (
              <span className="ed-row-label" title={group.name}>{group.name}</span>
            )}
            {ySorted && <YSortBadge inherited={group.ySort === undefined} />}
            <span className="ed-badge" data-tone="count" title="Pictures in this group" data-testid="group-count">
              <ImagesIcon />
              {members.length}
            </span>
            {group.locked && (
              <div className="ed-row-actions mr-1" title="Locked: clicking a picture on the map picks the whole group. Select the group here to pick single pictures.">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52" onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem disabled={locked} onClick={() => setRenaming(true)}>
            <Edit2 className="mr-2 h-3.5 w-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem disabled={locked} onClick={onAddInside}>
            <ImagePlus className="mr-2 h-3.5 w-3.5" />
            Add picture inside…
          </ContextMenuItem>
          <ContextMenuItem disabled={locked} onClick={onNewGroup}>
            <FolderPlus className="mr-2 h-3.5 w-3.5" />
            New group
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={members.length === 0} onClick={() => ctx.copyImages(layerId, ids)}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copy
            {keys.copy && <ContextMenuShortcut>{keys.copy}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem disabled={locked || members.length === 0} onClick={() => ctx.duplicateImages(layerId, ids)} title="A copy of the group with all its pictures">
            <CopyPlus className="mr-2 h-3.5 w-3.5" />
            Duplicate
            {keys.duplicate && <ContextMenuShortcut>{keys.duplicate}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem disabled={locked || !canPaste} onClick={() => ctx.pasteImages(layerId, null, group.id)} title="Pastes the copied pictures into this group">
            <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
            Paste inside
            {keys.paste && <ContextMenuShortcut>{keys.paste}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={locked}
            onClick={() => ctx.setImageGroupLocked(layerId, group.id, !group.locked)}
            title={group.locked ? 'Clicking a picture on the map picks just that picture again' : 'Clicking any picture of the group on the map picks the whole group'}
          >
            {group.locked ? <Unlock className="mr-2 h-3.5 w-3.5" /> : <Lock className="mr-2 h-3.5 w-3.5" />}
            {group.locked ? 'Unlock Group' : 'Lock Group'}
          </ContextMenuItem>
          <YSortMenuItem
            own={group.ySort}
            inherited={layerYSorted}
            from="layer"
            disabled={locked}
            title="The pictures of the group follow this, unless they say otherwise"
            onChange={(v) => ctx.setImageGroupYSort(layerId, group.id, v)}
          />
          <ContextMenuItem disabled={locked} onClick={() => ctx.ungroupImageGroup(layerId, group.id)} title="The pictures stay where they are, as loose pictures">
            <Ungroup className="mr-2 h-3.5 w-3.5" />
            Ungroup
            {keys.ungroup && <ContextMenuShortcut>{keys.ungroup}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={locked} className="text-red-400 focus:bg-red-500/10 focus:text-red-400" onClick={() => ctx.deleteImageGroup(layerId, group.id)}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {members.length > 0 ? 'Delete Group and Pictures' : 'Delete Group'}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {!collapsed && (members.length > 0 ? members.map((m) => renderRow(m)) : <p className="ed-hint ed-indent pl-8" data-testid="empty-group">Empty</p>)}
    </div>
  )
}
