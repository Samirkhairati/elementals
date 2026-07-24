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
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Map Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Width (Tiles)</label>
                <Input type="number" min={1} max={500} value={width} onChange={e => setWidth(parseInt(e.target.value) || 1)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Height (Tiles)</label>
                <Input type="number" min={1} max={500} value={height} onChange={e => setHeight(parseInt(e.target.value) || 1)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Create</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
