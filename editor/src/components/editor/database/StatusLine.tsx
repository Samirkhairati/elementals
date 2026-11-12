import { cn } from '@/lib/utils'
import type { Outcome } from './graphicActions'

/** A line that says what the last library action did (or why it failed); nothing before the first one. */
export function StatusLine({ outcome, className }: { outcome: Outcome | null; className?: string }) {
  if (!outcome) return null
  return outcome.ok ? (
    <p role="status" className={cn('ed-hint', className)}>
      {outcome.message}
    </p>
  ) : (
    <p role="alert" className={cn('text-destructive', className)}>
      {outcome.error}
    </p>
  )
}
