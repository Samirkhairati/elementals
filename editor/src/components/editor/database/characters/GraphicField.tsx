import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { GraphicInfo } from '../../../../../../shared/engine/graphics'
import { PicturePicker } from '../../dialogs/PicturePicker'
import { ImageThumb } from '../browse'

interface Props {
  value: string
  onChange: (graphicId: string) => void
  graphics: GraphicInfo[]
  images: Record<string, string>
  'aria-label': string
  placeholder?: string
  /** Shown beside the id when the graphic does not exist (the sprite points at a missing picture). */
  missing?: boolean
}

/** The picture a sprite or sheet is cut from: a button showing it, which opens the picture browser. */
export function GraphicField({ value, onChange, graphics, images, placeholder = 'Choose a picture…', missing, ...rest }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="ed-btn flex h-auto min-w-[200px] max-w-full items-center gap-2 py-1 text-left" aria-label={rest['aria-label']} onClick={() => setOpen(true)}>
        <ImageThumb url={images[value]} size={28} />
        <span className="min-w-0 flex-1 truncate">{value ? `${value}${missing ? ' (missing)' : ''}` : placeholder}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      <PicturePicker open={open} onOpenChange={setOpen} tabs={['graphics']} title="Choose a picture" graphics={graphics} images={images} value={{ graphicId: value }} onPick={(p) => p.graphicId && onChange(p.graphicId)} />
    </>
  )
}
