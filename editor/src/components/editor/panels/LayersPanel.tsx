import React, { useState, useEffect } from 'react'
import {
  Layers as LayersIcon,
  XSquare,
  Droplet,
  Leaf,
  Box,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Copy,
  CopyPlus,
  ClipboardPaste,
  Plus,
  Image as ImageIcon,
  Images as ImagesIcon,
  Users,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { Layer, LayerType } from '@/types/editor'
import { ENTITIES_ID } from '@/lib/layerOrder'
import { canHoldInFolder, isFolder, moveInList, setLayerFolder, visibleStack } from '@/lib/layerFolders'
import { useEditorClipboard } from '@/store/editorClipboard'
import { inheritedLayerYSort, layerYSort } from '../../../../../shared/ySort'
import { YSortBadge, YSortMenuItem } from '../ui/YSortMenuItem'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { RenameInput } from '../ui/RenameInput'
import { collisionItems } from '../../../../../shared/collisionLayers'
import { EntitySubmenu, NewEntityFolderItem, type Prefab } from './EntityTree'

/** Every kind of layer the New Layer menus offer, with its icon and colour (the same icon marks its rows). */
const LAYER_KINDS: { type: Exclude<LayerType, 'folder'>; label: string; Icon: typeof LayersIcon; color: string; title: string }[] = [
  { type: 'tile', label: 'Tile Layer', Icon: LayersIcon, color: 'text-slate-300', title: 'Paint tiles from a tileset' },
  { type: 'image', label: 'Image Layer', Icon: ImageIcon, color: 'text-violet-400', title: 'Place pictures and sprites anywhere' },
  { type: 'collision', label: 'Collision Layer', Icon: XSquare, color: 'text-red-400', title: 'Painted tiles and shapes that block movement' },
  { type: 'terrain', label: 'Terrain Layer', Icon: Droplet, color: 'text-blue-400', title: 'Ground kinds (water, sand...)' },
  { type: 'encounters', label: 'Encounters Layer', Icon: Leaf, color: 'text-green-400', title: 'Where wild encounters happen' },
  { type: 'objects', label: 'Objects Layer', Icon: Box, color: 'text-amber-400', title: 'Object markers' },
]
/** Only one of these per map. */
const SINGLETON_TYPES: readonly LayerType[] = ['terrain', 'encounters']

function getLayerIcon(type: LayerType) {
  if (type === 'folder') return <FolderIcon className="text-yellow-400" />
  const kind = LAYER_KINDS.find((k) => k.type === type)
  return kind ? <kind.Icon className={kind.color} /> : <LayersIcon className="text-slate-300" />
}

function LayerKindItems({ createLayerOfType, layers, only }: { createLayerOfType: (type: LayerType) => void; layers: Layer[]; only?: readonly LayerType[] }) {
  return (
    <>
      {LAYER_KINDS.filter((k) => !only || only.includes(k.type)).map(({ type, label, Icon, color, title }) => {
        const taken = SINGLETON_TYPES.includes(type) && layers.some((l) => l.type === type)
        return (
          <ContextMenuItem key={type} disabled={taken} title={taken ? 'A map has one of these' : title} onClick={() => createLayerOfType(type)}>
            <Icon className={`mr-2 h-3.5 w-3.5 ${color}`} />
            {label}
          </ContextMenuItem>
        )
      })}
    </>
  )
}

function NewLayerSubmenu({
  createLayerOfType,
  layers,
  keys,
}: {
  createLayerOfType: (type: LayerType) => void
  layers: Layer[]
  /** The shortcut of New layer (a plain tile layer). */
  keys?: string
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Plus className="w-3.5 h-3.5 mr-2" />
        New Layer
        {keys && <span className="ml-auto pl-3 text-muted-foreground">{keys}</span>}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-48">
        <LayerKindItems createLayerOfType={createLayerOfType} layers={layers} />
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => createLayerOfType('folder')}>
          <FolderIcon className="mr-2 h-3.5 w-3.5 text-yellow-400" />
          Folder
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

/** What the Entities row needs to show the map's entities under it and to create new ones from its menus. */
export interface EntitiesSlot {
  count: number
  /** The entity tree (EntityTree), shown while the row is open. */
  tree: React.ReactNode
  onNew: () => void
  onPrefab: (prefab: Prefab) => void
  onNewFolder: () => void
  /** Something in the tree is selected: the row stays highlighted while closed. */
  hasSelection?: boolean
}

interface EntitiesRowProps {
  visible: boolean
  onToggle?: () => void
  /** Drag handlers of the stack: the row moves among the layers like a layer does (not set when there is nothing to move past). */
  drag?: {
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragEnd: () => void
    onDrop: (e: React.DragEvent) => void
  }
  /** Where a dragged item would land relative to this row. */
  dropPosition?: 'top' | 'bottom' | null
  slot?: EntitiesSlot
  open: boolean
  setOpen: (open: boolean) => void
}

/** The Entities row of the stack: where entity sprites draw among the layers, and (opened) the map's entities. */
function EntitiesRow({ visible, onToggle, drag, dropPosition, slot, open, setOpen }: EntitiesRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="ed-row"
            data-dim={visible ? undefined : 'true'}
            data-current={!open && slot?.hasSelection ? 'true' : undefined}
            data-testid="entities-row"
            title="The entities of the map. Drag to change where they draw among the layers."
            draggable={!!drag}
            onClick={() => slot && setOpen(!open)}
            {...drag}
          >
            {dropPosition && (
              <div
                className={`absolute left-0 right-0 h-[2px] bg-primary z-30 pointer-events-none rounded-full ${
                  dropPosition === 'top' ? '-top-[2px]' : '-bottom-[2px]'
                }`}
              />
            )}
            {slot && (open ? <ChevronDown className="text-gray-400" /> : <ChevronRight className="text-gray-400" />)}
            <Users className="text-sky-400" />
            <span className="ed-row-label">Entities</span>
            {slot && (
              <span className="ed-badge" data-tone="count" title="Entities on this map" data-testid="entity-count">
                <Users />
                {slot.count}
              </span>
            )}
            <div className="ed-row-actions mr-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle?.()
                }}
                className="ed-iconbtn"
                title={visible ? 'Hide all entities on the canvas' : 'Show entities on the canvas'}
                aria-label={visible ? 'Hide entities' : 'Show entities'}
              >
                {visible ? <Eye /> : <EyeOff />}
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        {slot && (
          <ContextMenuContent className="w-48">
            <EntitySubmenu onNew={slot.onNew} onPrefab={slot.onPrefab} />
            <NewEntityFolderItem onCreate={slot.onNewFolder} />
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onToggle}>
              {visible ? <EyeOff className="w-3.5 h-3.5 mr-2" /> : <Eye className="w-3.5 h-3.5 mr-2" />}
              {visible ? 'Hide Entities' : 'Show Entities'}
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
      {slot && open && slot.tree}
    </div>
  )
}

interface LayersPanelProps {
  /** Whether a map is open (the panel only needs presence, not the map itself). */
  hasActiveMap: boolean
  layers: Layer[]
  activeLayerId: string | null
  /** `null` = no layer selected (clicking the selected layer again). */
  setActiveLayerId: (id: string | null) => void
  /** Plain click selects one layer; Ctrl/Cmd+click adds it to the multi-selection. Falls back to `setActiveLayerId`. */
  selectLayer?: (id: string, additive?: boolean | 'range') => void
  /** Layers picked in addition to the active one. */
  selectedLayerIds?: readonly string[]
  /** The entities of the map are not a layer: one row that toggles their visibility and can be dragged among the layers. */
  showEntities?: boolean
  toggleShowEntities?: () => void
  /** How many layers are above the Entities row (0 = on top). */
  entitiesIndex?: number
  setEntitiesIndex?: (index: number) => void
  setSelectedEntityId?: (id: string | null) => void
  /** The map's entities, shown under the Entities row (without it the row only toggles and moves them). */
  entitiesSlot?: EntitiesSlot
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void
  /** Y-sort on / off for an image layer or a folder; undefined = follow the folder. */
  setLayerYSort?: (id: string, value: boolean | undefined) => void
  deleteLayer: (id: string) => void
  reorderLayers: (newLayers: Layer[]) => void
  /** With a folder id, a tile or image layer is created inside that folder. */
  createLayerOfType: (type: LayerType, folderId?: string) => void
  renameLayer: (id: string, newName: string) => void
  duplicateLayer: (id: string) => void
  /** Copy layers and folders (a folder with what it holds) to the editor clipboard. */
  copyLayers?: (ids: readonly string[]) => void
  /** Paste copied layers next to a layer, in its folder (onto a folder row: inside it). */
  pasteLayers?: (afterId: string | null) => void
  /** The shortcuts to show beside Copy / Paste / Duplicate. */
  editKeys?: { copy?: string; paste?: string; duplicate?: string }
  /** Opens or closes a folder row (a view change, not an undo step). */
  toggleFolderCollapsed?: (id: string) => void
  /** The layer just made by New layer / New folder (a new `n` each time): its name opens for typing. */
  justCreatedLayer?: { id: string; n: number } | null
  /** The shortcuts to show beside the New layer / New folder entries. */
  newLayerKeys?: string
  newFolderKeys?: string
  setConfirmDialog: (config: {
    open: boolean
    title: string
    description: string
    action: () => void
  }) => void
}

export function LayersPanel({
  hasActiveMap,
  layers,
  activeLayerId,
  setActiveLayerId,
  selectLayer,
  selectedLayerIds = [],
  showEntities = true,
  toggleShowEntities,
  entitiesIndex = 0,
  setEntitiesIndex,
  setSelectedEntityId,
  entitiesSlot,
  toggleLayerVisibility,
  toggleLayerLock,
  setLayerYSort,
  deleteLayer,
  reorderLayers,
  createLayerOfType,
  renameLayer,
  duplicateLayer,
  copyLayers,
  pasteLayers,
  editKeys = {},
  toggleFolderCollapsed,
  justCreatedLayer = null,
  newLayerKeys,
  newFolderKeys,
  setConfirmDialog,
}: LayersPanelProps) {
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string
    position: 'top' | 'bottom'
  } | null>(null)
  const canPasteLayers = useEditorClipboard((s) => s.content?.kind === 'layers')
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [entitiesOpen, setEntitiesOpen] = useState(true)
  const startEditing = (layer: Layer) => {
    setEditingLayerId(layer.id)
  }

  // A layer or folder that was just created opens its name for typing, so Ctrl+N then a name is all it takes.
  useEffect(() => {
    if (!justCreatedLayer) return
    const made = layers.find((l) => l.id === justCreatedLayer.id)
    if (made) startEditing(made)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCreatedLayer?.n])

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedLayerId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!draggedLayerId || draggedLayerId === targetId) {
      setDragOverTarget(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const isTop = e.clientY - rect.top < rect.height / 2
    setDragOverTarget({ id: targetId, position: isTop ? 'top' : 'bottom' })
  }

  const handleDragEnd = () => {
    setDraggedLayerId(null)
    setDragOverTarget(null)
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedLayerId || draggedLayerId === targetId) {
      setDraggedLayerId(null)
      setDragOverTarget(null)
      return
    }

    // Layers and the Entities row are one stack; only the order (and which folder holds a layer) changes (no z, no other property).
    const moved = moveInList(layers, entitiesIndex, draggedLayerId, targetId, dragOverTarget?.position === 'bottom' ? 'bottom' : 'top')
    if (moved.layers !== layers) reorderLayers(moved.layers)
    if (moved.entitiesIndex !== Math.min(entitiesIndex, layers.length)) setEntitiesIndex?.(moved.entitiesIndex)
    setDraggedLayerId(null)
    setDragOverTarget(null)
  }

  const putInFolder = (layerId: string, folderId: string | null) => {
    const moved = setLayerFolder(layers, entitiesIndex, layerId, folderId)
    if (moved.layers !== layers) reorderLayers(moved.layers)
    if (moved.entitiesIndex !== Math.min(entitiesIndex, layers.length)) setEntitiesIndex?.(moved.entitiesIndex)
  }

  const confirmDeleteLayer = (layer: Layer) => {
    setTimeout(() => {
      setConfirmDialog({
        open: true,
        title: layer.type === 'folder' ? 'Delete Folder' : 'Delete Layer',
        description:
          layer.type === 'folder'
            ? `Delete the folder "${layer.name}"? The layers inside it are kept.`
            : `Are you sure you want to delete layer "${layer.name}"?`,
        action: () => deleteLayer(layer.id),
      })
    }, 0)
  }

  // Copy from a row that is part of the selection takes the whole selection; any other row is copied alone.
  const copyFromRow = (layer: Layer) => {
    const picked = [activeLayerId, ...selectedLayerIds].filter((id): id is string => !!id)
    copyLayers?.(picked.includes(layer.id) ? picked : [layer.id])
  }

  const stack = visibleStack(layers, entitiesIndex)
  const folders = layers.filter((l) => l.type === 'folder')

  // The menu of the panel's empty space and of the layer rows: new layers, folders and entities.
  const createMenu = (createType: (type: LayerType) => void) => (
    <>
      <NewLayerSubmenu createLayerOfType={createType} layers={layers} keys={newLayerKeys} />
      <ContextMenuItem onClick={() => createLayerOfType('folder')}>
        <FolderPlus className="w-3.5 h-3.5 mr-2 text-yellow-400" />
        New Folder
        {newFolderKeys && <ContextMenuShortcut>{newFolderKeys}</ContextMenuShortcut>}
      </ContextMenuItem>
      {entitiesSlot && (
        <>
          <ContextMenuSeparator />
          <EntitySubmenu onNew={entitiesSlot.onNew} onPrefab={entitiesSlot.onPrefab} />
        </>
      )}
    </>
  )

  if (!hasActiveMap) {
    return (
      <div className="ed-empty">Select a map to view layers</div>
    )
  }

  if (layers.length === 0) {
    return (
      <ContextMenu>
        <ContextMenuTrigger className="block h-full w-full">
          <EntitiesRow visible={showEntities} onToggle={toggleShowEntities} slot={entitiesSlot} open={entitiesOpen} setOpen={setEntitiesOpen} />
          <div className="ed-empty">
            <p>No layers yet.</p>
            <p className="ed-hint">Right-click here to create a layer.</p>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">{createMenu(createLayerOfType)}</ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full h-full w-full">
        <div className="flex min-h-full h-full w-full flex-col gap-0.5">
          {stack.map((stackId) => {
            if (stackId === ENTITIES_ID) {
              return (
                <EntitiesRow
                  key={ENTITIES_ID}
                  visible={showEntities}
                  onToggle={toggleShowEntities}
                  drag={{
                    onDragStart: (e) => handleDragStart(e, ENTITIES_ID),
                    onDragOver: (e) => handleDragOver(e, ENTITIES_ID),
                    onDragEnd: handleDragEnd,
                    onDrop: (e) => handleDrop(e, ENTITIES_ID),
                  }}
                  dropPosition={dragOverTarget?.id === ENTITIES_ID && draggedLayerId !== ENTITIES_ID ? dragOverTarget.position : null}
                  slot={entitiesSlot}
                  open={entitiesOpen}
                  setOpen={setEntitiesOpen}
                />
              )
            }
            const layer = layers.find((l) => l.id === stackId)
            if (!layer) return null
            const isEditing = editingLayerId === layer.id
            const isSelected = activeLayerId === layer.id
            const isMulti = !isSelected && selectedLayerIds.includes(layer.id)
            const isDropTarget = dragOverTarget?.id === layer.id && draggedLayerId !== layer.id
            const isFolderRow = layer.type === 'folder'
            const held = layer.folderId !== undefined

            return (
              <ContextMenu key={layer.id}>
                <ContextMenuTrigger>
                  <div
                    draggable={!layer.locked && !isEditing}
                    onDragStart={(e) => handleDragStart(e, layer.id)}
                    onDragOver={(e) => handleDragOver(e, layer.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, layer.id)}
                    onClick={(e) => {
                      if (isFolderRow) {
                        toggleFolderCollapsed?.(layer.id)
                        return
                      }
                      const additive = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey
                      // Clicking the selected layer again deselects it (a multi-selection collapses to this one layer first).
                      if (!additive && isSelected && selectedLayerIds.length === 0) setActiveLayerId(null)
                      else if (selectLayer) selectLayer(layer.id, additive)
                      else setActiveLayerId(layer.id)
                      setSelectedEntityId?.(null)
                    }}
                    onDoubleClick={() => {
                      if (!layer.locked) startEditing(layer)
                    }}
                    className={held ? 'ed-row ed-indent' : 'ed-row'}
                    data-testid={isFolderRow ? 'folder-row' : undefined}
                    data-dim={layer.visible ? undefined : 'true'}
                    data-selected={isSelected ? 'true' : undefined}
                    data-multi={isMulti ? 'true' : undefined}
                  >
                    {/* Horizontal drag indicator line */}
                    {isDropTarget && (
                      <div
                        className={`absolute left-0 right-0 h-[2px] bg-primary z-30 pointer-events-none rounded-full ${
                          dragOverTarget.position === 'top' ? '-top-[2px]' : '-bottom-[2px]'
                        }`}
                      />
                    )}

                    {isFolderRow &&
                      (layer.collapsed ? <ChevronRight className="text-gray-400" /> : <ChevronDown className="text-gray-400" />)}
                    {isFolderRow ? (layer.collapsed ? <FolderIcon className="text-yellow-400" /> : <FolderOpen className="text-yellow-400" />) : getLayerIcon(layer.type)}

                    {isEditing ? (
                      <RenameInput initial={layer.name} label="Layer name" onRename={(name) => renameLayer(layer.id, name)} onClose={() => setEditingLayerId(null)} className="h-row-sm border-primary/60" />
                    ) : (
                      <span className="ed-row-label" title={layer.name}>{layer.name}</span>
                    )}

                    {(layer.type === 'image' || isFolderRow) && layerYSort(layer, layers) && <YSortBadge inherited={layer.ySort === undefined} />}
                    {isFolderRow ? (
                      <span className="ed-badge" data-tone="count" title="Layers in this folder" data-testid="folder-count">
                        <LayersIcon />
                        {layers.filter((l) => l.folderId === layer.id).length}
                      </span>
                    ) : (
                      <>
                        {layer.type === 'image' && (
                          <span className="ed-badge" data-tone="count" title={`${layer.images?.length ?? 0} pictures in this layer`} data-testid="item-count">
                            <ImagesIcon />
                            {layer.images?.length ?? 0}
                          </span>
                        )}
                        {layer.type === 'collision' && (
                          <span className="ed-badge" data-tone="count" title="Items in this layer (sets of tiles and shapes)" data-testid="item-count">
                            <XSquare />
                            {collisionItems(layer).length}
                          </span>
                        )}
                        {layer.type !== 'collision' && (
                          <span className="ed-badge" data-tone="z" title="z-index, the layer's draw order in the game: higher draws on top" data-testid="layer-z">
                            z {layer.z ?? 0}
                          </span>
                        )}
                      </>
                    )}

                    {/* Compact status & inline visibility toggle */}
                    <div
                      className="ed-row-actions mr-1"
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      {layer.locked && (
                        <div title="Layer locked" className="flex h-6 w-6 items-center justify-center">
                          <Lock className="text-amber-400" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLayerVisibility(layer.id)
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                        }}
                        className="ed-iconbtn"
                        title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                      >
                        {layer.visible ? <Eye /> : <EyeOff />}
                      </button>
                    </div>
                  </div>
                </ContextMenuTrigger>

                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => startEditing(layer)}>
                    <Edit2 className="w-3.5 h-3.5 mr-2" />
                    Rename
                  </ContextMenuItem>
                  {isFolderRow && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <Plus className="w-3.5 h-3.5 mr-2" />
                        New Layer inside
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-48">
                        <LayerKindItems createLayerOfType={(type) => createLayerOfType(type, layer.id)} layers={layers} only={['tile', 'image', 'collision']} />
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                  {isFolderRow ? (
                    <>
                      <ContextMenuItem onClick={() => createLayerOfType('folder')}>
                        <FolderPlus className="w-3.5 h-3.5 mr-2 text-yellow-400" />
                        New Folder
                        {newFolderKeys && <ContextMenuShortcut>{newFolderKeys}</ContextMenuShortcut>}
                      </ContextMenuItem>
                      {entitiesSlot && <EntitySubmenu onNew={entitiesSlot.onNew} onPrefab={entitiesSlot.onPrefab} />}
                    </>
                  ) : (
                    createMenu((type) => createLayerOfType(type, layer.folderId))
                  )}
                  {(isFolder(layer) || canHoldInFolder(layer)) && (
                    <>
                      <ContextMenuSeparator />
                      {copyLayers && (
                        <ContextMenuItem onClick={() => copyFromRow(layer)}>
                          <Copy className="w-3.5 h-3.5 mr-2" />
                          Copy
                          {editKeys.copy && <ContextMenuShortcut>{editKeys.copy}</ContextMenuShortcut>}
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem onClick={() => duplicateLayer(layer.id)}>
                        <CopyPlus className="w-3.5 h-3.5 mr-2" />
                        Duplicate
                        {editKeys.duplicate && <ContextMenuShortcut>{editKeys.duplicate}</ContextMenuShortcut>}
                      </ContextMenuItem>
                    </>
                  )}
                  {pasteLayers && (
                    <ContextMenuItem disabled={!canPasteLayers} onClick={() => pasteLayers(layer.id)} title={isFolderRow ? 'Pastes into this folder (a copied folder goes below it)' : 'Pastes below this layer, in the same folder'}>
                      <ClipboardPaste className="w-3.5 h-3.5 mr-2" />
                      {isFolderRow ? 'Paste inside' : 'Paste'}
                      {editKeys.paste && <ContextMenuShortcut>{editKeys.paste}</ContextMenuShortcut>}
                    </ContextMenuItem>
                  )}
                  {canHoldInFolder(layer) && (folders.length > 0 || held) && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <FolderIcon className="w-3.5 h-3.5 mr-2" />
                        Move to folder
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-44">
                        {folders.map((f) => (
                          <ContextMenuItem key={f.id} disabled={layer.folderId === f.id} onClick={() => putInFolder(layer.id, f.id)}>
                            {f.name}
                          </ContextMenuItem>
                        ))}
                        {held && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => putInFolder(layer.id, null)}>Remove from folder</ContextMenuItem>
                          </>
                        )}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => toggleLayerVisibility(layer.id)}>
                    {layer.visible ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 mr-2" />
                        Hide Layer
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 mr-2" />
                        Show Layer
                      </>
                    )}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => toggleLayerLock(layer.id)}>
                    {layer.locked ? (
                      <>
                        <Unlock className="w-3.5 h-3.5 mr-2" />
                        Unlock Layer
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 mr-2" />
                        Lock Layer
                      </>
                    )}
                  </ContextMenuItem>
                  {setLayerYSort && (layer.type === 'image' || isFolderRow) && (
                    <YSortMenuItem
                      own={layer.ySort}
                      inherited={inheritedLayerYSort(layer, layers)}
                      from={held ? 'folder' : undefined}
                      title={isFolderRow ? 'The image layers inside follow this, unless they say otherwise' : 'Pictures of this layer draw among the characters by how far down they stand'}
                      onChange={(v) => setLayerYSort(layer.id, v)}
                    />
                  )}
                  {setLayerYSort && layer.type === 'tile' && (
                    <YSortMenuItem own={false} inherited={false} disabled title="Tile layers draw as one piece; put pictures on an image layer to y-sort them" onChange={() => {}} />
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => confirmDeleteLayer(layer)}
                    className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    {isFolderRow ? 'Delete Folder' : 'Delete Layer'}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">{createMenu(createLayerOfType)}</ContextMenuContent>
    </ContextMenu>
  )
}
