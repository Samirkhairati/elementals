import { Select } from '../../ui/fields'
import React from 'react'
import { ComponentFieldDef } from '@/types/editor'
import { Field, NumberField, TextField, Toggle } from '../../ui/controls'

interface ComponentFieldEditorProps {
  field: ComponentFieldDef
  value: unknown
  onChange: (val: unknown) => void
}

/** Generic schema-driven field (used for components without a custom editor, e.g. Tag). */
export function ComponentFieldEditor({ field, value, onChange }: ComponentFieldEditorProps) {
  const label = field.label
  const hint = field.help

  switch (field.type) {
    case 'number':
      return (
        <Field label={label} hint={hint}>
          <NumberField
            value={typeof value === 'number' ? value : Number(value) || 0}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            unit={field.unit}
            onCommit={onChange}
            aria-label={label}
          />
        </Field>
      )

    case 'string':
      return (
        <Field label={label} hint={hint}>
          <TextField value={String(value ?? '')} placeholder={field.placeholder} onCommit={onChange} aria-label={label} />
        </Field>
      )

    case 'boolean':
      return (
        <Field label={label} hint={hint}>
          <Toggle checked={Boolean(value)} onChange={onChange} aria-label={label} />
        </Field>
      )

    case 'select':
      return (
        <Field label={label} hint={hint}>
          <Select aria-label={label} value={String(value ?? '')} options={(field.options || []).map((opt) => ({ value: String(opt.value), label: opt.label }))} onChange={onChange} />
        </Field>
      )

    case 'textarea':
      return (
        <Field label={label} hint={hint} stack>
          <textarea
            value={String(value ?? '')}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            aria-label={label}
            className="ed-input min-h-[56px] resize-y py-1"
            style={{ height: 'auto' }}
          />
        </Field>
      )

    default:
      return null
  }
}
