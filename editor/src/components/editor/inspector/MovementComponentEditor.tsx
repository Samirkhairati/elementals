import React from 'react'
import { Gamepad2, Info, Pause, Shuffle } from 'lucide-react'
import type { Controller } from '../../../../../shared/engine/types'
import { CONTROLLERS } from '../../../../../shared/engine/constants'
import { Field, NumberField, Segmented, Toggle } from '../ui/controls'
import type { CustomEditorProps } from './customEditors'

export const CONTROLLER_INFO: Record<Controller, { label: string; icon: React.ReactNode; description: string }> = {
  none: { label: 'None', icon: <Pause />, description: 'Stays put. Events can still move it with a move route.' },
  player: { label: 'Player', icon: <Gamepad2 />, description: 'Driven by the keyboard / touch input. Use one per map.' },
  wander: { label: 'Wander', icon: <Shuffle />, description: 'Roams randomly around where it was placed.' },
}

/** Preview of the roaming area: the tile the entity starts on and every tile within `radius` tiles. */
export function WanderPreview({ radius }: { radius: number }) {
  const r = Math.max(1, Math.min(20, Math.round(radius) || 1))
  const cells = r * 2 + 1
  const size = 132
  const cell = Math.max(3, Math.floor(size / cells))
  const side = cell * cells
  const c = side / 2
  return (
    <svg width={side} height={side} viewBox={`0 0 ${side} ${side}`} role="img" aria-label={`Wander area: ${r} tiles around the start tile`} data-testid="wander-preview" shapeRendering="crispEdges">
      <rect width={side} height={side} fill="hsl(0 0% 100% / 0.04)" />
      {cell >= 6 &&
        Array.from({ length: cells + 1 }, (_, i) => (
          <g key={i} stroke="hsl(0 0% 100% / 0.1)">
            <line x1={i * cell + 0.5} x2={i * cell + 0.5} y1={0} y2={side} />
            <line y1={i * cell + 0.5} y2={i * cell + 0.5} x1={0} x2={side} />
          </g>
        ))}
      <circle cx={c} cy={c} r={r * cell + cell / 2} fill="hsl(var(--accent-emerald) / 0.14)" stroke="hsl(var(--accent-emerald))" strokeDasharray="4 3" strokeWidth={1.5} />
      <rect x={r * cell} y={r * cell} width={cell} height={cell} fill="hsl(var(--accent-emerald))" />
    </svg>
  )
}

export function MovementComponentEditor({ value, onChange }: CustomEditorProps) {
  const controller: Controller = CONTROLLERS.includes(value.controller) ? value.controller : 'none'
  const info = CONTROLLER_INFO[controller]
  const speed = Number(value.speed) || 100
  const radius = Number(value.wanderRadius) || 3
  const interval = Number(value.wanderInterval) || 4000

  return (
    <div className="flex flex-col gap-3" data-testid="movement-editor">
      <div className="flex flex-col gap-1">
        <Segmented
          aria-label="Controller"
          className="w-full"
          value={controller}
          onChange={(c) => onChange('controller', c)}
          options={CONTROLLERS.map((c) => ({ value: c, label: CONTROLLER_INFO[c].label, icon: CONTROLLER_INFO[c].icon, title: CONTROLLER_INFO[c].description }))}
        />
        <div className="ed-hint" data-testid="controller-description">
          {info.description}
        </div>
      </div>

      {controller !== 'none' && (
        <Field label="Speed" hint="Walking speed in pixels per second">
          <NumberField value={speed} min={10} max={500} step={10} unit="px/s" onCommit={(v) => onChange('speed', v)} aria-label="Speed" />
        </Field>
      )}
      {controller === 'none' && (
        <Field label="Speed" hint="Used when an event moves this entity">
          <NumberField value={speed} min={10} max={500} step={10} unit="px/s" onCommit={(v) => onChange('speed', v)} aria-label="Speed" />
        </Field>
      )}

      {controller === 'player' && (
        <Field label="Can run" hint="Allow running with the run key">
          <Toggle checked={value.canRun !== false} onChange={(v) => onChange('canRun', v)} aria-label="Can run" />
        </Field>
      )}

      {controller === 'wander' && (
        <>
          <Field label="Radius" hint="How far (in tiles) it may roam from the tile it was placed on">
            <NumberField value={radius} min={1} max={20} unit="tiles" onCommit={(v) => onChange('wanderRadius', v)} aria-label="Wander radius" />
          </Field>
          <Field label="Interval" hint="Pause between wander decisions">
            <NumberField value={interval} min={500} max={30000} step={500} unit="ms" onCommit={(v) => onChange('wanderInterval', v)} aria-label="Wander interval" />
          </Field>
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-2">
            <div className="shrink-0">
              <WanderPreview radius={radius} />
            </div>
            <div className="ed-hint">
              The ring is the roaming area: {radius * 2 + 1}×{radius * 2 + 1} tiles around its start tile. It also shows on the map while the entity is selected.
            </div>
          </div>
        </>
      )}

      <div className="flex items-start gap-2 rounded-md bg-muted/30 p-2 ed-hint">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>Whether the world moves tile by tile or freely is a setting of the game, not of this entity.</span>
      </div>
    </div>
  )
}
