// Dialogs the asset tables share: name something, confirm a change that rewrites references, confirm a delete.

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Reference } from '../../../../../shared/engine/references'
import { summarizeReferences, type AssetPlan } from '@/lib/assetOps'
import { EdButton } from '../ui/controls'

/** The reference labels of a plan, once each. */
const labelsOf = (refs: readonly Reference[]): string[] => [...new Set(refs.map((r) => r.label))]

function ReferencePreview({ references, extra }: { references: readonly Reference[]; extra?: string }) {
  if (references.length === 0) return <p className="ed-hint">Nothing else needs to change.</p>
  return (
    <div data-testid="change-preview" className="text-ed-label">
      <p>{summarizeReferences(references)} will be updated automatically{extra ? `; ${extra}` : ''}.</p>
      <ul className="mt-1 max-h-40 overflow-auto rounded border border-border bg-card/30 p-1.5 ed-hint">
        {labelsOf(references).map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  )
}

interface NameProps {
  open: boolean
  title: string
  description?: string
  label: string
  initial?: string
  confirmLabel: string
  /** Problem with the typed value ('' when fine). */
  validate?: (value: string) => string
  /** Does the work; resolves to an error message ('' when it worked). */
  onSubmit: (value: string) => Promise<string>
  onClose: () => void
}

/** One text field and a button: new folder, rename folder. */
export function NameDialog({ open, title, description, label, initial = '', confirmLabel, validate, onSubmit, onClose }: NameProps) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const problem = validate?.(value) ?? ''
  const submit = async () => {
    setBusy(true)
    const e = await onSubmit(value)
    setBusy(false)
    if (e) setError(e)
    else onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby="name-dialog-desc">
        <form onSubmit={(e) => { e.preventDefault(); if (!problem && !busy) void submit() }} className="flex flex-col gap-3">
          <DialogHeader className="text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription id="name-dialog-desc" className="ed-hint">{description ?? ' '}</DialogDescription>
          </DialogHeader>
          <input className="ed-input" aria-label={label} value={value} onChange={(e) => { setValue(e.target.value); setError('') }} autoFocus />
          {(problem && value !== initial) && <p role="alert" className="text-destructive">{problem}</p>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <EdButton type="button" onClick={onClose}>Cancel</EdButton>
            <EdButton type="submit" variant="primary" disabled={!!problem || busy}>{confirmLabel}</EdButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ChangeProps {
  open: boolean
  title: string
  description: string
  /** The fields that make up the change. */
  children: React.ReactNode
  /** What the change touches; null while the fields are not filled in. */
  plan: AssetPlan | null
  confirmLabel: string
  /** Extra remark under the preview. */
  note?: string
  onConfirm: () => Promise<string>
  onClose: () => void
}

/** A rename / move: the fields, then what will be rewritten, then the button. */
export function ChangeDialog({ open, title, description, children, plan, confirmLabel, note, onConfirm, onClose }: ChangeProps) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    const e = await onConfirm()
    setBusy(false)
    if (e) setError(e)
    else onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby="change-dialog-desc">
        <DialogHeader className="text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="change-dialog-desc" className="ed-hint">{description}</DialogDescription>
        </DialogHeader>
        {children}
        {plan?.problem && <p role="alert" className="text-destructive">{plan.problem}</p>}
        {plan?.ok && <ReferencePreview references={plan.references} extra={plan.characters.length + plan.maps.length > 0 ? `${plan.characters.length + plan.maps.length} file${plan.characters.length + plan.maps.length === 1 ? '' : 's'} will be rewritten` : undefined} />}
        {note && <p className="ed-hint">{note}</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <EdButton onClick={onClose}>Cancel</EdButton>
          <EdButton variant="primary" disabled={!plan?.ok || busy} onClick={() => void confirm()}>{confirmLabel}</EdButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteProps {
  open: boolean
  title: string
  /** What goes, e.g. "the picture and its file". */
  description: string
  guard: { allowed: boolean; references: readonly Reference[] }
  /** Shown when blocked: what to do about it. */
  blockedHint?: string
  onConfirm: () => Promise<string>
  onClose: () => void
}

export function DeleteDialog({ open, title, description, guard, blockedHint, onConfirm, onClose }: DeleteProps) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    const e = await onConfirm()
    setBusy(false)
    if (e) setError(e)
    else onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby="delete-dialog-desc">
        <DialogHeader className="text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="delete-dialog-desc" className="ed-hint">{guard.allowed ? description : 'Something still uses it, so it cannot be deleted.'}</DialogDescription>
        </DialogHeader>
        {!guard.allowed && (
          <div data-testid="delete-blocked" className="text-ed-label">
            <p>{summarizeReferences(guard.references)}:</p>
            <ul className="mt-1 max-h-40 overflow-auto rounded border border-border bg-card/30 p-1.5 ed-hint">{labelsOf(guard.references).map((l) => <li key={l}>{l}</li>)}</ul>
            <p className="ed-hint mt-1">{blockedHint ?? 'Change those first, or rename it instead.'}</p>
          </div>
        )}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <EdButton onClick={onClose}>Cancel</EdButton>
          <EdButton variant="danger" disabled={!guard.allowed || busy} onClick={() => void confirm()}>Delete</EdButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
