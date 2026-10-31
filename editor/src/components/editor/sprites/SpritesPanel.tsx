// Assets panel: the folder tree of project/sprites (what you see here is what is on disk) with search, grid / list
// views, usage counts, folder and asset management (new folder, rename, move by drag and drop, delete, import into a
// folder, drop PNGs from the OS) and the editor for the selected asset.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Edit2, FolderOpen, Folder, FolderPlus, ImagePlus, LayoutGrid, List, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { fileBaseName, isFileDrag, pathOfDroppedFile, pngFilesOf } from '@/lib/droppedFiles'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Badge, EdButton, IconButton } from '../ui/controls'
import { SpriteThumb } from './SpriteThumb'
import { SpriteEditor } from './SpriteEditor'
import { ImportSpriteDialog, SPRITE_ID_PATTERN } from './ImportSpriteDialog'
import { AssetNameDialog } from './AssetNameDialog'
import { assetIdsIn, buildAssetTree, countAssets, findFolder, isInside, joinId, leafOf, parentFolderOf, type FolderNode } from './assetTree'
import { countSpriteUsage } from './usage'
import { splitAssetId } from '../inspector/SpritePicker'

const selectPanel = (c: EditorContextValue) => ({
  spriteList: c.spriteList,
  spriteAssets: c.spriteAssets,
  spriteFolders: c.spriteFolders,
  spriteWarnings: c.spriteWarnings,
  reloadSprites: c.reloadSprites,
  saveSpriteMeta: c.saveSpriteMeta,
  renameSprite: c.renameSprite,
  removeSprite: c.removeSprite,
  createSpriteFolder: c.createSpriteFolder,
  renameSpriteFolder: c.renameSpriteFolder,
  moveSpriteFolder: c.moveSpriteFolder,
  deleteSpriteFolder: c.deleteSpriteFolder,
  setConfirmDialog: c.setConfirmDialog,
  maps: c.maps,
  activeMap: c.activeMap,
  entities: c.entities,
})

const KIND_TONE: Record<string, 'move' | 'event' | undefined> = { character: 'move', animated: 'event', object: undefined }
const DRAG_ASSET = 'application/x-elementals-asset'
const DRAG_FOLDER = 'application/x-elementals-asset-folder'
const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const NO_FOLDERS: string[] = []

type ViewMode = 'grid' | 'list'

type Dialog =
  | { type: 'new-folder'; parent: string }
  | { type: 'rename-folder'; id: string }
  | { type: 'rename-asset'; id: string }

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const folderLabel = (id: string) => id || 'sprites'

interface AssetItemProps {
  asset: SpriteAssetInfo
  mode: ViewMode
  selected: boolean
  usage: number
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
}

function AssetItem({ asset, mode, selected, usage, onSelect, onRename, onDelete }: AssetItemProps) {
  const name = asset.meta.name || splitAssetId(asset.id).leaf
  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_ASSET, asset.id)
      e.dataTransfer.effectAllowed = 'move'
    },
  }
  const button =
    mode === 'list' ? (
      <button type="button" className="ed-row" data-selected={selected ? 'true' : undefined} onClick={onSelect} title={asset.id} aria-label={`Sprite ${asset.id}`} {...dragProps}>
        <SpriteThumb asset={asset} size={20} />
        <span className="ed-row-label text-left">{name}</span>
        <span className="ed-row-actions">
          <Badge tone={KIND_TONE[asset.meta.kind]}>{asset.meta.kind}</Badge>
          <Badge tone={usage === 0 ? 'warn' : undefined} title="Entities using it">
            {usage}
          </Badge>
        </span>
      </button>
    ) : (
      <button
        type="button"
        onClick={onSelect}
        title={asset.id}
        aria-label={`Sprite ${asset.id}`}
        data-selected={selected ? 'true' : undefined}
        className="relative flex flex-col items-center gap-1 rounded-md border border-border bg-card/40 p-2 hover:bg-muted data-[selected=true]:border-primary data-[selected=true]:bg-primary/15"
        {...dragProps}
      >
        <div className="ed-checker flex h-14 w-full items-center justify-center rounded-sm">
          <SpriteThumb asset={asset} size={48} />
        </div>
        <div className="w-full truncate text-center text-ed-label text-foreground">{name}</div>
        <div className="flex items-center gap-1">
          <Badge tone={KIND_TONE[asset.meta.kind]}>{asset.meta.kind}</Badge>
          <Badge tone={usage === 0 ? 'warn' : undefined} title="Entities using it">
            {usage}
          </Badge>
        </div>
      </button>
    )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={onSelect}>Open</ContextMenuItem>
        <ContextMenuItem onClick={() => setTimeout(onRename, 0)}>
          <Edit2 className="mr-2 h-3.5 w-3.5" />
          Rename…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setTimeout(onDelete, 0)} className="text-red-400 focus:bg-red-500/10 focus:text-red-400">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function SpritesPanel() {
  const ctx = useEditorSelector(selectPanel)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<ViewMode>('grid')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** The folder new folders and imports go into ('' = the sprites root). */
  const [folderChoice, setSelectedFolder] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [importState, setImportState] = useState<{ open: boolean; folder: string; source: { path: string; name: string } | null }>({ open: false, folder: '', source: null })
  const rootRef = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWide(el.getBoundingClientRect().width >= 560))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const usage = useMemo(
    () =>
      countSpriteUsage(
        ctx.maps,
        ctx.activeMap ? { fileName: ctx.activeMap.fileName, folderPath: ctx.activeMap.folderPath, entities: ctx.entities } : null,
      ),
    [ctx.maps, ctx.activeMap, ctx.entities],
  )
  const folders = ctx.spriteFolders ?? NO_FOLDERS
  const fullTree = useMemo(() => buildAssetTree(ctx.spriteList, folders), [ctx.spriteList, folders])
  const tree = useMemo(() => (query.trim() ? buildAssetTree(ctx.spriteList, folders, query) : fullTree), [ctx.spriteList, folders, query, fullTree])
  const selected = selectedId ? ctx.spriteAssets[selectedId] : undefined
  // A chosen folder that is gone (deleted, or not loaded yet) falls back to the root.
  const selectedFolder = findFolder(fullTree, folderChoice) ? folderChoice : ''
  const usageIn = (ids: string[]) => ids.reduce((n, id) => n + (usage[id] ?? 0), 0)

  // Selection that no longer exists (deleted / renamed elsewhere) is dropped.
  useEffect(() => {
    if (selectedId && !ctx.spriteAssets[selectedId]) setSelectedId(null)
  }, [selectedId, ctx.spriteAssets])

  const toggleFolder = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const expand = (id: string) =>
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  const confirm = (title: string, description: string, action: () => void) => ctx.setConfirmDialog({ open: true, title, description, action })

  /** Keeps the selection pointing at the same thing after a folder was renamed or moved. */
  const remapAfterFolderChange = (from: string, to: string) => {
    const remap = (id: string) => (isInside(id, from) ? to + id.slice(from.length) : id)
    setSelectedId((id) => (id ? remap(id) : id))
    setSelectedFolder((id) => remap(id))
    setCollapsed((prev) => new Set([...prev].filter((id) => !isInside(id, from))))
  }

  // ── actions ──────────────────────────────────────────────────────────────────────────────────

  const moveAsset = (id: string, targetFolder: string) => {
    const dest = joinId(targetFolder, leafOf(id))
    if (dest === id) return
    const run = async () => {
      const res = await ctx.renameSprite(id, dest)
      if (res.ok) {
        setNotice(null)
        setSelectedId((cur) => (cur === id ? res.id : cur))
        expand(targetFolder)
      } else setNotice(res.error)
    }
    const used = usage[id] ?? 0
    if (used > 0) {
      confirm('Move sprite', `“${id}” is used by ${used} ${plural(used, 'entity', 'entities')}. They will show no graphic until their Sprite is pointed at “${dest}”. Move anyway?`, () => void run())
    } else void run()
  }

  const moveFolder = (id: string, targetFolder: string) => {
    if (isInside(targetFolder, id) || parentFolderOf(id) === targetFolder) return
    const node = findFolder(fullTree, id)
    const used = node ? usageIn(assetIdsIn(node)) : 0
    const run = async () => {
      const res = await ctx.moveSpriteFolder(id, targetFolder || null)
      if (res.ok) {
        setNotice(null)
        remapAfterFolderChange(id, res.folderId)
        expand(targetFolder)
      } else setNotice(res.error)
    }
    if (used > 0) {
      confirm('Move folder', `Sprites in “${id}” are used by ${used} ${plural(used, 'entity', 'entities')}. They will show no graphic until their Sprite is pointed at the new ids. Move anyway?`, () => void run())
    } else void run()
  }

  const deleteFolder = (id: string) => {
    const node = findFolder(fullTree, id)
    if (!node) return
    const ids = assetIdsIn(node)
    const used = usageIn(ids)
    const what = ids.length === 0 ? 'The folder is empty.' : `This deletes ${ids.length} ${plural(ids.length, 'sprite', 'sprites')} from the project${used > 0 ? `, used by ${used} ${plural(used, 'entity', 'entities')}` : ''}.`
    confirm('Delete folder', `Delete “${id}” from the project? ${what}`, () => {
      void ctx.deleteSpriteFolder(id).then((res) => {
        if (res.ok) setNotice(null)
        else setNotice(res.error)
      })
    })
  }

  const deleteAsset = (asset: SpriteAssetInfo) => {
    const used = usage[asset.id] ?? 0
    confirm(
      'Delete sprite',
      used > 0
        ? `“${asset.id}” is used by ${used} ${plural(used, 'entity', 'entities')}; they will lose their graphic. Delete the sprite and its sheets from the project?`
        : `Delete the sprite “${asset.id}” and its sheets from the project?`,
      () => {
        void ctx.removeSprite(asset.id).then((res) => {
          if (res.ok) {
            setNotice(null)
            setSelectedId((cur) => (cur === asset.id ? null : cur))
          } else setNotice(res.error)
        })
      },
    )
  }

  const openImport = (folder: string, source: { path: string; name: string } | null = null) => setImportState({ open: true, folder, source })

  /** PNGs from the OS dropped on a folder: the first one opens the import form for that folder. */
  const dropFiles = async (e: React.DragEvent, folder: string) => {
    const files = pngFilesOf(e.dataTransfer)
    if (files.length === 0) {
      setNotice('Only PNG sheets can be imported')
      return
    }
    try {
      openImport(folder, { path: await pathOfDroppedFile(files[0]), name: fileBaseName(files[0]) })
      setNotice(files.length > 1 ? `Importing ${files[0].name} first; drop the other ${files.length - 1} again afterwards.` : null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }

  const onFolderDrop = (e: React.DragEvent, folder: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const assetId = e.dataTransfer.getData(DRAG_ASSET)
    const folderId = e.dataTransfer.getData(DRAG_FOLDER)
    if (assetId) moveAsset(assetId, folder)
    else if (folderId) moveFolder(folderId, folder)
    else if (isFileDrag(e.dataTransfer)) void dropFiles(e, folder)
  }

  const folderDropProps = (folder: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const types = Array.from(e.dataTransfer.types)
      if (!types.includes(DRAG_ASSET) && !types.includes(DRAG_FOLDER) && !types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(folder)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget((t) => (t === folder ? null : t))
    },
    onDrop: (e: React.DragEvent) => onFolderDrop(e, folder),
  })

  // ── dialogs ──────────────────────────────────────────────────────────────────────────────────

  const renderDialog = () => {
    if (!dialog) return null
    const close = () => setDialog(null)

    if (dialog.type === 'new-folder') {
      return (
        <AssetNameDialog
          key="new-folder"
          title="New folder"
          description={`Created inside ${folderLabel(dialog.parent)}.`}
          fields={[{ key: 'name', label: 'Folder name', value: '', placeholder: 'e.g. npcs', hint: 'Letters, digits, - and _' }]}
          confirmLabel="Create"
          onClose={close}
          onSubmit={async ({ name }) => {
            const next = name.trim()
            if (!FOLDER_NAME.test(next)) return 'Use letters, digits, - and _ (start with a letter or digit)'
            const res = await ctx.createSpriteFolder(dialog.parent || null, next)
            if (!res.ok) return res.error
            expand(dialog.parent)
            setSelectedFolder(res.folderId)
          }}
        />
      )
    }

    if (dialog.type === 'rename-folder') {
      const id = dialog.id
      return (
        <AssetNameDialog
          key={`rename-folder-${id}`}
          title="Rename folder"
          description="Every sprite inside gets a new id (its path)."
          fields={[{ key: 'name', label: 'Folder name', value: leafOf(id), hint: 'Letters, digits, - and _' }]}
          onClose={close}
          onSubmit={async ({ name }) => {
            const next = name.trim()
            if (next === leafOf(id)) return
            if (!FOLDER_NAME.test(next)) return 'Use letters, digits, - and _ (start with a letter or digit)'
            const node = findFolder(fullTree, id)
            const used = node ? usageIn(assetIdsIn(node)) : 0
            const run = async () => {
              const res = await ctx.renameSpriteFolder(id, next)
              if (res.ok) {
                setNotice(null)
                remapAfterFolderChange(id, res.folderId)
              } else setNotice(res.error)
            }
            if (used > 0) {
              confirm('Rename folder', `Sprites in “${id}” are used by ${used} ${plural(used, 'entity', 'entities')}. They will show no graphic until their Sprite is pointed at the new ids. Rename anyway?`, () => void run())
            } else await run()
          }}
        />
      )
    }

    const asset = ctx.spriteAssets[dialog.id]
    if (!asset) return null
    const folder = parentFolderOf(asset.id)
    return (
      <AssetNameDialog
        key={`rename-asset-${asset.id}`}
        title="Rename sprite"
        description={`In ${folderLabel(folder)}.`}
        fields={[
          { key: 'name', label: 'Name', value: asset.meta.name || leafOf(asset.id), hint: 'What the editor shows' },
          { key: 'file', label: 'File name', value: leafOf(asset.id), hint: 'The folder on disk and the id entities use' },
        ]}
        onClose={close}
        onSubmit={async ({ name, file }) => {
          const nextName = name.trim()
          const nextLeaf = file.trim()
          if (!nextName) return 'The name must not be empty'
          if (!SPRITE_ID_PATTERN.test(nextLeaf) || nextLeaf.includes('/')) return 'The file name uses letters, digits, - and _'
          if (nextName !== asset.meta.name) {
            const saved = await ctx.saveSpriteMeta(asset.id, { ...asset.meta, name: nextName })
            if (!saved.ok) return saved.error
          }
          const nextId = joinId(folder, nextLeaf)
          if (nextId === asset.id) return
          const run = async () => {
            const res = await ctx.renameSprite(asset.id, nextId)
            if (res.ok) {
              setNotice(null)
              setSelectedId((cur) => (cur === asset.id ? res.id : cur))
            } else setNotice(res.error)
          }
          const used = usage[asset.id] ?? 0
          if (used > 0) {
            confirm('Rename sprite', `“${asset.id}” is used by ${used} ${plural(used, 'entity', 'entities')}. They will show no graphic until their Sprite is pointed at “${nextId}”. Rename anyway?`, () => void run())
          } else await run()
        }}
      />
    )
  }

  // ── tree ─────────────────────────────────────────────────────────────────────────────────────

  const renderFolder = (node: FolderNode, depth: number): React.ReactNode => {
    const isRoot = node.id === ''
    const open = query.trim() !== '' || !collapsed.has(node.id)
    const total = countAssets(node)
    const active = dropTarget === node.id
    const row = (
      <div
        role="presentation"
        className="rounded-md"
        {...(!isRoot
          ? {
              draggable: true,
              onDragStart: (e: React.DragEvent) => {
                e.stopPropagation()
                e.dataTransfer.setData(DRAG_FOLDER, node.id)
                e.dataTransfer.effectAllowed = 'move'
              },
            }
          : {})}
      >
        <button
          type="button"
          className="ed-row"
          data-selected={selectedFolder === node.id ? 'true' : undefined}
          data-drop={active ? 'true' : undefined}
          aria-expanded={open}
          title={folderLabel(node.id)}
          onClick={() => {
            setSelectedFolder(node.id)
            toggleFolder(node.id)
          }}
        >
          {open ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
          {open ? <FolderOpen className="text-amber-400" /> : <Folder className="text-amber-400" />}
          <span className="ed-row-label text-left font-medium">{folderLabel(node.id)}</span>
          <span className="ed-badge" title={`${total} ${plural(total, 'sprite', 'sprites')}`}>
            {total}
          </span>
        </button>
      </div>
    )

    return (
      // The whole branch is the drop target, so dropping on a sprite inside a folder moves it into that folder.
      <section key={node.id || '(root)'} className="flex flex-col gap-1" {...folderDropProps(node.id)}>
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onClick={() => setTimeout(() => setDialog({ type: 'new-folder', parent: node.id }), 0)}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              New folder
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setTimeout(() => openImport(node.id), 0)}>
              <ImagePlus className="mr-2 h-3.5 w-3.5" />
              Import sprite here…
            </ContextMenuItem>
            {!isRoot && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => setTimeout(() => setDialog({ type: 'rename-folder', id: node.id }), 0)}>
                  <Edit2 className="mr-2 h-3.5 w-3.5" />
                  Rename…
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setTimeout(() => deleteFolder(node.id), 0)} className="text-red-400 focus:bg-red-500/10 focus:text-red-400">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete folder
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>

        {open && (
          <div className={depth === 0 ? 'flex flex-col gap-1' : 'ed-tree-children'}>
            {node.folders.map((f) => renderFolder(f, depth + 1))}
            {node.assets.length > 0 && (
              <div className={mode === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 py-1' : 'flex flex-col gap-0.5'}>
                {node.assets.map((a) => (
                  <AssetItem
                    key={a.id}
                    asset={a}
                    mode={mode}
                    selected={a.id === selectedId}
                    usage={usage[a.id] ?? 0}
                    onSelect={() => {
                      setSelectedId(a.id)
                      setSelectedFolder(node.id)
                    }}
                    onRename={() => setDialog({ type: 'rename-asset', id: a.id })}
                    onDelete={() => deleteAsset(a)}
                  />
                ))}
              </div>
            )}
            {node.folders.length === 0 && node.assets.length === 0 && !isRoot && <div className="ed-hint px-2 py-1">Empty folder. Drop a sprite or PNG here.</div>}
          </div>
        )}
      </section>
    )
  }

  const searching = query.trim() !== ''
  const noMatches = searching && countAssets(tree) === 0

  const browser = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2" data-testid="sprite-browser">
      <div className="flex items-center gap-1">
        <div className="ed-input-wrap flex-1">
          <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
          <input className="ed-input pl-7" placeholder="Search…" aria-label="Search sprites" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <IconButton title="Grid view" aria-label="Grid view" active={mode === 'grid'} onClick={() => setMode('grid')}>
          <LayoutGrid />
        </IconButton>
        <IconButton title="List view" aria-label="List view" active={mode === 'list'} onClick={() => setMode('list')}>
          <List />
        </IconButton>
        <IconButton title="Reload from disk" aria-label="Reload sprites" onClick={() => void ctx.reloadSprites()}>
          <RefreshCw />
        </IconButton>
      </div>
      <div className="flex items-center gap-1">
        <EdButton variant="primary" className="flex-1" onClick={() => openImport(selectedFolder)} title={`Import a PNG sheet into ${folderLabel(selectedFolder)}`}>
          <ImagePlus />
          Import sprite…
        </EdButton>
        <EdButton onClick={() => setDialog({ type: 'new-folder', parent: selectedFolder })} title={`New folder inside ${folderLabel(selectedFolder)}`} aria-label="New folder">
          <FolderPlus />
          Folder
        </EdButton>
      </div>
      <div className="ed-hint truncate" title="Imports and new folders go into the selected folder">
        Target: {folderLabel(selectedFolder)}
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-md border border-solid/40 bg-solid/10 p-2 text-ed-label text-solid" role="alert">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {ctx.spriteWarnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-ed-label text-warning" role="status">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{ctx.spriteWarnings.length} sprite folder{ctx.spriteWarnings.length === 1 ? ' is' : 's are'} invalid and skipped: {ctx.spriteWarnings.map((w) => w.file).join(', ')}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" {...folderDropProps('')}>
        {ctx.spriteList.length === 0 && folders.length === 0 && (
          <div className="ed-empty py-8">
            <p>No sprites yet.</p>
            <p className="ed-hint">Import a PNG sheet (or drop one here) to get started.</p>
          </div>
        )}
        {noMatches && <div className="ed-empty py-8">No sprite matches “{query}”.</div>}
        {!noMatches && (ctx.spriteList.length > 0 || folders.length > 0) && renderFolder(tree, 0)}
      </div>
    </div>
  )

  const editor = selected ? (
    <SpriteEditor key={selected.id} asset={selected} usage={usage[selected.id] ?? 0} onIdChanged={(id) => setSelectedId(id)} />
  ) : (
    <div className="ed-empty">
      <p>Select a sprite to edit it.</p>
      <p className="ed-hint">Frames, pivot, character settings and animations are edited here.</p>
    </div>
  )

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full bg-sidebar text-ed-body" data-testid="sprites-panel">
      {wide ? (
        <>
          <div className="flex w-[260px] shrink-0 flex-col border-r border-sidebar-border">{browser}</div>
          <div className="min-w-0 flex-1 overflow-y-auto">{editor}</div>
        </>
      ) : selected ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="p-2 pb-0">
            <EdButton size="sm" onClick={() => setSelectedId(null)}>
              <ChevronRight className="rotate-180" />
              All sprites
            </EdButton>
          </div>
          {editor}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">{browser}</div>
      )}
      <ImportSpriteDialog
        open={importState.open}
        onOpenChange={(open) => setImportState((s) => ({ ...s, open, source: open ? s.source : null }))}
        onImported={(id) => {
          setSelectedId(id)
          setSelectedFolder(parentFolderOf(id))
        }}
        folder={importState.folder}
        initialSource={importState.source}
      />
      {renderDialog()}
    </div>
  )
}
