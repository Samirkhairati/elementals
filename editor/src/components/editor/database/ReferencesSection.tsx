import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import type { Reference } from '../../../../../shared/engine/references'
import { Badge } from '../ui/controls'

interface Props {
  title?: string
  refs: readonly Reference[]
  /** What to say when there are none. */
  empty: string
}

/** Where something is used: sprites (with a link to the sprite) and maps (with a link to the Map Editor), one line each. */
export function ReferencesSection({ title = 'Used by', refs, empty }: Props) {
  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: { key: string; label: string; kind: 'sprite' | 'map' | 'other'; id?: string }[] = []
    for (const r of refs) {
      if (seen.has(r.label)) continue
      seen.add(r.label)
      if (r.source.table === 'character') out.push({ key: r.label, label: r.label, kind: 'sprite', id: r.source.id })
      else if (r.source.table === 'map') out.push({ key: r.label, label: r.label, kind: 'map' })
      else out.push({ key: r.label, label: r.label, kind: 'other' })
    }
    return out
  }, [refs])
  return (
    <section data-testid="references">
      <h3 className="text-ed-label font-medium">{title} <Badge>{rows.length}</Badge></h3>
      {rows.length === 0 ? <p className="ed-hint">{empty}</p> : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-ed-label">
              <span className="min-w-0 flex-1 truncate" title={r.label}>{r.label}</span>
              {r.kind === 'sprite' && <Link to="/database" search={{ table: 'characters', id: r.id } as never} className="ed-hint underline" title="Open this sprite">Open sprite</Link>}
              {r.kind === 'map' && <Link to="/editor" className="ed-hint underline" title="Open the Map Editor">Open editor</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
