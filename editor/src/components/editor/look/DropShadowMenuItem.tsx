import { CloudSun } from 'lucide-react'
import { DEFAULT_SHADOW } from '../../../../../shared/look/schema'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { hasShadow, withShadowEverywhere } from '@/lib/look/lookEdit'
import { getLookSet } from '@/lib/look/lookSubjects'
import { setLookView, type LookSubjectRef } from '@/lib/look/lookView'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'

type Subject = Exclude<LookSubjectRef, { kind: 'map' }>

const select = (c: EditorContextValue) => ({ activeMap: c.activeMap, layers: c.layers, setLook: c.setLook, openPanel: c.openPanel })

/**
 * "Add drop shadow" on a tile or image layer or a picture: gives it a shadow in every profile (unless it has one) and
 * opens the Look panel on it.
 */
export function useDropShadow(): (subject: Subject) => void {
  const ctx = useEditorSelector(select)
  return (subject) => {
    const set = getLookSet(ctx.activeMap, ctx.layers, subject)
    if (!hasShadow(set)) ctx.setLook(subject, withShadowEverywhere(set, DEFAULT_SHADOW), true)
    setLookView({ pinned: subject })
    ctx.openPanel('look')
  }
}

const TITLE = 'A soft shadow under it, set per look profile in the Look panel (direction, softness, darkness, colour, blend)'

export interface DropShadowItemProps {
  /** It casts a shadow already (the entry then only opens the Look panel on it). */
  has: boolean
  onClick: () => void
  disabled?: boolean
}

const label = (has: boolean) => (has ? 'Edit drop shadow…' : 'Add drop shadow')

/** The drop shadow entry of a right-click menu (layers, pictures). */
export function DropShadowMenuItem({ has, onClick, disabled }: DropShadowItemProps) {
  return (
    <ContextMenuItem disabled={disabled} title={TITLE} onClick={onClick}>
      <CloudSun />
      {label(has)}
    </ContextMenuItem>
  )
}

/** The same entry in a dropdown menu (the canvas menu over a picture). */
export function DropShadowDropdownItem({ has, onClick, disabled }: DropShadowItemProps) {
  return (
    <DropdownMenuItem disabled={disabled} title={TITLE} onClick={onClick}>
      <CloudSun />
      {label(has)}
    </DropdownMenuItem>
  )
}
