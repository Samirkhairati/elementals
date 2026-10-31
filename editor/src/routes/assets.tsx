// Asset manager page: the sprite assets of the project as a folder tree that mirrors project/sprites, with
// import, rename, move and delete. It reuses the editor's sprite UI (SpritesPanel) inside its own small provider,
// so it does not need the map editor to be open.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderTree } from 'lucide-react'
import type { MapData } from '@/types/editor'
import { useSpriteAssets } from '@/hooks/useSpriteAssets'
import { migrateLoadedMap } from '@/hooks/editor/useMapManager'
import { EditorProvider, type EditorBaseContextValue } from '@/components/editor/layout/EditorContext'
import { SpritesPanel } from '@/components/editor/sprites/SpritesPanel'
import { ConfirmDialog } from '@/components/editor/dialogs/ConfirmDialog'

interface ConfirmState {
  open: boolean
  title: string
  description: string
  action: () => void
}

const CLOSED: ConfirmState = { open: false, title: '', description: '', action: () => {} }

export function AssetsPage() {
  const sprites = useSpriteAssets()
  const [maps, setMaps] = useState<MapData[]>([])
  const [confirm, setConfirm] = useState<ConfirmState>(CLOSED)

  // Maps are only read, to count how many entities use each sprite.
  useEffect(() => {
    let cancelled = false
    void window.electronAPI?.getMaps().then((res) => {
      if (!cancelled && res.success) setMaps((res.maps ?? []).map(migrateLoadedMap))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setConfirmDialog = useCallback((c: ConfirmState) => setConfirm(c), [])

  const value = useMemo(
    () =>
      ({
        spriteAssets: sprites.assets,
        spriteList: sprites.list,
        spriteFolders: sprites.folders,
        spriteWarnings: sprites.warnings,
        getSpriteAsset: sprites.getAsset,
        reloadSprites: sprites.reload,
        pickSpriteFile: sprites.pickFile,
        importSprite: sprites.importSprite,
        saveSpriteMeta: sprites.saveMeta,
        renameSprite: sprites.rename,
        removeSprite: sprites.remove,
        createSpriteFolder: sprites.createFolder,
        renameSpriteFolder: sprites.renameFolder,
        moveSpriteFolder: sprites.moveFolder,
        deleteSpriteFolder: sprites.deleteFolder,
        maps,
        activeMap: null,
        entities: [],
        setConfirmDialog,
      }) as unknown as EditorBaseContextValue,
    [sprites, maps, setConfirmDialog],
  )

  return (
    <EditorProvider value={value}>
      <div className="flex h-full min-h-0 w-full flex-col bg-sidebar" data-testid="assets-page">
        <header className="flex h-toolbar shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
          <FolderTree className="h-4 w-4 text-primary" />
          <h1 className="text-ed-title font-semibold text-foreground">Asset manager</h1>
          <span className="ed-mono text-ed-label text-muted-foreground">project/sprites</span>
        </header>
        <div className="min-h-0 flex-1">
          <SpritesPanel />
        </div>
      </div>
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        description={confirm.description}
        onClose={() => setConfirm(CLOSED)}
        onConfirm={confirm.action}
      />
    </EditorProvider>
  )
}
