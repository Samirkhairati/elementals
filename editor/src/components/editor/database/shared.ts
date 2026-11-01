import type { DatabaseData } from './useDatabaseData'

/** Props every table's browser gets. */
export interface TableProps {
  data: DatabaseData
  query: string
  selected: string
  onSelect: (id: string) => void
}
