import { ArrowDownUp } from 'lucide-react'

/** The small "Y" badge of a row that draws y-sorted. */
export function YSortBadge({ inherited, testId = 'ysort-badge' }: { inherited: boolean; testId?: string }) {
  return (
    <span
      className="ed-badge"
      data-testid={testId}
      style={inherited ? { opacity: 0.6 } : undefined}
      title={inherited ? 'Y-sorted (follows its parent): draws among the characters by how far down it stands' : 'Y-sorted: draws among the characters by how far down it stands'}
    >
      <ArrowDownUp />Y
    </span>
  )
}
