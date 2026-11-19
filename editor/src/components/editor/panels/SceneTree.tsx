// The Scene panel (dock panel `layers`): the map's whole scene tree as one list. Every node is one row from the same row
// component: its icon, name, badges, eye and lock; containers (Node2D, YSort, entities, bodies...) open and close.
// Right-click › Add Child Node offers what the node may hold (shared/sceneTree.ts `canHold`): an entity holds its
// components, a StaticBody2D or Area2D a CollisionShape2D, a sprite or TileMap a Look.
// A container lists its children last first, so the top row is the one drawn on top. Click selects (Ctrl/Cmd+click adds,
// Shift+click picks a range), double-click renames, drag moves between any places the placement rules allow (the lower half
// of a container's row drops inside it) and right-click opens the menu of that kind of node.

import React, { memo, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownWideNarrow,
  Box,
  BrickWall,
  CircleDot,
  Clapperboard,
  Footprints,
  Gamepad2,
  Grid2x2,
  Move,
  Palette,
  Scan,
  User,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Droplet,
  Edit2,
  Eye,
  EyeOff,
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
  childTypesOf,
  collisionItemsOf,
  drawOrderPictures,
  effectiveYSort,
  isBranch,
  isContainer,
  isLayerNode,
  ownLook,
  walkPanel,
  type NodeCategory,
  type SceneNode,
  type SceneNodeType,
  type WalkEntry,
} from '../../../../../shared/sceneTree'
import { entityView, sceneIndex } from '@/lib/sceneIndex'
import { canDrop, countWithin, topLevelIds, type DropWhere } from '@/lib/sceneOps'
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
import { YSortBadge } from '../ui/YSortMenuItem'
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

/** The lucide icon of each `NODE_TYPES` icon name. */
const ICONS: Record<string, LucideIcon> = {
  'circle-dot': CircleDot,
  'arrow-down-wide-narrow': ArrowDownWideNarrow,
  'grid-2x2': Grid2x2,
  image: ImageIcon,
  palette: Palette,
  'brick-wall': BrickWall,
  'grid-3x3': Grid3x3,
  pentagon: Pentagon,
  droplet: Droplet,
  leaf: Leaf,
  box: Box,
  user: User,
  clapperboard: Clapperboard,
  scan: Scan,
  footprints: Footprints,
  'gamepad-2': Gamepad2,
  move: Move,
  zap: Zap,
}

export function NodeTypeIcon({ type, className }: { type: SceneNodeType; className?: string }) {
  const info = NODE_TYPES[type]
  const Icon = ICONS[info.icon] ?? LayersIcon
  return <Icon className={className} style={{ color: info.accent }} />
}

function NodeIcon({ node }: { node: SceneNode }) {
  return <NodeTypeIcon type={node.type} />
}

/** A short readout of a component node's settings for its row. */
function componentBadge(node: SceneNode): string | null {
  if (node.type === 'animatedSprite') return typeof node.props.asset === 'string' && node.props.asset ? node.props.asset.split('/').pop() ?? null : 'no sprite'
  if (node.type === 'wander' || node.type === 'playerController' || node.type === 'mover') return typeof node.props.speed === 'number' ? `${node.props.speed} px/s` : null
  if (node.type === 'event') return Array.isArray(node.props.states) ? `${node.props.states.length} state${node.props.states.length === 1 ? '' : 's'}` : null
  if (node.type === 'collisionShape' && node.box) return `${node.box.width}×${node.box.height}`
  return null
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

// A node without a name (an entity's collision shape, say) shows its type's label.
const nameOfPicture = (n: SceneNode) => (n.type === 'picture' ? n.name || imagePickName(n) : n.name || NODE_TYPES[n.type].label)
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
  /** A Node2D / YSort whose sprites a click on the map picks as one (`pickAsOne`). */
  pictureGroup: boolean
}

function rowInfos(entries: readonly WalkEntry[]): RowInfo[] {
  return entries.map(({ node, ancestors, depth }) => ({
    node,
    depth,
    hiddenAbove: ancestors.some((a) => a.visible === false),
    lockedAbove: ancestors.some((a) => a.locked === true),
    ySort: node.type === 'ySort' ? 'own' : (isBranch(node) || node.type === 'picture') && effectiveYSort(node, ancestors) ? 'inherited' : false,
    pictureGroup: isBranch(node) && node.pickAsOne === true,
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
  const entity = node.type === 'entity' ? (entityView(node) as unknown as EntityData) : null
  const label = nameOfPicture(node)
  const readout = componentBadge(node)

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
            <NodeIcon node={node} />
          )}

          {editing ? (
            <RenameInput initial={label} label={`${kind.label} name`} onRename={(name) => handlers.onRename(node.id, name)} onClose={handlers.onStopRename} className="h-row-sm border-primary/60" />
          ) : (
            <span className="ed-row-label" title={label}>
              {label}
            </span>
          )}

          <div className="ed-row-actions" onDoubleClick={(e) => e.stopPropagation()}>
            {info.ySort && node.type !== 'ySort' && <YSortBadge inherited={info.ySort === 'inherited'} />}
            {info.pictureGroup && (
              <span className="ed-badge" title="A click on one of its sprites on the map picks all of them (select this row to pick single ones)" data-testid="pick-as-one">
                <GroupIcon />
              </span>
            )}
            {readout && (
              <span className="ed-badge" title={readout}>
                {readout}
              </span>
            )}
            {node.type === 'picture' && node.crop && (
              <span className="ed-badge" title={`Shows ${node.crop.w}×${node.crop.h} px of the picture, from ${node.crop.x}, ${node.crop.y}`}>
                crop
              </span>
            )}
            {entity && <EntityBadges entity={entity} />}
            {container && (isBranch(node) || node.type === 'collision') && (
              <span className="ed-badge" data-tone="count" title={node.type === 'collision' ? 'Collision tiles and shapes in it' : 'Nodes inside'} data-testid="node-count">
                {node.type === 'collision' ? <XSquare /> : <LayersIcon />}
                {node.type === 'collision' ? collisionItemsOf(node).length : node.children.length}
              </span>
            )}
            {item && (
              <span className="ed-badge" data-tone="count" title={node.type === 'collisionTiles' ? 'Painted tiles item' : node.type === 'collisionShape' && node.box ? 'A box' : 'Points'}>
                {node.type === 'collisionShape' ? (node.box ? 'box' : `${node.points.length} pts`) : 'tiles'}
              </span>
            )}
            {(isLayerNode(node) && node.type !== 'collision') || (isBranch(node) && node.z !== undefined) ? (
              <span className="ed-badge" data-tone="z" title={isBranch(node) ? 'z-index of the sprites inside in the game: higher draws on top' : "z-index, the layer's draw order in the game: higher draws on top"} data-testid="layer-z">
                z {(node as { z?: number }).z ?? 0}
              </span>
            ) : null}
            {node.type === 'picture' && node.z !== undefined && node.z !== 0 && (
              <span className="ed-badge" data-tone="z" title="Draw order among the sprites next to it: higher draws on top">
                z {node.z}
              </span>
            )}
            {!item && (
              <>
                {locked || info.lockedAbove ? (
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
                    title="Lock"
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
  setPickAsOne: c.setPickAsOne,
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

const CATEGORY_LABELS: Record<NodeCategory, string> = { scene: 'Scene', drawing: 'Drawing', collision: 'Collision', entity: 'Entity', component: 'Components' }

/**
 * The node types that can go under `parentPath` (the map root when empty), grouped by category, each disabled when the
 * parent already has one of it (one Look, one sprite or movement per entity, one terrain per map...). A pick makes it.
 */
function AddNodeItems({ parentPath, nodes, onPick }: { parentPath: readonly SceneNode[]; nodes: readonly SceneNode[]; onPick: (type: SceneNodeType) => void }) {
  const bindings = useBindings()
  const types = childTypesOf(parentPath)
  const keyOf: Partial<Record<SceneNodeType, string>> = { tile: describeBindings('layer.new', bindings), group: describeBindings('layer.newFolder', bindings) }
  const categories = (Object.keys(CATEGORY_LABELS) as NodeCategory[]).filter((c) => types.some((t) => NODE_TYPES[t].category === c))
  return (
    <>
      {categories.map((category, i) => (
        <React.Fragment key={category}>
          {i > 0 && <ContextMenuSeparator />}
          {categories.length > 1 && <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[category]}</div>}
          {types
            .filter((t) => NODE_TYPES[t].category === category)
            .map((type) => {
              const info = NODE_TYPES[type]
              const free = canHold(parentPath, type, nodes)
              return (
                <ContextMenuItem key={type} disabled={!free} title={free ? info.description : 'It already has one of these'} onClick={() => onPick(type)} data-testid={`add-node-${type}`}>
                  <NodeTypeIcon type={type} />
                  {info.label}
                  {keyOf[type] && <ContextMenuShortcut>{keyOf[type]}</ContextMenuShortcut>}
                </ContextMenuItem>
              )
            })}
        </React.Fragment>
      ))}
    </>
  )
}

/** Makes a node of `type` inside the node `parentId` (null = the map root): entities are placed on the map, sprites picked from the library first. */
function useAddNode() {
  const ctx = useEditorSelector(selectMenu)
  const { placeNew } = entityCreators({ startPlacement: ctx.startPlacement, createEntity: ctx.handleCreateEntity })
  return (type: SceneNodeType, parentId: string | null) => {
    if (type === 'entity') {
      if (parentId) ctx.selectNode(parentId)
      placeNew(parentId)
      return
    }
    if (type === 'picture') {
      // The picture picker places the sprite into the selected Node2D / YSort.
      if (parentId) ctx.selectNode(parentId)
      openPicturePicker()
      return
    }
    ctx.createNode(type, parentId)
  }
}

/** The right-click menu of one row, built when it opens. */
function RowMenu({ id, onRename }: { id: string; onRename: (id: string) => void }) {
  const ctx = useEditorSelector(selectMenu)
  const bindings = useBindings()
  const dropShadow = useDropShadow()
  const addNode = useAddNode()
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
    place: describeBindings('image.placeMultiple', bindings),
    ungroup: describeBindings('image.ungroup', bindings),
  }
  const { placePrefab } = entityCreators({ startPlacement: ctx.startPlacement, createEntity: ctx.handleCreateEntity })
  // The row is part of the selection: the command acts on all of it, otherwise on this row alone.
  const targets = ctx.view.ids.includes(id) ? ctx.view.ids : [id]
  const tops = topLevelIds(nodes, targets)
  const lockedHere = node.locked === true
  const item = isCollisionItem(node.type)
  const component = NODE_TYPES[node.type].category === 'component'
  const hidden = node.visible === false
  const path = [...ancestors, node]
  const parent = ancestors[ancestors.length - 1]
  const canHaveChildren = childTypesOf(path).length > 0
  const siblingTypes = childTypesOf(ancestors)
  // A sprite's place in the draw order of the Node2D / YSort it sits in.
  const host = [...ancestors].reverse().find(isBranch)
  const drawOrder = node.type === 'picture' && host ? drawOrderPictures(host) : []
  const drawPlace = drawOrder.findIndex((p) => p.id === id)
  const drawCount = drawOrder.length
  const entity = node.type === 'entity' ? (entityView(node) as unknown as EntityData) : null
  const eventOwner = node.type === 'event' ? parent : entity?.components.Event ? node : null
  const entityHome = canHold(path, 'entity', nodes) ? id : canHold(ancestors, 'entity', nodes) ? (parent?.id ?? null) : undefined

  const confirmDelete = () => {
    const ids = tops.length > 0 ? tops : [id]
    const withIn = countWithin(nodes, ids)
    const only = ids.length === 1 ? node : null
    if (ids.every((n) => ['picture', 'collisionTiles', 'collisionShape', 'look'].includes(index.byId.get(n)?.node.type ?? '') || NODE_TYPES[index.byId.get(n)?.node.type ?? 'group'].category === 'component')) {
      ctx.deleteNodes(ids)
      return
    }
    const what = only ? NODE_TYPES[only.type].label : ''
    const description = only
      ? `Are you sure you want to delete the ${what} "${only.name}"${withIn > 1 ? ` and the ${withIn - 1} node${withIn === 2 ? '' : 's'} inside it` : ''}?`
      : `Are you sure you want to delete these ${ids.length} nodes${withIn > ids.length ? ` and what is inside them (${withIn} in all)` : ''}?`
    setTimeout(() => {
      ctx.setConfirmDialog({ open: true, title: only ? `Delete ${what}` : 'Delete Nodes', description, action: () => ctx.deleteNodes(ids) })
    }, 0)
  }

  return (
    <>
      {eventOwner && (
        <ContextMenuItem
          onClick={() => {
            ctx.selectNode(eventOwner.id)
            // let the inspector render the selected entity's Event card first
            openEventEditor(eventOwner.id, 60)
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
      {isBranch(node) && (
        <ContextMenuItem
          disabled={lockedHere}
          onClick={() => {
            ctx.selectNode(id)
            openPicturePicker()
          }}
        >
          <ImagePlus />
          Add Sprite2D…
        </ContextMenuItem>
      )}
      {node.type === 'picture' && (
        <>
          <ContextMenuItem disabled={lockedHere} onClick={() => ctx.placeMultiple(host?.id ?? '', id)} title="Click the map to add more copies: same picture, crop, scale and flips">
            <Stamp />
            Place more copies
            {keys.place && <ContextMenuShortcut>{keys.place}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem disabled={lockedHere || drawPlace === drawCount - 1} onClick={() => ctx.reorderImage(host?.id ?? '', id, 1)}>
            <ArrowUp />
            Bring forward
          </ContextMenuItem>
          <ContextMenuItem disabled={lockedHere || drawPlace === 0} onClick={() => ctx.reorderImage(host?.id ?? '', id, -1)}>
            <ArrowDown />
            Send backward
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      {canHaveChildren && (
        <ContextMenuSub>
          <ContextMenuSubTrigger data-testid="add-child-node">
            <Plus />
            Add Child Node
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <AddNodeItems parentPath={path} nodes={nodes} onPick={(type) => addNode(type, id)} />
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      {siblingTypes.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus />
            Add Sibling Node
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <AddNodeItems parentPath={ancestors} nodes={nodes} onPick={(type) => addNode(type, parent?.id ?? null)} />
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      {entityHome !== undefined && <EntitySubmenu onNew={() => addNode('entity', entityHome)} onPrefab={(p) => placePrefab(p, entityHome)} />}
      {!item && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => ctx.copyNodes(tops)}>
            <Copy />
            Copy
            {keys.copy && <ContextMenuShortcut>{keys.copy}</ContextMenuShortcut>}
          </ContextMenuItem>
          {!component && (
            <ContextMenuItem onClick={() => ctx.duplicateNodes(tops)}>
              <CopyPlus />
              Duplicate
              {keys.duplicate && <ContextMenuShortcut>{keys.duplicate}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
          <ContextMenuItem
            disabled={!canPaste}
            onClick={() => ctx.pasteNodes(id)}
            title={isContainer(node) ? 'Pastes into this one (what cannot go inside goes below it)' : 'Pastes next to this one'}
          >
            <ClipboardPaste />
            {isContainer(node) ? 'Paste inside' : 'Paste'}
            {keys.paste && <ContextMenuShortcut>{keys.paste}</ContextMenuShortcut>}
          </ContextMenuItem>
          {!component && node.type !== 'look' && (
            <ContextMenuItem disabled={tops.length === 0 || tops.some((t) => !index.byId.get(t) || ['collisionTiles', 'collisionShape', 'look'].includes(index.byId.get(t)!.node.type))} onClick={() => ctx.groupNodes(tops)} title="Put the selected nodes in one new Node2D">
              <GroupIcon />
              {tops.length > 1 ? `Group ${tops.length} nodes` : 'Group in a Node2D'}
            </ContextMenuItem>
          )}
          {isBranch(node) && (
            <ContextMenuItem onClick={() => ctx.ungroupNode(id)} title="What is inside stays where it is, in this node's place">
              <Ungroup />
              Ungroup
              {keys.ungroup && <ContextMenuShortcut>{keys.ungroup}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => ctx.toggleNodeVisibility(id)}>
            {hidden ? <Eye /> : <EyeOff />}
            {hidden ? 'Show' : 'Hide'}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => ctx.toggleNodeLock(id)}>
            {lockedHere ? <Unlock /> : <Lock />}
            {lockedHere ? 'Unlock' : 'Lock'}
          </ContextMenuItem>
          {isBranch(node) && (
            <>
              <ContextMenuItem disabled={lockedHere} onClick={() => ctx.setNodeYSort(id, node.type !== 'ySort')} title={node.type === 'ySort' ? 'Make it a Node2D: the sprites inside draw in tree order again' : 'Make it a YSort: the sprites inside draw among the characters by how far down they stand'}>
                <ArrowDownWideNarrow />
                {node.type === 'ySort' ? 'Change to Node2D' : 'Change to YSort'}
              </ContextMenuItem>
              <ContextMenuItem disabled={lockedHere} onClick={() => ctx.setPickAsOne(id, node.pickAsOne !== true)} title="A click on one of its sprites on the map picks all of them">
                <GroupIcon />
                {node.pickAsOne ? 'Pick sprites one by one' : 'Pick sprites as one'}
              </ContextMenuItem>
            </>
          )}
          {(node.type === 'tile' || isBranch(node)) && <DropShadowMenuItem has={hasShadow(ownLook(node))} onClick={() => dropShadow({ kind: 'layer', layerId: id })} />}
          {node.type === 'picture' && <DropShadowMenuItem has={hasShadow(ownLook(node))} disabled={lockedHere} onClick={() => dropShadow({ kind: 'picture', layerId: host?.id ?? '', imageId: id })} />}
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={confirmDelete} destructive>
        <Trash2 />
        {item ? (node.type === 'collisionTiles' ? 'Delete tiles item' : 'Delete shape') : tops.length > 1 ? `Delete ${tops.length} nodes` : `Delete ${NODE_TYPES[node.type].label}`}
      </ContextMenuItem>
    </>
  )
}

/** The menu of the panel's empty space: new nodes at the top of the map. */
function BackgroundMenu() {
  const ctx = useEditorSelector(selectMenu)
  const addNode = useAddNode()
  const canPaste = useEditorClipboard((s) => s.content?.kind === 'nodes')
  const nodes = ctx.nodes ?? NO_NODES
  const { placePrefab } = entityCreators({ startPlacement: ctx.startPlacement, createEntity: ctx.handleCreateEntity })
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger data-testid="add-node">
          <Plus />
          Add Node
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <AddNodeItems parentPath={[]} nodes={nodes} onPick={(type) => addNode(type, null)} />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <EntitySubmenu onNew={() => addNode('entity', null)} onPrefab={(p) => placePrefab(p, null)} />
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
  // A TileMap or a Sprite2D only takes a Look: its lower half still means "below", so layers and sprites reorder.
  if (isContainer(node) && childTypesOf([node]).some((t) => t !== 'look')) return fraction < 0.5 ? 'above' : 'inside'
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
        if (mode === 'replace' && v.primaryId === node.id && v.ids.length === 1 && (isLayerNode(node) || isBranch(node))) clearSelection()
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
              <p className="ed-hint">Right-click here to add a node.</p>
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
