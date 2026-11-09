// The strip above a library list (graphics, tilesets): Import… (several files), New folder…, where imports go, and
// what the last import did.

import { useState } from 'react'
import { FolderPlus, Upload, X } from 'lucide-react'
import { EdButton, InfoTip } from '../ui/controls'
import type { LibraryControls } from './shared'

export function LibraryToolbar({ library, info, newFolder }: { library?: LibraryControls; info: React.ReactNode; newFolder: (onClose: () => void, parent: string) => React.ReactNode }) {
  const [folderOpen, setFolderOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1 border-b border-border p-2">
      <div className="flex items-center gap-1">
        <EdButton size="sm" onClick={() => library?.pick()} disabled={!library}><Upload /> Import…</EdButton>
        <EdButton size="sm" title={library?.folder ? `Creates the folder inside ${library.folder} (the folder last clicked)` : 'Creates the folder at the top level'} onClick={() => setFolderOpen(true)}><FolderPlus /> New folder…</EdButton>
        <InfoTip>{info}</InfoTip>
      </div>
      {library && (
        <p className="ed-hint flex items-center gap-1" data-testid="import-target">
          {library.folder ? <>Importing into <code className="rounded bg-muted px-1">{library.folder}</code></> : 'Importing into the top level'}
          {library.folder && <button type="button" className="ed-iconbtn" title="Back to the top level" aria-label="Clear the import folder" onClick={() => library.setFolder('')}><X /></button>}
        </p>
      )}
      {library?.note && (library.note.ok ? <p role="status" className="ed-hint">{library.note.text}</p> : <p role="alert" className="text-destructive">{library.note.text}</p>)}
      {folderOpen && newFolder(() => setFolderOpen(false), library?.folder ?? '')}
    </div>
  )
}
