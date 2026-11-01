import type { PivotDef } from '../../../../../../shared/engine/characters'

const XS = [0, 0.5, 1]
const NAMES = ['top-left', 'top', 'top-right', 'left', 'centre', 'right', 'bottom-left', 'bottom-centre', 'bottom-right']

/** 3×3 anchor picker; the dot is where the picture stands on the entity's tile anchor. */
export function PivotPicker({ value, onChange }: { value: PivotDef; onChange: (p: PivotDef) => void }) {
  return (
    <div role="radiogroup" aria-label="Pivot" className="grid w-16 grid-cols-3 gap-0.5">
      {XS.flatMap((y, r) => XS.map((x, c) => {
        const active = value.x === x && value.y === y
        return (
          <button
            key={`${r}${c}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={NAMES[r * 3 + c]}
            title={NAMES[r * 3 + c]}
            className="h-4 w-4 rounded-sm border border-border"
            style={{ background: active ? 'var(--primary, #7c3aed)' : undefined }}
            onClick={() => onChange({ x, y })}
          />
        )
      }))}
    </div>
  )
}
