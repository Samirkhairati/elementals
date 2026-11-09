import { ArrowDownUp } from 'lucide-react'
import { ContextMenuItem, ContextMenuShortcut } from '@/components/ui/context-menu'

/**
 * The "Enable / Disable Y-sort" entry of a right-click menu (layers, folders, picture groups, pictures). `own` is the
 * row's own setting, `inherited` what it gets from its folder / layer / group when it has none (`from` names that). A
 * click flips what the row does now; flipping back to what it would inherit clears its own setting, so it follows
 * its parent again.
 */
export function YSortMenuItem({ own, inherited, from, disabled, title, onChange }: {
  own: boolean | undefined
  inherited: boolean
  from?: string
  disabled?: boolean
  title?: string
  onChange: (value: boolean | undefined) => void
}) {
  const on = own ?? inherited
  const next = !on
  return (
    <ContextMenuItem disabled={disabled} title={title} onClick={() => onChange(from && next === inherited ? undefined : next)}>
      <ArrowDownUp className="mr-2 h-3.5 w-3.5" />
      {on ? 'Disable Y-sort' : 'Enable Y-sort'}
      {own === undefined && inherited && from && <ContextMenuShortcut>from {from}</ContextMenuShortcut>}
    </ContextMenuItem>
  )
}

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
