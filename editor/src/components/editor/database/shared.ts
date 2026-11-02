import type { DatabaseData } from './useDatabaseData'
import type { ViewMode } from './browse'

/** Props every table's browser gets. */
export interface TableProps {
  data: DatabaseData
  query: string
  selected: string
  onSelect: (id: string) => void
  /** List or tiles; only tables that show pictures use it. */
  mode: ViewMode
  /** Set for the libraries that import files (graphics, tilesets). */
  library?: LibraryControls
}

/** What the library tables (graphics, tilesets) share with their toolbar: the folder imports go to, and importing. */
export interface LibraryControls {
  /** The folder last clicked ('' = none, i.e. the top level). Always one that exists. */
  folder: string
  setFolder: (folder: string) => void
  /** Open the native picker (several files), then the import dialog. */
  pick: () => void
  /** Files dropped from the OS onto `folder`: the import dialog opens for them. */
  dropFiles: (files: File[], folder: string) => void
  /** Pictures pasted from the clipboard into `folder`: the same import dialog opens for them. */
  pasteFiles: (files: File[], folder: string) => void
  /** What the last import did, or why it failed. */
  note: { ok: boolean; text: string } | null
}
