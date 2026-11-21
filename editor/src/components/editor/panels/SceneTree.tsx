// The Scene panel (dock panel `layers`): the map's whole scene tree under one root row, the map itself (its children are
// the map's `nodes`). Every node is one row from the same row component: its icon, name, badges, eye and lock; a node
// with children opens and closes, and connector lines join each node to its parent, as in Godot.
// Right-click › Add Child Node offers what the node may hold (shared/sceneTree.ts `canHold`): an entity holds its
// components, a StaticBody or Area a CollisionShape, a Sprite or TileMap a Look, a Node a YSort.
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
  Map as MapIcon,
  Sparkles,
  Copy,
  CopyPlus,
  Droplet,
  Edit2,
  Eye,
  EyeOff,
  Grid3x3,
  Group as GroupIcon,
  Image as ImageIcon,
  Layers as LayersIcon,
  Leaf,
  Lock,
  Pentagon,
  Pencil,
  Plus,
  Stamp,
  Trash2,
  Ungroup,
  Unlock,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { EntityData } from '@/types/editor'
import {
  NODE_TYPES,
  canHold,
  childTypesOf,
  collisionItemsOf,
  effectiveYSort,
  isBranch,
  isContainer,
  isLayerNode,
  walkPanel,
  type NodeCategory,
  type SceneNode,
  type SceneNodeType,
  type WalkEntry,
} from '../../../../../shared/sceneTree'
import { entityView, sceneIndex } from '@/lib/sceneIndex'
import { SCENE_ROOT_ID, canDrop, countWithin, topLevelIds, type DropWhere, type NewNodeType } from '@/lib/sceneOps'
import { useEditorClipboard } from '@/store/editorClipboard'
import { describeBindings } from '@/lib/shortcuts'
import { useBindings } from '@/store/shortcutStore'
import { imagePickName } from '@/lib/graphicAssets'
import { summarizeEntity } from '@/lib/entityVisuals'
import { openEventEditor } from '@/lib/openEventEditor'
import { openPicturePicker } from '@/lib/picturePickerEvent'
import { usePrefabLibrary } from '@/lib/prefabLibrary'
import type { NodePrefab } from '../../../../../shared/prefabs'
import { openPrefabDialog, PrefabDialogs } from '../dialogs/PrefabDialogs'
import { usePolygonEdit } from '@/lib/polygonEditStore'
import { setLookView, useLookView } from '@/lib/look/lookView'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { YSortBadge } from '../ui/YSortBadge'
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
  return <NodeTypeIcon type="entity" />
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
  /** Depth in the panel: the root row is 0, the map's own nodes 1. */
  depth: number
  /** The last row listed among its siblings (its connector line stops at it). */
  last: boolean
  /** Per level above its parent's: whether that ancestor's line runs on past this row (it has siblings listed below). */
  through: boolean[]
  /** A group above it is hidden. */
  hiddenAbove: boolean
  /** A group or layer above it is locked. */
  lockedAbove: boolean
  /** It y-sorts and from where (own YSort, or followed from above). */
  ySort: false | 'own' | 'inherited'
  /** A Node whose sprites a click on the map picks as one (`pickAsOne`). */
  pictureGroup: boolean
}

function rowInfos(entries: readonly WalkEntry[]): RowInfo[] {
  // The panel lists a container's children last first: the one listed last is the first child (index 0).
  const lastById = new Map<string, boolean>()
  for (const e of entries) lastById.set(e.node.id, e.index === 0)
  return entries.map(({ node, ancestors, depth, index }) => ({
    node,
    depth: depth + 1,
    last: index === 0,
    // Level 0 is the root's line: it runs on past this row when the map node this row sits in is not the last listed.
    through: ancestors.map((a) => !lastById.get(a.id)),
    hiddenAbove: ancestors.some((a) => a.visible === false),
    lockedAbove: ancestors.some((a) => a.locked === true),
    ySort: isBranch(node) && effectiveYSort(node, []) ? 'own' : (isBranch(node) || node.type === 'picture') && effectiveYSort(node, ancestors) ? 'inherited' : false,
    pictureGroup: isBranch(node) && node.pickAsOne === true,
  }))
}

// ── one row ────────────────────────────────────────────────────────────────────────────────────────

/** Row geometry: left padding, the indent per level and the width of the chevron slot (lines run down its centre). */
const PAD = 4
const INDENT = 16
const SLOT = 16
const lineX = (level: number) => PAD + level * INDENT + SLOT / 2
const LINE = 'hsl(var(--muted-foreground) / 0.5)'

/** Godot-style connector lines of a row at `depth`: the lines of the ancestors that run past it, then its own elbow. */
function Guides({ depth, through, last, hasChevron }: { depth: number; through: readonly boolean[]; last: boolean; hasChevron: boolean }) {
  if (depth === 0) return null
  const own = depth - 1
  const elbowEnd = PAD + depth * INDENT + (hasChevron ? 1 : SLOT - 2)
  return (
    <span aria-hidden className="pointer-events-none absolute inset-y-[-1px] left-0" data-testid="tree-guides">
      {through.map((on, level) => (on ? <span key={level} className="absolute inset-y-0 w-px" style={{ left: lineX(level), background: LINE }} /> : null))}
      <span className="absolute top-0 w-px" style={{ left: lineX(own), height: last ? '50%' : '100%', background: LINE }} />
      <span className="absolute top-1/2 h-px" style={{ left: lineX(own), width: elbowEnd - lineX(own), background: LINE }} />
    </span>
  )
}

/** The open / close chevron of a node with children; an empty slot (the elbow line runs through it) otherwise. */
function Chevron({ open, show, name, onToggle }: { open: boolean; show: boolean; name: string; onToggle: () => void }) {
  if (!show) return <span className="shrink-0" style={{ width: SLOT }} aria-hidden />
  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground [&>svg]:size-3.5"
      style={{ width: SLOT, height: SLOT }}
      aria-label={open ? `Close ${name}` : `Open ${name}`}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {open ? <ChevronDown /> : <ChevronRight />}
    </button>
  )
}

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

const rowStyle = (depth: number): React.CSSProperties => ({ paddingLeft: PAD + depth * INDENT })

const SceneRow = memo(function SceneRow({ info, selected, multi, editing, dragging, drop, picked, handlers }: RowProps) {
  const { node, depth } = info
  const container = isContainer(node)
  const hasChildren = container && node.children.length > 0
  const open = hasChildren && node.collapsed !== true
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
          className="ed-row group gap-1.5"
          style={rowStyle(depth)}
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
          <Guides depth={depth} through={info.through} last={info.last} hasChevron={hasChildren} />
          {drop && drop !== 'inside' && (
            <div className={`pointer-events-none absolute right-0 z-30 h-[2px] rounded-full bg-primary ${drop === 'above' ? '-top-[2px]' : '-bottom-[2px]'}`} style={{ left: PAD + depth * INDENT }} data-testid="drop-line" />
          )}
          <Chevron open={open} show={hasChildren} name={node.name} onToggle={() => handlers.onChevron(node.id)} />
          {entity ? (
            <span className="flex size-[var(--icon-size)] shrink-0 items-center justify-center">
              <EntityGlyph entity={entity} />
            </span>
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
            {info.ySort === 'inherited' && <YSortBadge inherited />}
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
            {node.type === 'collision' && (
              <span className="ed-badge" data-tone="count" title="Collision tiles and shapes in it" data-testid="node-count">
                {collisionItemsOf(node).length}
              </span>
            )}
            {node.type === 'collisionTiles' && (
              <span className="ed-badge" data-tone="count" title="Painted tiles item">
                tiles
              </span>
            )}
            {node.type === 'collisionShape' && !node.box && (
              <span className="ed-badge" data-tone="count" title="Points">
                {node.points.length} pts
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
            {locked || info.lockedAbove ? (
              <IconButton
                title={locked ? 'Locked: click to unlock' : 'Locked by a group above'}
                aria-label={locked ? `Unlock ${label}` : `Locked by a group above`}
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
                aria-label={`Lock ${label}`}
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
              title={node.visible === false ? 'Show' : node.type === 'ySort' ? 'Hide (y-sort off)' : 'Hide'}
              aria-label={node.visible === false ? `Show ${label}` : `Hide ${label}`}
              onClick={(e) => {
                e.stopPropagation()
                handlers.onToggleVisible(node.id)
              }}
            >
              {node.visible === false ? <EyeOff className="text-amber-400/90" /> : <Eye />}
            </IconButton>
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
  mapHasLook: !!c.activeMap?.look,
  openLook: c.openLook,
  setLook: c.setLook,
  view: c.selectionView,
  selectNode: c.selectNode,
  createNode: c.createNode,
  deleteNodes: c.deleteNodes,
  copyNodes: c.copyNodes,
  pasteNodes: c.pasteNodes,
  duplicateNodes: c.duplicateNodes,
  groupNodes: c.groupNodes,
  ungroupNode: c.ungroupNode,
  placeMultiple: c.placeMultiple,
  startPlacement: c.startPlacement,
  setConfirmDialog: c.setConfirmDialog,
})

const NO_NODES: SceneNode[] = []

const CATEGORY_LABELS: Record<NodeCategory, string> = { scene: 'Scene', drawing: 'Drawing', collision: 'Collision', entity: 'Entity', component: 'Components' }

/** Types kept for old maps only, or made another way: never offered as such (an entity is a Node given a component). */
const NOT_OFFERED: readonly SceneNodeType[] = ['objects', 'entity']

/**
 * The node types that can go under `parentPath` (the map root when empty), grouped by category, each disabled when the
 * parent already has one of it (one Look, one YSort, one sprite or movement per Node, one terrain per map...). A pick
 * makes it; where a Node may go, the project's prefabs are offered next to it.
 */
function AddNodeItems({ parentPath, nodes, onPick, onPrefab, onManage }: { parentPath: readonly SceneNode[]; nodes: readonly SceneNode[]; onPick: (type: SceneNodeType) => void; onPrefab: (prefab: NodePrefab) => void; onManage: () => void }) {
  const bindings = useBindings()
  const prefabs = usePrefabLibrary().file.prefabs
  const types = childTypesOf(parentPath).filter((t) => !NOT_OFFERED.includes(t))
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
          {category === 'scene' && types.includes('group') && (
            <ContextMenuSub>
              <ContextMenuSubTrigger data-testid="add-prefab">
                <Sparkles className="text-amber-400" />
                Prefab
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {prefabs.map((prefab) => (
                  <ContextMenuItem key={prefab.id} onClick={() => onPrefab(prefab)} title={prefab.description ?? 'Click the map where its anchor goes'}>
                    <NamedIcon name={prefab.icon ?? 'package'} className="text-muted-foreground" />
                    {prefab.name}
                  </ContextMenuItem>
                ))}
                {prefabs.length > 0 && <ContextMenuSeparator />}
                <ContextMenuItem onClick={onManage} data-testid="manage-prefabs">
                  <Pencil />
                  Manage prefabs…
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
        </React.Fragment>
      ))}
    </>
  )
}

/** Makes a node of `type` inside the node `parentId` (null = the map root): sprites are picked from the library first, prefabs placed on the map. */
function useAddNode() {
  const ctx = useEditorSelector(selectMenu)
  const add = (type: SceneNodeType, parentId: string | null) => {
    if (type === 'picture') {
      // The picture picker places the sprite into the selected Node.
      if (parentId) ctx.selectNode(parentId)
      openPicturePicker()
      return
    }
    ctx.createNode(type as NewNodeType, parentId)
  }
  const prefab = (p: NodePrefab, parentId: string | null) => ctx.startPlacement({ name: p.name, prefab: p, parentId })
  const manage = (parentId: string | null) => setTimeout(() => openPrefabDialog({ mode: 'manage', parentId }), 0)
  return { add, prefab, manage }
}

/** The right-click menu of one row, built when it opens. */
function RowMenu({ id, onRename }: { id: string; onRename: (id: string) => void }) {
  const ctx = useEditorSelector(selectMenu)
  const bindings = useBindings()
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
  // The row is part of the selection: the command acts on all of it, otherwise on this row alone.
  const targets = ctx.view.ids.includes(id) ? ctx.view.ids : [id]
  const tops = topLevelIds(nodes, targets)
  const lockedHere = node.locked === true
  const item = isCollisionItem(node.type)
  const component = NODE_TYPES[node.type].category === 'component'
  const path = [...ancestors, node]
  const parent = ancestors[ancestors.length - 1]
  const canHaveChildren = childTypesOf(path).some((t) => !NOT_OFFERED.includes(t))
  const host = [...ancestors].reverse().find(isBranch)
  const entity = node.type === 'entity' ? (entityView(node) as unknown as EntityData) : null
  const eventOwner = node.type === 'event' ? parent : entity?.components.Event ? node : null
  const groupable = !component && !item && node.type !== 'look' && node.type !== 'ySort'

  const confirmDelete = () => {
    const ids = tops.length > 0 ? tops : [id]
    const withIn = countWithin(nodes, ids)
    const only = ids.length === 1 ? node : null
    if (ids.every((n) => ['picture', 'collisionTiles', 'collisionShape', 'look', 'ySort'].includes(index.byId.get(n)?.node.type ?? '') || NODE_TYPES[index.byId.get(n)?.node.type ?? 'group'].category === 'component')) {
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
      {canHaveChildren && (
        <ContextMenuSub>
          <ContextMenuSubTrigger data-testid="add-child-node" disabled={lockedHere}>
            <Plus />
            Add Child Node
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <AddNodeItems parentPath={path} nodes={nodes} onPick={(type) => addNode.add(type, id)} onPrefab={(p) => addNode.prefab(p, id)} onManage={() => addNode.manage(id)} />
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      {node.type === 'picture' && (
        <ContextMenuItem disabled={lockedHere} onClick={() => ctx.placeMultiple(host?.id ?? '', id)} title="Click the map to add more copies: same picture, crop, scale and flips">
          <Stamp />
          Place more copies
          {keys.place && <ContextMenuShortcut>{keys.place}</ContextMenuShortcut>}
        </ContextMenuItem>
      )}
      {(eventOwner || canHaveChildren || node.type === 'picture') && <ContextMenuSeparator />}
      <ContextMenuItem onClick={() => onRename(id)}>
        <Edit2 />
        Rename
      </ContextMenuItem>
      {!item && (
        <>
          <ContextMenuItem onClick={() => ctx.copyNodes(tops)}>
            <Copy />
            Copy
            {keys.copy && <ContextMenuShortcut>{keys.copy}</ContextMenuShortcut>}
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
          {!component && (
            <ContextMenuItem onClick={() => ctx.duplicateNodes(tops)}>
              <CopyPlus />
              Duplicate
              {keys.duplicate && <ContextMenuShortcut>{keys.duplicate}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
        </>
      )}
      {isBranch(node) && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => setTimeout(() => openPrefabDialog({ mode: 'save', nodeId: id }), 0)} title="Save this node and everything inside it as a prefab to place again" data-testid="save-prefab">
            <Sparkles className="text-amber-400" />
            {node.prefab ? 'Save as Prefab… (update)' : 'Save as Prefab…'}
          </ContextMenuItem>
        </>
      )}
      {(groupable || isBranch(node)) && <ContextMenuSeparator />}
      {groupable && (
        <ContextMenuItem disabled={tops.length === 0 || tops.some((t) => !index.byId.get(t) || ['collisionTiles', 'collisionShape', 'look', 'ySort'].includes(index.byId.get(t)!.node.type))} onClick={() => ctx.groupNodes(tops)} title="Put the selected nodes in one new Node">
          <GroupIcon />
          {tops.length > 1 ? `Group ${tops.length} nodes` : 'Group in a Node'}
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
      <ContextMenuItem onClick={confirmDelete} destructive>
        <Trash2 />
        {tops.length > 1 ? `Delete ${tops.length} nodes` : `Delete ${NODE_TYPES[node.type].label}`}
      </ContextMenuItem>
    </>
  )
}

/** The menu of the root row (the map) and of the panel's empty space: new nodes at the top of the map. */
function RootMenu() {
  const ctx = useEditorSelector(selectMenu)
  const addNode = useAddNode()
  const canPaste = useEditorClipboard((s) => s.content?.kind === 'nodes')
  const nodes = ctx.nodes ?? NO_NODES
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger data-testid="add-node">
          <Plus />
          Add Child Node
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <AddNodeItems parentPath={[]} nodes={nodes} onPick={(type) => addNode.add(type, null)} onPrefab={(p) => addNode.prefab(p, null)} onManage={() => addNode.manage(null)} />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem
        disabled={ctx.mapHasLook}
        title={ctx.mapHasLook ? 'The map has a look: select its Look row' : 'Colour grading of the whole map'}
        onClick={() => {
          ctx.setLook({ kind: 'map' }, {}, true)
          ctx.openLook({ kind: 'map' })
        }}
        data-testid="add-map-look"
      >
        <Palette style={{ color: NODE_TYPES.look.accent }} />
        Add Look
      </ContextMenuItem>
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
  mapName: c.activeMap ? c.activeMap.name || c.activeMap.fileName || 'Scene' : '',
  mapHasLook: !!c.activeMap?.look,
  openLook: c.openLook,
  setLook: c.setLook,
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
  // A TileMap or a Sprite only takes a Look: its lower half still means "below", so layers and sprites reorder.
  if (isContainer(node) && childTypesOf([node]).some((t) => t !== 'look')) return fraction < 0.5 ? 'above' : 'inside'
  return fraction < 0.5 ? 'above' : 'below'
}

/** The root row: the map itself. Selected while nothing else is (the Look panel then edits the map's look). */
function RootRow({ name, hasLook, open, selected, hasChildren, drop, onClick, onToggle, onDragOver, onDrop }: {
  name: string
  hasLook: boolean
  open: boolean
  selected: boolean
  hasChildren: boolean
  drop: boolean
  onClick: () => void
  onToggle: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="ed-row gap-1.5"
          style={rowStyle(0)}
          data-testid="scene-root"
          data-selected={selected ? 'true' : undefined}
          data-drop={drop ? 'true' : undefined}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          onDragOver={onDragOver}
          onDrop={onDrop}
          title="The map: everything in it is below this node"
        >
          {open && hasChildren && <span aria-hidden className="pointer-events-none absolute bottom-[-1px] top-1/2 w-px" style={{ left: lineX(0), background: LINE }} />}
          <Chevron open={open} show={hasChildren} name={name} onToggle={onToggle} />
          <MapIcon className="ed-icon" style={{ color: '#93c5fd' }} />
          <span className="ed-row-label font-medium" title={name}>
            {name}
          </span>
          <div className="ed-row-actions">
            {hasLook && (
              <span className="ed-badge" title="The map has a look">
                <Palette />
              </span>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <RootMenu />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The map's own look, shown as a Look row first under the map (it is not a node of the tree: the map holds it). */
function MapLookRow({ selected, last, onClick, onDelete }: { selected: boolean; last: boolean; onClick: () => void; onDelete: () => void }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="ed-row group gap-1.5" style={rowStyle(1)} data-testid="scene-map-look" data-selected={selected ? 'true' : undefined} onClick={(e) => (e.stopPropagation(), onClick())} title="The colour grading of the whole map">
          <Guides depth={1} through={[]} last={last} hasChevron={false} />
          <span className="shrink-0" style={{ width: SLOT }} aria-hidden />
          <NodeTypeIcon type="look" />
          <span className="ed-row-label">Look</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <ContextMenuItem onClick={onDelete} destructive>
          <Trash2 />
          Delete map look
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function SceneTree() {
  const ctx = useEditorSelector(selectPanel)
  const { view } = ctx
  const nodes = ctx.nodes ?? NO_NODES
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rootOpen, setRootOpen] = useState(true)
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
  const mapLookOpen = useLookView().pinned?.kind === 'map'

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

  const endDrag = () => {
    draggedRef.current = null
    setDragged(null)
    setDrop(null)
  }

  const handlers = useMemo<RowHandlers>(
    () => ({
      onClick: (e, node) => {
        e.stopPropagation()
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
        // Clicking the only selected layer again deselects it (the root is selected then).
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
      onDragEnd: endDrag,
      onDrop: (e, node) => {
        e.preventDefault()
        e.stopPropagation()
        const ids = draggedRef.current
        const drop = dropRef.current
        if (ids && drop?.id === node.id) moveNodes(ids, node.id, drop.where)
        endDrag()
      },
      renderMenu: (id) => <RowMenu id={id} onRename={(rid) => void setTimeout(() => setEditingId(rid), 60)} />,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectNode, clearSelection, toggleCollapsed, renameNode, toggleNodeVisibility, toggleNodeLock, moveNodes]
  )

  if (!ctx.hasActiveMap) return <div className="ed-empty">Select a map to view its scene</div>

  const draggedSet = new Set(dragged ?? [])
  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full h-full w-full">
        <div className="flex min-h-full h-full w-full flex-col" data-testid="scene-tree" onClick={() => ctx.setFocusedDomain('layers')}>
          <RootRow
            name={ctx.mapName}
            hasLook={ctx.mapHasLook}
            open={rootOpen}
            selected={view.ids.length === 0 && !mapLookOpen}
            hasChildren={rows.length > 0 || ctx.mapHasLook}
            drop={dropAt?.id === SCENE_ROOT_ID}
            onClick={() => {
              ctx.setFocusedDomain('layers')
              setLookView({ pinned: null })
              clearSelection()
            }}
            onToggle={() => setRootOpen((o) => !o)}
            onDragOver={(e) => {
              const ids = draggedRef.current
              if (!ids || !canDrop(nodesRef.current, ids, SCENE_ROOT_ID, 'inside')) return setDrop(null)
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDrop({ id: SCENE_ROOT_ID, where: 'inside' })
            }}
            onDrop={(e) => {
              e.preventDefault()
              const ids = draggedRef.current
              if (ids && dropRef.current?.id === SCENE_ROOT_ID) moveNodes(ids, SCENE_ROOT_ID, 'inside')
              endDrag()
            }}
          />
          {rootOpen && ctx.mapHasLook && (
            <MapLookRow
              selected={mapLookOpen && view.ids.length === 0}
              last={rows.length === 0}
              onClick={() => {
                ctx.setFocusedDomain('layers')
                ctx.openLook({ kind: 'map' })
              }}
              onDelete={() => {
                setLookView({ pinned: null })
                ctx.setLook({ kind: 'map' }, undefined, true)
              }}
            />
          )}
          {rootOpen &&
            rows.map((info) => (
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
          {rows.length === 0 && <div className="ed-empty">Nothing in this map yet: right-click the map to add a node.</div>}
          <PrefabDialogs />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <RootMenu />
      </ContextMenuContent>
    </ContextMenu>
  )
}
