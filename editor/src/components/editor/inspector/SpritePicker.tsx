import React, { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import { EdButton } from '../ui/controls'
import { SpriteThumb } from '../sprites/SpriteThumb'

interface SpritePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assets: SpriteAssetInfo[]
  value: string
  onSelect: (assetId: string) => void
}

/** `characters/hero` -> { folder: 'characters', name: 'hero' } */
export function splitAssetId(id: string): { folder: string; leaf: string } {
  const i = id.lastIndexOf('/')
  return i < 0 ? { folder: '', leaf: id } : { folder: id.slice(0, i), leaf: id.slice(i + 1) }
}

/** Assets matching `query` (id or name), grouped by folder, folders and entries sorted. */
export function groupAssets(assets: SpriteAssetInfo[], query: string): { folder: string; items: SpriteAssetInfo[] }[] {
  const q = query.trim().toLowerCase()
  const groups = new Map<string, SpriteAssetInfo[]>()
  for (const a of assets) {
    if (q && !a.id.toLowerCase().includes(q) && !a.meta.name.toLowerCase().includes(q)) continue
    const { folder } = splitAssetId(a.id)
    const list = groups.get(folder) ?? []
    list.push(a)
    groups.set(folder, list)
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([folder, items]) => ({ folder, items: items.sort((x, y) => (x.id < y.id ? -1 : 1)) }))
}

const KIND_LABEL: Record<string, string> = { character: 'Character', object: 'Object', animated: 'Animated' }

export function SpritePicker({ open, onOpenChange, assets, value, onSelect }: SpritePickerProps) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => groupAssets(assets, query), [assets, query])

  const pick = (id: string) => {
    onSelect(id)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col gap-0 overflow-hidden p-0" aria-describedby="sprite-picker-desc">
          <DialogHeader className="border-b border-border px-4 py-3 text-left">
            <DialogTitle className="text-ed-title">Choose a sprite</DialogTitle>
            <DialogDescription id="sprite-picker-desc" className="ed-hint">
              {assets.length} sprite{assets.length === 1 ? '' : 's'} in this project
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <div className="ed-input-wrap flex-1">
              <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="ed-input pl-7"
                placeholder="Search sprites…"
                aria-label="Search sprites"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <button
              type="button"
              onClick={() => pick('')}
              data-selected={value === '' ? 'true' : undefined}
              className="ed-row mb-3 w-full data-[selected=true]:border-primary/50"
              aria-label="No sprite"
            >
              <X />
              <span className="ed-row-label text-left">None (no graphic)</span>
            </button>

            {groups.length === 0 && <div className="ed-empty py-8">No sprite matches “{query}”.</div>}

            {groups.map((g) => (
              <section key={g.folder || '(root)'} className="mb-4">
                <div className="ed-section-title mb-2">{g.folder || 'Sprites'}</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                  {g.items.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => pick(a.id)}
                      data-selected={a.id === value ? 'true' : undefined}
                      aria-label={`Sprite ${a.id}`}
                      title={a.id}
                      className="group flex flex-col items-center gap-1 rounded-md border border-border bg-card/40 p-2 hover:bg-muted data-[selected=true]:border-primary data-[selected=true]:bg-primary/15"
                    >
                      <div className="ed-checker flex h-16 w-full items-center justify-center rounded-sm">
                        <SpriteThumb asset={a} size={56} />
                      </div>
                      <div className="w-full truncate text-center text-ed-label text-foreground">{a.meta.name || splitAssetId(a.id).leaf}</div>
                      <span className="ed-badge" data-tone={a.meta.kind === 'character' ? 'move' : a.meta.kind === 'animated' ? 'event' : undefined}>
                        {KIND_LABEL[a.meta.kind] ?? a.meta.kind}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}
