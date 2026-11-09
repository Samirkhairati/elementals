import React from 'react'
import type { PropBag } from '@/types/editor'
import { pxToTile, tileToPx } from '@/lib/entityVisuals'
import { Field, NumberField } from '../ui/controls'

interface TransformFieldsProps {
  value: PropBag
  onChange: (key: string, value: unknown) => void
  onChangeMany: (patch: PropBag) => void
}

/**
 * Transform: position in pixels and draw depth. A tile-based entity moves in steps of one tile (with the tile shown
 * next to it); a free one (`free: true`) takes any pixel.
 */
export function TransformFields({ value, onChange, onChangeMany }: TransformFieldsProps) {
  const x = Number(value.x) || 0
  const y = Number(value.y) || 0
  const free = value.free === true
  const { col, row } = pxToTile(x, y)
  return (
    <div className="flex flex-col gap-2" data-testid="transform-fields">
      <Field label="Position X" hint={free ? 'Anchor: the bottom-centre of the entity, any pixel' : "Anchor: bottom-centre of the entity's tile (steps of 32px)"}>
        <NumberField value={x} step={free ? 1 : 32} integer={free || undefined} unit="px" onCommit={(v) => onChange('x', v)} aria-label="Position X" />
      </Field>
      <Field label="Position Y" hint={free ? 'Anchor: the bottom of the entity, any pixel' : "Anchor: bottom edge of the entity's tile (steps of 32px)"}>
        <NumberField value={y} step={free ? 1 : 32} integer={free || undefined} unit="px" onCommit={(v) => onChange('y', v)} aria-label="Position Y" />
      </Field>
      {!free && (
        <Field label="Tile" hint="The tile the entity stands on">
          <div className="flex w-full items-center gap-2">
            <NumberField value={col} min={0} unit="col" onCommit={(c) => onChangeMany(tileToPx(c, row))} aria-label="Tile column" />
            <NumberField value={row} min={0} unit="row" onCommit={(r) => onChangeMany(tileToPx(col, r))} aria-label="Tile row" />
          </div>
        </Field>
      )}
      <Field label="Depth" hint="Draw layer; higher draws on top, and inside a layer whoever stands lower on the map draws on top. Characters 20, objects 10, flat triggers 5.">
        <NumberField value={Number(value.depth) || 0} min={0} max={999} onCommit={(v) => onChange('depth', v)} aria-label="Depth" />
      </Field>
    </div>
  )
}
