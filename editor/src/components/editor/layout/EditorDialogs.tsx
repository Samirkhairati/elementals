import React from 'react'
import { ImportTilesetDialog } from '@/components/editor/dialogs/ImportTilesetDialog'
import { CreateFolderDialog } from '@/components/editor/dialogs/CreateFolderDialog'
import { RenameDialog } from '@/components/editor/dialogs/RenameDialog'
import { ConfirmDialog } from '@/components/editor/dialogs/ConfirmDialog'
import { CreateMapFolderDialog } from '@/components/editor/dialogs/CreateMapFolderDialog'
import { CreateMapDialog } from '@/components/editor/dialogs/CreateMapDialog'

interface EditorDialogsProps {
  importDialog: { open: boolean; sourcePath?: string; defaultName?: string; targetFolder?: string | null }
  setImportDialog: React.Dispatch<React.SetStateAction<{ open: boolean; sourcePath?: string; defaultName?: string; targetFolder?: string | null }>>
  nameInput: string
  setNameInput: (v: string) => void
  handleConfirmImport: () => void

  createFolderDialog: { open: boolean; parentPath?: string | null }
  setCreateFolderDialog: React.Dispatch<React.SetStateAction<{ open: boolean; parentPath?: string | null }>>
  createFolderName: string
  setCreateFolderName: (v: string) => void
  handleConfirmCreateFolder: () => void

  renameDialog: { open: boolean; type: 'folder' | 'tileset' | 'map-folder' | 'map'; oldPath?: string; oldName?: string; targetFolder?: string | null }
  setRenameDialog: React.Dispatch<React.SetStateAction<{ open: boolean; type: 'folder' | 'tileset' | 'map-folder' | 'map'; oldPath?: string; oldName?: string; targetFolder?: string | null }>>
  renameInput: string
  setRenameInput: (v: string) => void
  handleConfirmRename: () => void

  createMapFolderDialog: { open: boolean; parentPath?: string | null }
  setCreateMapFolderDialog: React.Dispatch<React.SetStateAction<{ open: boolean; parentPath?: string | null }>>
  createMapFolderName: string
  setCreateMapFolderName: (v: string) => void
  handleConfirmCreateMapFolder: () => void

  createMapDialog: { open: boolean; parentPath?: string | null }
  setCreateMapDialog: React.Dispatch<React.SetStateAction<{ open: boolean; parentPath?: string | null }>>
  createMapData: { name: string; width: number; height: number }
  setCreateMapData: React.Dispatch<React.SetStateAction<{ name: string; width: number; height: number }>>
  handleConfirmCreateMap: () => void

  confirmDialog: { open: boolean; title: string; description: string; action: () => void }
  setConfirmDialog: React.Dispatch<React.SetStateAction<{ open: boolean; title: string; description: string; action: () => void }>>
}

export function EditorDialogs({
  importDialog,
  setImportDialog,
  nameInput,
  setNameInput,
  handleConfirmImport,
  createFolderDialog,
  setCreateFolderDialog,
  createFolderName,
  setCreateFolderName,
  handleConfirmCreateFolder,
  renameDialog,
  setRenameDialog,
  renameInput,
  setRenameInput,
  handleConfirmRename,
  createMapFolderDialog,
  setCreateMapFolderDialog,
  createMapFolderName,
  setCreateMapFolderName,
  handleConfirmCreateMapFolder,
  createMapDialog,
  setCreateMapDialog,
  createMapData,
  setCreateMapData,
  handleConfirmCreateMap,
  confirmDialog,
  setConfirmDialog
}: EditorDialogsProps) {
  return (
    <>
      <ImportTilesetDialog
        open={importDialog.open}
        nameInput={nameInput}
        setNameInput={setNameInput}
        onClose={() => setImportDialog({ open: false })}
        onConfirm={handleConfirmImport}
      />
      <CreateFolderDialog
        open={createFolderDialog.open}
        folderName={createFolderName}
        setFolderName={setCreateFolderName}
        onClose={() => setCreateFolderDialog({ open: false })}
        onConfirm={handleConfirmCreateFolder}
      />
      <RenameDialog
        open={renameDialog.open}
        type={renameDialog.type}
        renameInput={renameInput}
        setRenameInput={setRenameInput}
        onClose={() => setRenameDialog({ open: false, type: 'folder' })}
        onConfirm={handleConfirmRename}
      />
      <CreateMapFolderDialog
        open={createMapFolderDialog.open}
        folderName={createMapFolderName}
        setFolderName={setCreateMapFolderName}
        onClose={() => setCreateMapFolderDialog({ open: false })}
        onConfirm={handleConfirmCreateMapFolder}
      />
      <CreateMapDialog
        open={createMapDialog.open}
        name={createMapData.name}
        width={createMapData.width}
        height={createMapData.height}
        setName={(v) => setCreateMapData(d => ({ ...d, name: v }))}
        setWidth={(v) => setCreateMapData(d => ({ ...d, width: v }))}
        setHeight={(v) => setCreateMapData(d => ({ ...d, height: v }))}
        onClose={() => setCreateMapDialog({ open: false })}
        onConfirm={handleConfirmCreateMap}
      />
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
        onConfirm={confirmDialog.action}
      />
    </>
  )
}
