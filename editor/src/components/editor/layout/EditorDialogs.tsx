import React from 'react'
import { RenameDialog } from '@/components/editor/dialogs/RenameDialog'
import { ConfirmDialog } from '@/components/editor/dialogs/ConfirmDialog'
import { CreateMapFolderDialog } from '@/components/editor/dialogs/CreateMapFolderDialog'
import { CreateMapDialog } from '@/components/editor/dialogs/CreateMapDialog'

interface EditorDialogsProps {
  renameDialog: { open: boolean; type: 'folder' | 'map-folder' | 'map' | 'layer'; oldPath?: string; oldName?: string; targetFolder?: string | null }
  setRenameDialog: React.Dispatch<React.SetStateAction<{ open: boolean; type: 'folder' | 'map-folder' | 'map' | 'layer'; oldPath?: string; oldName?: string; targetFolder?: string | null }>>
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
