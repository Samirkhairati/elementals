import React from 'react'
import { Wand2 } from 'lucide-react'
import { ENTITY_ICON_CHOICES, NamedIcon } from '../ui/icons'
import { OVERLAY_COLORS } from '@/hooks/editor/canvas/canvasView'
import { Field, InfoTip, TextField } from '../ui/controls'
import type { CustomEditorProps } from './customEditors'

/** Tag text plus the icon the entity gets on the map (when it has no sprite) and in the lists. */
export function TagComponentEditor({ value, onChange }: CustomEditorProps) {
  const icon: string = typeof value.icon === 'string' ? value.icon : ''

  return (
    <div className="flex flex-col gap-2" data-testid="tag-editor">
      <Field label="Tag" hint="A free-form label for finding the entity (npc, chest, ...)">
        <TextField value={typeof value.tag === 'string' ? value.tag : ''} onCommit={(v) => onChange('tag', v)} placeholder="e.g. npc, chest, warp" aria-label="Tag" />
      </Field>

      <Field label="Area colour" info="Tint of this entity's outline on the map. You can also right-click an entity and pick Area colour.">
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Area colour">
          {OVERLAY_COLORS.map((c) => (
            <button
              key={c.id || 'white'}
              type="button"
              role="radio"
              aria-checked={(typeof value.color === 'string' ? value.color : '') === c.id}
              aria-label={c.label}
              title={c.label}
              onClick={() => onChange('color', c.id)}
              className="h-5 w-5 rounded-full border border-black/40 aria-checked:ring-2 aria-checked:ring-primary aria-checked:ring-offset-1 aria-checked:ring-offset-background"
              style={{ background: `rgb(${c.rgb})` }}
            />
          ))}
        </div>
      </Field>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="ed-label">Icon</span>
          <InfoTip>
            {icon === '' ? 'Automatic: picked from the tag and components.' : 'Shown on the map while the entity has no sprite, and in the entity lists.'}
          </InfoTip>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-1" role="radiogroup" aria-label="Entity icon">
          <button
            type="button"
            role="radio"
            aria-checked={icon === ''}
            aria-label="Automatic icon"
            title="Automatic: picked from the tag and components"
            data-active={icon === '' ? 'true' : undefined}
            onClick={() => onChange('icon', '')}
            className="flex h-8 items-center justify-center rounded-md border border-border bg-background/40 text-muted-foreground hover:bg-muted data-[active=true]:border-primary data-[active=true]:bg-primary/15 data-[active=true]:text-foreground"
          >
            <Wand2 className="ed-icon" />
          </button>
          {ENTITY_ICON_CHOICES.map((c) => (
            <button
              key={c.name}
              type="button"
              role="radio"
              aria-checked={icon === c.name}
              aria-label={`Icon ${c.label}`}
              title={c.label}
              data-active={icon === c.name ? 'true' : undefined}
              onClick={() => onChange('icon', c.name)}
              className="flex h-8 items-center justify-center rounded-md border border-border bg-background/40 text-muted-foreground hover:bg-muted data-[active=true]:border-primary data-[active=true]:bg-primary/15 data-[active=true]:text-foreground"
            >
              <NamedIcon name={c.name} className="ed-icon" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
