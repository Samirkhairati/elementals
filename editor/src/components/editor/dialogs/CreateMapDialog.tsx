import { NumberField } from '../ui/controls'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface CreateMapDialogProps {
  open: boolean
  name: string
  width: number
  height: number
  setName: (v: string) => void
  setWidth: (v: number) => void
  setHeight: (v: number) => void
  onClose: () => void
  onConfirm: () => void
}

export function CreateMapDialog({ open, name, width, height, setName, setWidth, setHeight, onClose, onConfirm }: CreateMapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
          <DialogHeader>
            <DialogTitle>New Map</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col gap-1">
              <label className="ed-label">Map Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="ed-label">Width (Tiles)</label>
                <NumberField aria-label="Width (tiles)" min={1} max={500} value={width} onCommit={setWidth} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="ed-label">Height (Tiles)</label>
                <NumberField aria-label="Height (tiles)" min={1} max={500} value={height} onCommit={setHeight} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <button type="button" onClick={onClose} className="ed-btn">Cancel</button>
            <button type="submit" className="ed-btn" data-variant="primary">Create</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
