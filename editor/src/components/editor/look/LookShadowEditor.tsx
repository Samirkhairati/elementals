// The drop shadow of a layer or a picture (Look.shadow): direction and length, softness, darkness, colour and blend
// mode. A picture without its own shows what it gets from its layer and can take its own or switch it off.

import { CloudSun } from 'lucide-react'
import { DEFAULT_SHADOW, MAX_SHADOW_SOFTNESS, SHADOW_BLENDS } from '../../../../../shared/look/schema'
import type { LookShadow, ShadowBlend } from '../../../../../shared/look/types'
import { EdButton, Field } from '../ui/controls'
import { ColorField, Select } from '../ui/fields'
import { LookSection, LookSlider, type Change } from './lookControls'

const BLEND_LABELS: Record<ShadowBlend, string> = { normal: 'Normal', multiply: 'Multiply', screen: 'Screen (glow)', add: 'Add (glow)' }

/** Angle (degrees, 0 = to the right, 90 = down) and length of an offset, and back (to half pixels). */
export const shadowPolar = (s: Pick<LookShadow, 'x' | 'y'>) => ({ angle: Math.round((Math.atan2(s.y, s.x) * 180) / Math.PI), distance: Math.round(Math.hypot(s.x, s.y) * 2) / 2 })
export function shadowOffset(angle: number, distance: number): { x: number; y: number } {
  const r = (angle * Math.PI) / 180
  const half = (v: number) => Math.round(v * 2) / 2 || 0
  return { x: half(Math.cos(r) * distance), y: half(Math.sin(r) * distance) }
}

export interface LookShadowEditorProps {
  shadow: LookShadow | undefined
  /** What this subject gets when it has none of its own (a picture: its layer's shadow). */
  inherited?: LookShadow
  onChange: Change<LookShadow | undefined>
  defaultOpen?: boolean
}

export function LookShadowEditor({ shadow, inherited, onChange, defaultOpen }: LookShadowEditorProps) {
  const summary = shadow ? (shadow.off ? 'Off' : `${shadowPolar(shadow).distance} px, ${shadow.opacity ?? 50}%`) : inherited && !inherited.off ? "Layer's" : undefined
  const set = (patch: Partial<LookShadow>, done: boolean) => onChange({ ...(shadow ?? inherited ?? DEFAULT_SHADOW), ...patch }, done)
  const polar = shadow ? shadowPolar(shadow) : null

  return (
    <LookSection
      title="Shadow"
      icon={<CloudSun />}
      defaultOpen={defaultOpen}
      summary={summary}
      visible={!shadow?.off}
      onToggleVisible={shadow ? () => onChange({ ...shadow, off: shadow.off ? undefined : true }, true) : undefined}
      onReset={shadow ? () => onChange(undefined, true) : undefined}
    >
      {!shadow ? (
        <div className="flex flex-wrap items-center gap-2">
          <EdButton size="sm" variant="primary" onClick={() => onChange({ ...(inherited && !inherited.off ? inherited : DEFAULT_SHADOW) }, true)}>
            {inherited && !inherited.off ? 'Own shadow' : 'Add shadow'}
          </EdButton>
          {inherited && !inherited.off ? (
            <EdButton size="sm" onClick={() => onChange({ ...inherited, off: true }, true)}>
              No shadow here
            </EdButton>
          ) : null}
        </div>
      ) : (
        <>
          <LookSlider label="Direction" value={polar!.angle} defaultValue={53} min={-180} max={180} step={1} unit="°" onChange={(angle, done) => set(shadowOffset(angle, polar!.distance), done)} />
          <LookSlider label="Distance" value={polar!.distance} defaultValue={10} min={0} max={128} step={0.5} unit="px" onChange={(d, done) => set(shadowOffset(polar!.angle, d), done)} />
          <LookSlider label="Softness" value={shadow.softness ?? 0} min={0} max={MAX_SHADOW_SOFTNESS} step={0.5} unit="px" onChange={(softness, done) => set({ softness: softness || undefined }, done)} />
          <LookSlider label="Darkness" value={shadow.opacity ?? 50} defaultValue={50} min={0} max={100} step={1} unit="%" onChange={(opacity, done) => set({ opacity }, done)} />
          <Field label="Color">
            <ColorField aria-label="Shadow colour" value={shadow.color ?? '#000000'} onChange={(color) => set({ color: color === '#000000' ? undefined : color }, true)} />
          </Field>
          <Field label="Blend">
            <Select<ShadowBlend>
              aria-label="Shadow blend mode"
              value={shadow.blend ?? 'multiply'}
              options={SHADOW_BLENDS.map((b) => ({ value: b, label: BLEND_LABELS[b] }))}
              onChange={(blend) => set({ blend: blend === 'multiply' ? undefined : blend }, true)}
            />
          </Field>
        </>
      )}
    </LookSection>
  )
}
