import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { GraphicInfo } from '../../../../../shared/engine/graphics'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import type { ImagePick } from '@/lib/graphicAssets'
import { Segmented } from '../ui/controls'
import { GraphicThumb, Tile, TileGroups, groupByFolder } from '../database/browse'
import { groupAssets, splitAssetId } from '../inspector/SpritePicker'
import { SpriteThumb } from '../sprites/SpriteThumb'

export type PictureTab = 'sprites' | 'graphics'

const TAB_LABELS: Record<PictureTab, string> = { sprites: 'Sprites', graphics: 'Pictures' }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which kinds can be picked, in tab order. */
  tabs?: PictureTab[]
  title?: string
  sprites?: SpriteAssetInfo[]
  graphics?: GraphicInfo[]
  /** data: URL of every graphic by id. */
  images?: Record<string, string>
  /** Highlighted entry. */
  value?: ImagePick
  onPick: (pick: ImagePick) => void
  /** Extra content under the grid (an import form, for example). */
  footer?: React.ReactNode
}

/** Graphics matching `query` (id), sorted, grouped by folder. */
export function groupGraphics(graphics: readonly GraphicInfo[], query: string): { folder: string; items: GraphicInfo[] }[] {
  const q = query.trim().toLowerCase()
  const shown = graphics.filter((g) => !q || g.id.toLowerCase().includes(q)).sort((a, b) => (a.id < b.id ? -1 : 1))
  return groupByFolder(shown, (g) => g.id)
}

/**
 * One browser for everything that can be drawn: sprites (people, objects, animated props) and plain pictures from
 * the graphics library, with search and folders. Used wherever the editor asks "which picture?".
 */
export function PicturePicker({ open, onOpenChange, tabs = ['sprites', 'graphics'], title = 'Choose a picture', sprites = [], graphics = [], images = {}, value, onPick, footer }: Props) {
  const [tab, setTab] = useState<PictureTab>(tabs[0])
  const [query, setQuery] = useState('')
  const current = tabs.includes(tab) ? tab : tabs[0]
  const spriteGroups = useMemo(() => groupAssets(sprites, query), [sprites, query])
  const graphicGroups = useMemo(() => groupGraphics(graphics, query), [graphics, query])
  const counts: Record<PictureTab, number> = { sprites: sprites.length, graphics: graphics.length }

  const pick = (p: ImagePick) => {
    onPick(p)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col gap-0 overflow-hidden p-0" aria-describedby="picture-picker-desc">
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="text-ed-title">{title}</DialogTitle>
          <DialogDescription id="picture-picker-desc" className="ed-hint">
            {tabs.map((t) => `${counts[t]} ${TAB_LABELS[t].toLowerCase()}`).join(' · ')} in this project
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          {tabs.length > 1 && <Segmented<PictureTab> aria-label="Kind of picture" value={current} options={tabs.map((t) => ({ value: t, label: `${TAB_LABELS[t]} · ${counts[t]}` }))} onChange={setTab} />}
          <div className="ed-input-wrap flex-1">
            <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
            <input autoFocus className="ed-input pl-7" placeholder={`Search ${TAB_LABELS[current].toLowerCase()}…`} aria-label="Search pictures" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {current === 'sprites' && (
            <>
              {spriteGroups.length === 0 && <div className="ed-empty py-8">{sprites.length === 0 ? 'No sprites in the project yet.' : `No sprite matches “${query}”.`}</div>}
              <TileGroups groups={spriteGroups}>
                {(a) => <Tile key={a.id} selected={value?.assetId === a.id} name={a.meta.name || splitAssetId(a.id).leaf} title={a.id} hint={a.meta.kind} thumb={<div className="ed-checker flex h-14 w-14 items-center justify-center rounded-sm"><SpriteThumb asset={a} size={56} /></div>} onClick={() => pick({ assetId: a.id })} />}
              </TileGroups>
            </>
          )}
          {current === 'graphics' && (
            <>
              {graphicGroups.length === 0 && <div className="ed-empty py-8">{graphics.length === 0 ? 'No pictures yet. Import one in Database › Graphics.' : `No picture matches “${query}”.`}</div>}
              <TileGroups groups={graphicGroups}>
                {(g) => <Tile key={g.id} selected={value?.graphicId === g.id} name={g.id.slice(g.id.lastIndexOf('/') + 1).replace(/\.(png|gif)$/i, '')} title={g.id} hint={g.gif ? `GIF · ${g.gif.frames} fr` : `${g.width}×${g.height}`} thumb={<GraphicThumb graphic={g} url={images[g.id]} size={56} />} onClick={() => pick({ graphicId: g.id })} />}
              </TileGroups>
            </>
          )}
        </div>
        {footer && <div className="border-t border-border px-4 py-2">{footer}</div>}
      </DialogContent>
    </Dialog>
  )
}
