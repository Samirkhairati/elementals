// The Scene panel (dock panel `layers`): the map's whole scene tree as one list. Every node is one row from the same row
// component: its icon, name, badges, eye and lock; containers (groups, image layers, collision layers) open and close.
// A container lists its children last first, so the top row is the one drawn on top. Click selects (Ctrl/Cmd+click adds,
// Shift+click picks a range), double-click renames, drag moves between any places the placement rules allow (the lower half
// of a container's row drops inside it) and right-click opens the menu of that kind of node.

import React, { memo, useEffect, useMemo, useState } from 'react'
import {
  Box,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Droplet,
  Edit2,
  Eye,
  EyeOff,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Grid3x3,
  Group as GroupIcon,
  Image as ImageIcon,
  ImagePlus,
  Layers as LayersIcon,
  Leaf,
  Lock,
  Pentagon,
  Plus,
  Stamp,
  Trash2,
  Ungroup,
  Unlock,
  Users,
  XSquare,
  ArrowDown,
  ArrowUp,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { EntityData } from '@/types/editor'
import {
  NODE_TYPES,
  canHold,
  collisionItemsOf,
  drawOrderPictures,
  effectiveYSort,
  inheritedYSort,
  isContainer,
  isLayerNode,
  walkPanel,
  type SceneNode,
  type SceneNodeType,
  type WalkEntry,
} from '../../../../../shared/sceneTree'
import { sceneIndex } from '@/lib/sceneIndex'
import { canDrop, countWithin, parentPathFor, topLevelIds, type DropWhere, type NewNodeType } from '@/lib/sceneOps'
import { useEditorClipboard } from '@/store/editorClipboard'
import { describeBindings } from '@/lib/shortcuts'
import { useBindings } from '@/store/shortcutStore'
import { imagePickName } from '@/lib/graphicAssets'
import { entityIconName, summarizeEntity } from '@/lib/entityVisuals'
import { openEventEditor } from '@/lib/openEventEditor'
import { openPicturePicker } from '@/lib/picturePickerEvent'
import { usePolygonEdit } from '@/lib/polygonEditStore'
import { hasShadow } from '@/lib/look/lookEdit'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { YSortBadge, YSortMenuItem } from '../ui/YSortMenuItem'
import { DropShadowMenuItem, useDropShadow } from '../look/DropShadowMenuItem'
import { Badge, IconButton } from '../ui/controls'
import { NamedIcon } from '../ui/icons'
import { RenameInput } from '../ui/RenameInput'
import { SpriteThumb } from '../sprites/SpriteThumb'
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
import { EntitySubmenu, entityCreators } from './EntityMenu'
import { CollisionItemIcon, pickCollisionItem } from './CollisionPanel'

// ── what a row looks like ──────────────────────────────────────────────────────────────────────────

const ICONS: Record<string, LucideIcon> = {
  folder: FolderIcon,
  layers: LayersIcon,
  image: ImageIcon,
  'square-x': XSquare,
  'grid-3x3': Grid3x3,
  pentagon: Pentagon,
  droplet: Droplet,
  leaf: Leaf,
  box: Box,
  user: Users,
}

/** The layer kinds the New menus offer, with their hint. */
const NEW_KINDS: { type: Exclude<NewNodeType, 'group'>; title: string }[] = [
  { type: 'tile', title: 'Paint tiles from a tileset' },
  { type: 'image', title: 'Place pictures and sprites anywhere' },
  { type: 'collision', title: 'Painted tiles and shapes that block movement' },
  { type: 'terrain', title: 'Ground kinds (water, sand...)' },
  { type: 'encounters', title: 'Where wild encounters happen' },
  { type: 'objects', title: 'Object markers' },
]

function NodeIcon({ node, open }: { node: SceneNode; open: boolean }) {
  if (node.type === 'group') return open ? <FolderOpen style={{ color: NODE_TYPES.group.accent }} /> : <FolderIcon style={{ color: NODE_TYPES.group.accent }} />
  const info = NODE_TYPES[node.type]
  const Icon = ICONS[info.icon] ?? LayersIcon
  return <Icon style={{ color: info.accent }} />
}

const selectSpriteAssets = (c: EditorContextValue) => c.spriteAssets

/** Sprite thumbnail when the entity has a sprite, otherwise the icon for what it is (npc, sign, warp ...). */
function EntityGlyph({ entity }: { entity: EntityData }) {
  const assets = useEditorSelector(selectSpriteAssets)
  const asset = entity.components.Sprite?.asset ? assets?.[entity.components.Sprite.asset] : undefined
  if (asset) return <SpriteThumb asset={asset} size={20} />
  return <NamedIcon name={entityIconName(entity)} className="text-muted-foreground" />
}

function EntityBadges({ entity }: { entity: EntityData }) {
  const s = summarizeEntity(entity)
  return (
    <>
      {s.hasEvent && (
        <Badge tone="event" title="Has an Event">
          <NamedIcon name="zap" />
        </Badge>
      )}
      {s.controller && s.controller !== 'none' && (
        <Badge tone="move" title={`Movement: ${s.controller}`}>
          <NamedIcon name="footprints" />
        </Badge>
      )}
      {s.solid === true && (
        <Badge tone="solid" title="Solid collider">
          solid
        </Badge>
      )}
      {s.solid === false && (
        <Badge tone="trigger" title="Trigger zone (not solid)">
          zone
        </Badge>
      )}
    </>
  )
}

const nameOfPicture = (n: SceneNode) => (n.type === 'picture' ? n.name || imagePickName(n) : n.name)
const isCollisionItem = (t: SceneNodeType) => t === 'collisionTiles' || t === 'collisionShape'

/** Everything a row shows and reacts to: plain values, so a row only redraws when something about it changed. */
interface RowInfo {
  node: SceneNode
  depth: number
  /** A group above it is hidden. */
  hiddenAbove: boolean
  /** A group or layer above it is locked. */
  lockedAbove: boolean
  /** It y-sorts and from where (own, or followed from above). */
  ySort: false | 'own' | 'inherited'
  /** A picture group (inside an image layer) is locked as a unit: clicking a member picks the whole group. */
  pictureGroup: boolean
}

/** Locked by a node above: a locked group inside an image layer does not count (it only makes its pictures pick as one). */
function lockedAbove(ancestors: readonly SceneNode[]): boolean {
  let inImage = false
  for (const a of ancestors) {
    if (a.locked === true && !(inImage && a.type === 'group')) return true
    if (a.type === 'image') inImage = true
  }
  return false
}

function rowInfos(entries: readonly WalkEntry[]): RowInfo[] {
  return entries.map(({ node, ancestors, depth }) => ({
    node,
    depth,
    hiddenAbove: ancestors.some((a) => a.visible === false),
    lockedAbove: lockedAbove(ancestors),
    ySort: node.type === 'group' || node.type === 'image' || node.type === 'picture' ? (effectiveYSort(node, ancestors) ? (node.ySort === undefined ? 'inherited' : 'own') : false) : false,
    pictureGroup: node.type === 'group' && ancestors.some((a) => a.type === 'image'),
  }))
}

// ── one row ────────────────────────────────────────────────────────────────────────────────────────

interface RowProps {
  info: RowInfo
  selected: boolean
  multi: boolean
  editing: boolean
  dragging: boolean
  /** Where a dragged node would land on this row (a line above / below it, or highlighted for inside). */
  drop: DropWhere | null
  /** A collision item is the picked one of its layer. */
  picked: boolean
  handlers: RowHandlers
}

interface RowHandlers {
  onClick: (e: React.MouseEvent, node: SceneNode) => void
  onChevron: (id: string) => void
  onRename: (id: string, name: string) => void
  onStartRename: (id: string) => void
  onStopRename: () => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, node: SceneNode) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent, node: SceneNode) => void
  renderMenu: (id: string) => React.ReactNode
}

const SceneRow = memo(function SceneRow({ info, selected, multi, editing, dragging, drop, picked, handlers }: RowProps) {
  const { node, depth } = info
  const container = isContainer(node)
  const open = container && node.collapsed !== true
  const item = isCollisionItem(node.type)
  const hidden = node.visible === false || info.hiddenAbove
  const locked = node.locked === true
  const kind = NODE_TYPES[node.type]
  const entity = node.type === 'entity' ? (node as unknown as EntityData) : null
  const label = nameOfPicture(node)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="ed-row group"
          style={{ marginLeft: depth * 14, width: `calc(100% - ${depth * 14}px)` }}
          data-testid={`scene-row-${node.id}`}
          data-node-type={node.type}
          data-selected={selected || picked ? 'true' : undefined}
          data-multi={multi ? 'true' : undefined}
          data-dim={hidden || dragging ? 'true' : undefined}
          data-drop={drop === 'inside' ? 'true' : undefined}
          draggable={!editing && !info.lockedAbove}
          onClick={(e) => handlers.onClick(e, node)}
          onDoubleClick={() => handlers.onStartRename(node.id)}
          onDragStart={(e) => handlers.onDragStart(e, node.id)}
          onDragOver={(e) => handlers.onDragOver(e, node)}
          onDragEnd={handlers.onDragEnd}
          onDrop={(e) => handlers.onDrop(e, node)}
        >
          {drop && drop !== 'inside' && (
            <div className={`pointer-events-none absolute left-0 right-0 z-30 h-[2px] rounded-full bg-primary ${drop === 'above' ? '-top-[2px]' : '-bottom-[2px]'}`} data-testid="drop-line" />
          )}
          {container ? (
            <button
              type="button"
              className="ed-iconbtn"
              aria-label={open ? `Close ${node.name}` : `Open ${node.name}`}
              aria-expanded={open}
              onClick={(e) => {
                e.stopPropagation()
                handlers.onChevron(node.id)
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {open ? <ChevronDown /> : <ChevronRight />}
            </button>
          ) : (
            <span className="ed-icon" aria-hidden />
          )}
          {entity ? (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center">
              <EntityGlyph entity={entity} />
            </div>
          ) : node.type === 'collisionTiles' || node.type === 'collisionShape' ? (
            <CollisionItemIcon item={{ kind: node.type === 'collisionTiles' ? 'tiles' : 'shape', closed: node.type === 'collisionShape' ? node.closed : undefined }} className="text-red-300" />
          ) : (
            <NodeIcon node={node} open={open} />
          )}

          {editing ? (
            <RenameInput initial={label} label={`${kind.label} name`} onRename={(name) => handlers.onRename(node.id, name)} onClose={handlers.onStopRename} className="h-row-sm border-primary/60" />
          ) : (
            <span className="ed-row-label" title={label}>
              {label}
            </span>
          )}

          <div className="ed-row-actions" onDoubleClick={(e) => e.stopPropagation()}>
            {info.ySort && <YSortBadge inherited={info.ySort === 'inherited'} />}
            {node.type === 'picture' && node.crop && (
              <span className="ed-badge" title={`Shows ${node.crop.w}×${node.crop.h} px of the picture, from ${node.crop.x}, ${node.crop.y}`}>
                crop
              </span>
            )}
            {entity && <EntityBadges entity={entity} />}
            {container && (
              <span className="ed-badge" data-tone="count" title={node.type === 'image' ? 'Pictures and groups in this layer' : node.type === 'collision' ? 'Items in this layer (sets of tiles and shapes)' : 'Nodes in this group'} data-testid="node-count">
                {node.type === 'image' ? <ImageIcon /> : node.type === 'collision' ? <XSquare /> : <LayersIcon />}
                {node.type === 'collision' ? collisionItemsOf(node).length : node.children.length}
              </span>
            )}
            {item && (
              <span className="ed-badge" data-tone="count" title={node.type === 'collisionTiles' ? 'Painted tiles item' : 'Points'}>
                {node.type === 'collisionShape' ? `${node.points.length} pts` : 'tiles'}
              </span>
            )}
            {(isLayerNode(node) && node.type !== 'collision' && node.type !== 'image') || (node.type === 'image') ? (
              <span className="ed-badge" data-tone="z" title="z-index, the layer's draw order in the game: higher draws on top" data-testid="layer-z">
                z {(node as { z?: number }).z ?? 0}
              </span>
            ) : null}
            {node.type === 'picture' && node.z !== undefined && node.z !== 0 && (
              <span className="ed-badge" data-tone="z" title="z-index inside the image layer: higher draws on top">
                z {node.z}
              </span>
            )}
            {!item && (
              <>
                {(locked || info.lockedAbove) && !info.pictureGroup ? (
                  <IconButton
                    title={locked ? 'Locked: click to unlock' : 'Locked by a group above'}
                    aria-label={locked ? `Unlock ${node.name}` : `Locked by a group above`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (locked) handlers.onToggleLock(node.id)
                    }}
                  >
                    <Lock className="text-amber-400" />
                  </IconButton>
                ) : (
                  <IconButton
                    title={info.pictureGroup ? 'Lock this group: clicking one of its pictures on the map picks the whole group' : 'Lock'}
                    aria-label={`Lock ${node.name}`}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      handlers.onToggleLock(node.id)
                    }}
                  >
                    <Unlock />
                  </IconButton>
                )}
                {info.pictureGroup && locked && (
                  <span title="Locked: clicking a picture on the map picks the whole group. Select the group here to pick single pictures." className="flex h-6 w-6 items-center justify-center">
                    <Lock className="text-amber-400" />
                  </span>
                )}
                <IconButton
                  title={node.visible === false ? 'Show' : 'Hide'}
                  aria-label={node.visible === false ? `Show ${node.name}` : `Hide ${node.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlers.onToggleVisible(node.id)
                  }}
                >
                  {node.visible === false ? <EyeOff className="text-amber-400/90" /> : <Eye />}
                </IconButton>
              </>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>{handlers.renderMenu(node.id)}</ContextMenuContent>
    </ContextMenu>
  )
})

// ── menus ──────────────────────────────────────────────────────────────────────────────────────────

const selectMenu = (c: EditorContextValue) => ({
  nodes: c.activeMap?.nodes,
  view: c.selectionView,
  selectNode: c.selectNode,
  createNode: c.createNode,
  renameNode: c.renameNode,
  toggleNodeVisibility: c.toggleNodeVisibility,
  toggleNodeLock: c.toggleNodeLock,
  setNodeYSort: c.setNodeYSort,
  setNodesYSort: c.setNodesYSort,
  deleteNodes: c.deleteNodes,
  copyNodes: c.copyNodes,
  pasteNodes: c.pasteNodes,
  duplicateNodes: c.duplicateNodes,
  groupNodes: c.groupNodes,
  ungroupNode: c.ungroupNode,
  reorderImage: c.reorderImage,
  placeMultiple: c.placeMultiple,
  startPlacement: c.startPlacement,
  handleCreateEntity: c.handleCreateEntity,
  setConfirmDialog: c.setConfirmDialog,
})

const NO_NODES: SceneNode[] = []

/** The right-click menu of one row, built when it opens. */
function RowMenu({ id, onRename }: { id: string; onRename: (id: string) => void }) {
  const ctx = useEditorSelector(selectMenu)
  const bindings = useBindings()
  const dropShadow = useDropShadow()
  const canPaste = useEditorClipboard((s) => s.content?.kind === 'nodes')
  const nodes = ctx.nodes ?? NO_NODES
  const index = sceneIndex(nodes)
  const entry = index.byId.get(id)
  if (!entry) return null
  const { node, ancestors } = entry
  const keys = {
    copy: describeBindings('edit.copy', bindings),
    paste: describeBindings('edit.paste', bindings),
    duplicate: describeBindings('edit.duplicate', bindings),
    layer: describeBindings('layer.new', bindings),
    group: describeBindings('layer.newFolder', bindings),
    place: describeBindings('image.placeMultiple', bindings),
    ungroup: describeBindings('image.ungroup', bindings),
  }
  const { placeNew, placePrefab } = entityCreators({ startPlacement: ctx.startPlacement, createEntity: ctx.handleCreateEntity })
  // The row is part of the selection: the command acts on all of it, otherwise on this row alone.
  const targets = ctx.view.ids.includes(id) ? ctx.view.ids : [id]
  const tops = topLevelIds(nodes, targets)
  const lockedHere = node.locked === true
  const inImage = ancestors.some((a) => a.type === 'image')
  const pictureGroup = node.type === 'group' && inImage
  const item = isCollisionItem(node.type)
  const hidden = node.visible === false
  // New nodes go inside this row when it can hold them, else beside it.
  const anchor = id
  // A picture's place in its layer's draw order: the backmost cannot go further back, the frontmost not further forward.
  const imageLayer = ancestors.find((a) => a.type === 'image')
  const drawOrder = node.type === 'picture' && imageLayer ? drawOrderPictures(imageLayer) : []
  const drawPlace = drawOrder.findIndex((p) => p.id === id)
  const drawCount = drawOrder.length

  const confirmDelete = () => {
    const ids = tops.length > 0 ? tops : [id]
    const withIn = countWithin(nodes, ids)
    const only = ids.length === 1 ? node : null
    if (ids.every((n) => ['picture', 'collisionTiles', 'collisionShape'].includes(index.byId.get(n)?.node.type ?? ''))) {
      ctx.deleteNodes(ids)
      return
    }
    const description = only
      ? `Are you sure you want to delete ${only.type === 'entity' ? 'entity' : only.type === 'group' ? 'the group' : 'layer'} "${only.name}"${withIn > 1 ? ` and the ${withIn - 1} node${withIn === 2 ? '' : 's'} inside it` : ''}?`
      : `Are you sure you want to delete these ${ids.length} nodes${withIn > ids.length ? ` and what is inside them (${withIn} in all)` : ''}?`
    setTimeout(() => {
      ctx.setConfirmDialog({ open: true, title: only ? (only.type === 'entity' ? 'Delete Entity' : only.type === 'group' ? 'Delete Group' : 'Delete Layer') : 'Delete Nodes', description, action: () => ctx.deleteNodes(ids) })
    }, 0)
  }

  /** New layer / group / entity entries, made inside this row's container or beside it. */
  const newItems = !item && (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Plus />
          New Layer
          {keys.layer && <ContextMenuShortcut>{keys.layer}</ContextMenuShortcut>}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {NEW_KINDS.map(({ type, title }) => {
            const info = NODE_TYPES[type]
            const Icon = ICONS[info.icon] ?? LayersIcon
            const taken = !canHold(parentPathFor(nodes, type, anchor), type, nodes)
            return (
              <ContextMenuItem key={type} disabled={taken} title={taken ? 'A map has one of these (or it cannot go here)' : title} onClick={() => ctx.createNode(type, anchor)}>
                <Icon style={{ color: info.accent }} />
                {info.label}
              </ContextMenuItem>
            )
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onClick={() => ctx.createNode('group', anchor)}>
        <FolderPlus style={{ color: NODE_TYPES.group.accent }} />
        New Group
        {keys.group && <ContextMenuShortcut>{keys.group}</ContextMenuShortcut>}
      </ContextMenuItem>
      {!inImage && node.type !== 'collision' && (
        <EntitySubmenu
          onNew={() => {
            ctx.selectNode(anchor)
            placeNew(anchor)
          }}
          onPrefab={(p) => {
            ctx.selectNode(anchor)
            placePrefab(p, anchor)
          }}
        />
      )}
    </>
  )

  return (
    <>
      {node.type === 'entity' && (node as unknown as EntityData).components.Event && (
        <ContextMenuItem
          onClick={() => {
            ctx.selectNode(id)
            // let the inspector render the selected entity's Event card first
            openEventEditor(id, 60)
          }}
        >
          <Zap className="ed-icon text-blue-400" />
          Edit event…
        </ContextMenuItem>
      )}
      <ContextMenuItem onClick={() => onRename(id)}>
        <Edit2 />
        Rename
      </ContextMenuItem>
      {(node.type === 'image' || pictureGroup) && (
        <ContextMenuItem
          disabled={lockedHere}
          onClick={() => {
            ctx.selectNode(id)
            openPicturePicker()
          }}
        >
          <ImagePlus />
          {pictureGroup ? 'Add picture inside…' : 'Add picture…'}
        </ContextMenuItem>
      )}
      {node.type === 'picture' && (
        <ContextMenuItem
          disabled={lockedHere}
          onClick={() => ctx.placeMultiple(imageLayer?.id ?? '', id)}
          title="Click the map to add more copies: same picture, crop, scale and flips"
        >
          <Stamp />
          Place more copies
          {keys.place && <ContextMenuShortcut>{keys.place}</ContextMenuShortcut>}
        </ContextMenuItem>
      )}
      {node.type === 'picture' && (
        <>
          <ContextMenuItem disabled={lockedHere || drawPlace === drawCount - 1} onClick={() => ctx.reorderImage(imageLayer?.id ?? '', id, 1)}>
            <ArrowUp />
            Bring forward
          </ContextMenuItem>
          <ContextMenuItem disabled={lockedHere || drawPlace === 0} onClick={() => ctx.reorderImage(imageLayer?.id ?? '', id, -1)}>
            <ArrowDown />
            Send backward
          </ContextMenuItem>
        </>
      )}
      {newItems && <ContextMenuSeparator />}
      {newItems}
      {!item && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => ctx.copyNodes(tops)}>
            <Copy />
            Copy
            {keys.copy && <ContextMenuShortcut>{keys.copy}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => ctx.duplicateNodes(tops)}>
            <CopyPlus />
            Duplicate
            {keys.duplicate && <ContextMenuShortcut>{keys.duplicate}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canPaste}
            onClick={() => ctx.pasteNodes(id)}
            title={isContainer(node) ? 'Pastes into this one (what cannot go inside goes below it)' : 'Pastes next to this one'}
          >
            <ClipboardPaste />
            {isContainer(node) ? 'Paste inside' : 'Paste'}
            {keys.paste && <ContextMenuShortcut>{keys.paste}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem disabled={tops.length === 0 || tops.some((t) => !index.byId.get(t) || ['collisionTiles', 'collisionShape'].includes(index.byId.get(t)!.node.type))} onClick={() => ctx.groupNodes(tops)} title="Put the selected nodes in one new group">
            <GroupIcon />
            {tops.length > 1 ? `Group ${tops.length} nodes` : 'Group'}
          </ContextMenuItem>
          {node.type === 'group' && (
            <ContextMenuItem onClick={() => ctx.ungroupNode(id)} title="What is inside stays where it is, in the group's place">
              <Ungroup />
              Ungroup
              {pictureGroup && keys.ungroup && <ContextMenuShortcut>{keys.ungroup}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => ctx.toggleNodeVisibility(id)}>
            {hidden ? <Eye /> : <EyeOff />}
            {hidden ? 'Show' : 'Hide'}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => ctx.toggleNodeLock(id)} title={pictureGroup ? (lockedHere ? 'Clicking a picture on the map picks just that picture again' : 'Clicking any picture of the group on the map picks the whole group') : undefined}>
            {lockedHere ? <Unlock /> : <Lock />}
            {lockedHere ? 'Unlock' : 'Lock'}
          </ContextMenuItem>
          {(node.type === 'image' || node.type === 'group' || node.type === 'picture') && (
            <YSortMenuItem
              own={node.ySort}
              inherited={inheritedYSort(ancestors)}
              from={ancestors.length > 0 ? (pictureGroup || node.type === 'picture' ? 'group / layer' : 'group') : undefined}
              disabled={lockedHere}
              title={node.type === 'picture' ? 'Draw among the characters by how far down the picture stands' : 'The pictures and image layers inside follow this, unless they say otherwise'}
              onChange={(v) => (node.type === 'picture' ? ctx.setNodesYSort(targets.filter((t) => index.byId.get(t)?.node.type === 'picture'), v) : ctx.setNodeYSort(id, v))}
            />
          )}
          {node.type === 'tile' && <YSortMenuItem own={false} inherited={false} disabled title="Tile layers draw as one piece; put pictures on an image layer to y-sort them" onChange={() => {}} />}
          {(node.type === 'tile' || node.type === 'image') && <DropShadowMenuItem has={hasShadow(node.look)} onClick={() => dropShadow({ kind: 'layer', layerId: id })} />}
          {node.type === 'picture' && <DropShadowMenuItem has={hasShadow(node.look)} disabled={lockedHere} onClick={() => dropShadow({ kind: 'picture', layerId: imageLayer?.id ?? '', imageId: id })} />}
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={confirmDelete} destructive>
        <Trash2 />
        {item ? (node.type === 'collisionTiles' ? 'Delete tiles item' : 'Delete shape') : pictureGroup ? (node.type === 'group' && node.children.length > 0 ? 'Delete Group and Pictures' : 'Delete Group') : node.type === 'group' ? 'Delete Group' : node.type === 'entity' ? 'Delete Entity' : node.type === 'picture' ? (tops.length > 1 ? `Delete ${tops.length} nodes` : 'Delete') : 'Delete Layer'}
      </ContextMenuItem>
    </>
  )
}

/** The menu of the panel's empty space: new layers, groups and entities at the top of the map. */
function BackgroundMenu() {
  const ctx = useEditorSelector(selectMenu)
  const bindings = useBindings()
  const canPaste = useEditorClipboard((s) => s.content?.kind === 'nodes')
  const nodes = ctx.nodes ?? NO_NODES
  const { placeNew, placePrefab } = entityCreators({ startPlacement: ctx.startPlacement, createEntity: ctx.handleCreateEntity })
  const layerKeys = describeBindings('layer.new', bindings)
  const groupKeys = describeBindings('layer.newFolder', bindings)
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Plus />
          New Layer
          {layerKeys && <ContextMenuShortcut>{layerKeys}</ContextMenuShortcut>}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {NEW_KINDS.map(({ type, title }) => {
            const info = NODE_TYPES[type]
            const Icon = ICONS[info.icon] ?? LayersIcon
            const taken = !canHold([], type, nodes)
            return (
              <ContextMenuItem key={type} disabled={taken} title={taken ? 'A map has one of these' : title} onClick={() => ctx.createNode(type, null)}>
                <Icon style={{ color: info.accent }} />
                {info.label}
              </ContextMenuItem>
            )
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onClick={() => ctx.createNode('group', null)}>
        <FolderPlus style={{ color: NODE_TYPES.group.accent }} />
        New Group
        {groupKeys && <ContextMenuShortcut>{groupKeys}</ContextMenuShortcut>}
      </ContextMenuItem>
      <EntitySubmenu onNew={() => placeNew(null)} onPrefab={(p) => placePrefab(p, null)} />
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canPaste} onClick={() => ctx.pasteNodes(null)}>
        <ClipboardPaste />
        Paste
      </ContextMenuItem>
    </>
  )
}

// ── the panel ──────────────────────────────────────────────────────────────────────────────────────

const selectPanel = (c: EditorContextValue) => ({
  setFocusedDomain: c.setFocusedDomain,
  nodes: c.activeMap?.nodes,
  hasActiveMap: !!c.activeMap,
  view: c.selectionView,
  selectNode: c.selectNode,
  clearSelection: c.clearSelection,
  justCreatedLayer: c.justCreatedLayer,
  renameNode: c.renameNode,
  toggleNodeVisibility: c.toggleNodeVisibility,
  toggleNodeLock: c.toggleNodeLock,
  toggleCollapsed: c.toggleCollapsed,
  moveNodes: c.moveNodes,
})

/** What a drag over a row means: the top half drops above it, the bottom half below it, and the lower half of a container inside it. */
export function dropWhere(node: SceneNode, fraction: number): DropWhere {
  if (isContainer(node)) return fraction < 0.5 ? 'above' : 'inside'
  return fraction < 0.5 ? 'above' : 'below'
}

export function SceneTree() {
  const ctx = useEditorSelector(selectPanel)
  const { view } = ctx
  const nodes = ctx.nodes ?? NO_NODES
  const [editingId, setEditingId] = useState<string | null>(null)
  // What is being dragged and where it would land: refs for the handlers (so the rows' handlers stay the same objects while a
  // drag moves over them) and state for what the rows show.
  const draggedRef = React.useRef<string[] | null>(null)
  const dropRef = React.useRef<{ id: string; where: DropWhere } | null>(null)
  const [dragged, setDragged] = useState<string[] | null>(null)
  const [dropAt, setDropAtState] = useState<{ id: string; where: DropWhere } | null>(null)
  const setDrop = (next: { id: string; where: DropWhere } | null) => {
    dropRef.current = next
    setDropAtState((cur) => (cur?.id === next?.id && cur?.where === next?.where ? cur : next))
  }
  const pickedItem = usePolygonEdit().selectedShapeId

  // A layer or group that was just created opens its name for typing, so Ctrl+N then a name is all it takes.
  useEffect(() => {
    // After a beat: a right-click menu that made the node is still closing and would take the focus from the field.
    if (!ctx.justCreatedLayer) return
    const id = ctx.justCreatedLayer.id
    const timer = setTimeout(() => setEditingId(id), 60)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.justCreatedLayer?.n])

  const rows = useMemo(() => rowInfos(walkPanel(nodes, { closed: true })), [nodes])
  const { selectNode, clearSelection, toggleCollapsed, toggleNodeLock, toggleNodeVisibility, renameNode, moveNodes } = ctx
  const viewRef = React.useRef(view)
  viewRef.current = view
  const nodesRef = React.useRef(nodes)
  nodesRef.current = nodes

  const handlers = useMemo<RowHandlers>(
    () => ({
      onClick: (e, node) => {
        if (node.type === 'collisionTiles' || node.type === 'collisionShape') {
          // A collision item picks its layer and becomes the item the Collision panel paints into / edits.
          const owner = sceneIndex(nodesRef.current).byId.get(node.id)?.ancestors.find((a) => a.type === 'collision')
          if (owner) selectNode(owner.id)
          pickCollisionItem(
            node.type === 'collisionTiles'
              ? { kind: 'tiles', id: node.id, name: node.name, count: 0 }
              : { kind: 'shape', id: node.id, name: node.name, closed: node.closed, count: node.points.length }
          )
          return
        }
        const mode = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'replace'
        const v = viewRef.current
        // Clicking the only selected layer again deselects it.
        if (mode === 'replace' && v.primaryId === node.id && v.ids.length === 1 && node.type !== 'entity' && node.type !== 'picture') clearSelection()
        else selectNode(node.id, mode)
      },
      onChevron: toggleCollapsed,
      onRename: renameNode,
      onStartRename: (id) => setEditingId(id),
      onStopRename: () => setEditingId(null),
      onToggleVisible: toggleNodeVisibility,
      onToggleLock: toggleNodeLock,
      onDragStart: (e, id) => {
        e.stopPropagation()
        const v = viewRef.current
        const ids = v.ids.includes(id) ? v.ids : [id]
        draggedRef.current = ids
        setDragged(ids)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
      },
      onDragOver: (e, node) => {
        const ids = draggedRef.current
        if (!ids) return
        const rect = e.currentTarget.getBoundingClientRect()
        const where = dropWhere(node, (e.clientY - rect.top) / rect.height)
        if (!canDrop(nodesRef.current, ids, node.id, where)) {
          setDrop(null)
          return
        }
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDrop({ id: node.id, where })
      },
      onDragEnd: () => {
        draggedRef.current = null
        setDragged(null)
        setDrop(null)
      },
      onDrop: (e, node) => {
        e.preventDefault()
        e.stopPropagation()
        const ids = draggedRef.current
        const drop = dropRef.current
        if (ids && drop?.id === node.id) moveNodes(ids, node.id, drop.where)
        draggedRef.current = null
        setDragged(null)
        setDrop(null)
      },
      renderMenu: (id) => <RowMenu id={id} onRename={(rid) => void setTimeout(() => setEditingId(rid), 60)} />,
    }),
    [selectNode, clearSelection, toggleCollapsed, renameNode, toggleNodeVisibility, toggleNodeLock, moveNodes]
  )

  if (!ctx.hasActiveMap) return <div className="ed-empty">Select a map to view its scene</div>

  const draggedSet = new Set(dragged ?? [])
  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full h-full w-full">
        <div
          className="flex min-h-full h-full w-full flex-col gap-0.5"
          data-testid="scene-tree"
          onClick={() => ctx.setFocusedDomain('layers')}
        >
          {rows.length === 0 && (
            <div className="ed-empty">
              <p>Nothing in this map yet.</p>
              <p className="ed-hint">Right-click here to add a layer.</p>
            </div>
          )}
          {rows.map((info) => (
            <SceneRow
              key={info.node.id}
              info={info}
              selected={view.primaryId === info.node.id}
              multi={view.primaryId !== info.node.id && view.ids.includes(info.node.id)}
              editing={editingId === info.node.id}
              dragging={draggedSet.has(info.node.id)}
              drop={dropAt?.id === info.node.id ? dropAt.where : null}
              picked={pickedItem === info.node.id && isCollisionItem(info.node.type)}
              handlers={handlers}
            />
          ))}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <BackgroundMenu />
      </ContextMenuContent>
    </ContextMenu>
  )
}
