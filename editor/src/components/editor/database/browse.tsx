// Pieces the table browsers share: list / tiles view mode, thumbnails and the tile button.

import { useEffect, useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { thumbFrame } from '@/lib/characterThumb'
import type { CharacterDef } from '../../../../../shared/engine/characters'
import { sheetFrameRect } from '../../../../../shared/engine/characters'
import { IconButton } from '../ui/controls'

export type ViewMode = 'list' | 'tiles'

const storageKey = (table: string) => `database.view.${table}`

/** The view mode of a table, remembered in this browser (a convenience: it works without storage too). */
export function useViewMode(table: string): [ViewMode, (mode: ViewMode) => void] {
  const read = (): ViewMode => {
    try {
      return localStorage.getItem(storageKey(table)) === 'tiles' ? 'tiles' : 'list'
    } catch {
      return 'list'
    }
  }
  const [mode, setMode] = useState<ViewMode>(read)
  useEffect(() => setMode(read()), [table]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (next: ViewMode) => {
    setMode(next)
    try {
      localStorage.setItem(storageKey(table), next)
    } catch {
      /* private window or blocked storage: the choice just is not remembered */
    }
  }
  return [mode, set]
}

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="View">
      <IconButton title="List view" aria-label="List view" active={mode === 'list'} onClick={() => onChange('list')}><List /></IconButton>
      <IconButton title="Tile view" aria-label="Tile view" active={mode === 'tiles'} onClick={() => onChange('tiles')}><LayoutGrid /></IconButton>
    </div>
  )
}

/** A picture scaled to fit a square box (whole-number zoom when it can be, pixelated). */
export function ImageThumb({ url, size, className }: { url?: string; size: number; className?: string }) {
  return (
    <span className={cn('ed-checker flex shrink-0 items-center justify-center overflow-hidden rounded-sm', className)} style={{ width: size, height: size }} aria-hidden>
      {url && <img src={url} alt="" draggable={false} className="max-h-full max-w-full object-contain" style={{ imageRendering: 'pixelated' }} />}
    </span>
  )
}

/** The idle frame of a character, centred in a square box. */
export function CharacterThumb({ def, images, sizes, size }: { def: CharacterDef; images: Record<string, string>; sizes: Record<string, { width: number; height: number }>; size: number }) {
  const shown = thumbFrame(def)
  const sheet = shown ? def.sheets[shown.sheet] : undefined
  const url = sheet ? images[sheet.image] : undefined
  const image = sheet ? sizes[sheet.image] : undefined
  const box = 'ed-checker flex shrink-0 items-center justify-center overflow-hidden rounded-sm'
  if (!shown || !sheet || !url || !image) return <span className={box} style={{ width: size, height: size }} aria-hidden />
  const r = sheetFrameRect(sheet, shown.frame, image.width)
  const fit = Math.min((size - 4) / r.w, (size - 4) / r.h)
  const zoom = fit >= 1 ? Math.floor(fit) : fit
  return (
    <span className={box} style={{ width: size, height: size }} aria-hidden data-testid="character-thumb">
      <span style={{ width: r.w * zoom, height: r.h * zoom, backgroundImage: `url(${url})`, backgroundSize: `${image.width * zoom}px ${image.height * zoom}px`, backgroundPosition: `-${r.x * zoom}px -${r.y * zoom}px`, imageRendering: 'pixelated' }} />
    </span>
  )
}

/** One entry in the tile view: a picture over its name. */
export function Tile({ selected, title, name, hint, thumb, badge, onClick }: { selected: boolean; title?: string; name: string; hint?: React.ReactNode; thumb: React.ReactNode; badge?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title ?? name}
      aria-label={name}
      data-selected={selected ? 'true' : undefined}
      onClick={onClick}
      className="relative flex flex-col items-center gap-1 rounded-md border border-border bg-card/40 p-1.5 text-center hover:bg-muted data-[selected=true]:border-primary data-[selected=true]:bg-primary/15"
    >
      {thumb}
      <span className="w-full truncate text-ed-label text-foreground">{name}</span>
      {hint && <span className="ed-hint w-full truncate">{hint}</span>}
      {badge && <span className="absolute right-1 top-1">{badge}</span>}
    </button>
  )
}

/** Folder name of an id (`characters/hero` -> `characters`); '' at the top level. */
export const folderOf = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')

/** Items split by folder, folders sorted; the tile view shows one titled grid per folder. */
export function groupByFolder<T>(items: T[], idOf: (item: T) => string): { folder: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(folderOf(idOf(item)), [...(groups.get(folderOf(idOf(item))) ?? []), item])
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([folder, list]) => ({ folder, items: list }))
}

export function TileGroups<T>({ groups, children }: { groups: { folder: string; items: T[] }[]; children: (item: T) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <section key={g.folder || '(root)'}>
          {g.folder && <div className="ed-section-title mb-1">{g.folder}</div>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">{g.items.map(children)}</div>
        </section>
      ))}
    </div>
  )
}
