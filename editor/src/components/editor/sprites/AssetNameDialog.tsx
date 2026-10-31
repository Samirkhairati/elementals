// One small form dialog for the Assets panel: new folder, rename folder, rename asset (display name + file name).
// Mount it fresh for every use (give it a `key`); the fields start from `fields[].value`.

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EdButton } from '../ui/controls'

export interface NameField {
  key: string
  label: string
  value: string
  placeholder?: string
  /** Shown under the field. */
  hint?: string
}

interface AssetNameDialogProps {
  title: string
  description?: string
  fields: NameField[]
  confirmLabel?: string
  onClose: () => void
  /** Return an error message to keep the dialog open, or nothing to close it. */
  onSubmit: (values: Record<string, string>) => Promise<string | void> | string | void
}

export function AssetNameDialog({ title, description, fields, confirmLabel = 'Save', onClose, onSubmit }: AssetNameDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const failure = await onSubmit(values)
      if (failure) {
        setError(failure)
        setBusy(false)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={description ? 'asset-name-desc' : undefined}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription id="asset-name-desc" className="ed-hint">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            {fields.map((f, i) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="ed-label" htmlFor={`asset-name-${f.key}`}>
                  {f.label}
                </label>
                <input
                  id={`asset-name-${f.key}`}
                  className="ed-input"
                  autoFocus={i === 0}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onFocus={(e) => e.currentTarget.select()}
                />
                {f.hint && <span className="ed-hint">{f.hint}</span>}
              </div>
            ))}
            {error && (
              <div role="alert" className="rounded-md border border-solid/40 bg-solid/10 px-2 py-1 text-ed-label text-solid">
                {error}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <EdButton onClick={onClose}>Cancel</EdButton>
            <EdButton type="submit" variant="primary" disabled={busy}>
              {confirmLabel}
            </EdButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
