// The scale of an image item: type a number, see the size it would get right away (and in the preview above), press
// Enter to apply. Esc puts the old value back. One apply = one undo step. Drawn nearest neighbour at the exact size; the game rounds to whole pixels.

import React, { useState } from 'react'
import { MAX_SCALE, MIN_SCALE, parseScale, scaledSize } from '@/lib/imageScale'
import { cn } from '@/lib/utils'

const PRESETS = [1, 2, 3, 4]

interface Props {
  scale: number
  /** The picture's size before scaling, when known. */
  source: { w: number; h: number } | null
  disabled?: boolean
  onApply: (scale: number) => void
  /** The scale being typed (null when nothing is pending), so a preview can show it before it is applied. */
  onDraft?: (scale: number | null) => void
}

export function ScaleField({ scale, source, disabled, onApply, onDraft }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const typed = draft === null ? null : parseScale(draft)
  const shown = typed ?? scale

  const setText = (text: string | null) => {
    setDraft(text)
    onDraft?.(text === null ? null : parseScale(text))
  }
  const apply = (next: number | null) => {
    setText(null)
    if (next !== null && next !== scale) onApply(next)
  }

  const before = source
  const after = source && scaledSize(source, shown)
  const invalid = draft !== null && typed === null && draft.trim() !== ''

  return (
    <div className="flex w-full flex-col gap-1.5" data-testid="scale-field">
      <div className="flex items-center gap-1">
        <div className="ed-input-wrap min-w-0 flex-1">
          <input
            type="text"
            inputMode="decimal"
            className="ed-input"
            data-unit="true"
            style={{ paddingRight: 22 }}
            aria-label="Image scale"
            aria-invalid={invalid || undefined}
            disabled={disabled}
            value={draft ?? String(Math.round(scale * 1000) / 1000)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => draft !== null && apply(typed)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                apply(typed)
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                setText(null)
                e.currentTarget.blur()
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                const step = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 1 : 0.25)
                apply(parseScale(String((typed ?? scale) + step)))
              }
            }}
          />
          <span className="ed-input-unit">×</span>
        </div>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="ed-btn"
            data-size="sm"
            data-active={scale === p ? 'true' : undefined}
            disabled={disabled}
            aria-label={`Scale ${p}×`}
            title={`Scale ${p}×`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(p)}
          >
            {p}×
          </button>
        ))}
      </div>
      {after && before && (
        <p className={cn('ed-hint tabular-nums', invalid && 'text-destructive')} data-testid="scale-sizes">
          {invalid ? `Type a number from ${MIN_SCALE} to ${MAX_SCALE}` : (
            <>
              {before.w}×{before.h} px
              {draft !== null || scale !== 1 ? <> → <strong className="font-medium text-foreground">{after.w}×{after.h} px</strong></> : null}
              {draft !== null && typed !== null && typed !== scale && <span className="opacity-70"> · Enter to apply</span>}
            </>
          )}
        </p>
      )}
    </div>
  )
}
