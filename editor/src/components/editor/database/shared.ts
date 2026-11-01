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
}
