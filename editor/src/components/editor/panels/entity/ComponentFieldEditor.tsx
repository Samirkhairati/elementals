import React from 'react'
import { ComponentFieldDef } from '@/types/editor'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ComponentFieldEditorProps {
  field: ComponentFieldDef
  value: any
  onChange: (val: any) => void
}

export function ComponentFieldEditor({ field, value, onChange }: ComponentFieldEditorProps) {
  const currentValue = value !== undefined ? value : ''

  switch (field.type) {
    case 'number':
      return (
        <div className="flex items-center justify-between gap-2 py-1">
          <label className="text-[11px] font-mono text-muted-foreground shrink-0 select-none">
            {field.label}
          </label>
          <Input
            type="number"
            value={currentValue === '' ? '' : currentValue}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            placeholder={field.placeholder}
            onChange={e => {
              const val = e.target.value === '' ? 0 : Number(e.target.value)
              onChange(val)
            }}
            className="h-7 w-28 text-right text-xs font-mono bg-background/50 border-input/60 px-2"
          />
        </div>
      )

    case 'string':
      return (
        <div className="space-y-1 py-1">
          <label className="text-[11px] font-mono text-muted-foreground block select-none">
            {field.label}
          </label>
          <Input
            type="text"
            value={currentValue}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value)}
            className="h-7 text-xs font-mono bg-background/50 border-input/60 px-2"
          />
        </div>
      )

    case 'boolean':
      return (
        <div className="flex items-center justify-between py-1">
          <label className="text-[11px] font-mono text-muted-foreground select-none">
            {field.label}
          </label>
          <Switch
            checked={Boolean(currentValue)}
            onCheckedChange={checked => onChange(checked)}
            className="scale-75 origin-right"
          />
        </div>
      )

    case 'select':
      return (
        <div className="space-y-1 py-1">
          <label className="text-[11px] font-mono text-muted-foreground block select-none">
            {field.label}
          </label>
          <Select value={String(currentValue)} onValueChange={val => onChange(val)}>
            <SelectTrigger className="h-7 text-xs font-mono bg-background/50 border-input/60">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="font-mono text-xs">
              {(field.options || []).map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )

    case 'textarea':
      return (
        <div className="space-y-1 py-1">
          <label className="text-[11px] font-mono text-muted-foreground block select-none">
            {field.label}
          </label>
          <textarea
            value={currentValue}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value)}
            rows={2}
            className="w-full text-xs font-mono bg-background/50 border border-input/60 rounded-md p-2 outline-none focus:ring-1 focus:ring-primary resize-y min-h-[44px]"
          />
        </div>
      )

    default:
      return null
  }
}
