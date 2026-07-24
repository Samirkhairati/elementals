import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LayerType } from '@/types/editor'

interface CreateLayerDialogProps {
  open: boolean
  name: string
  type: LayerType
  setName: (v: string) => void
  setType: (v: LayerType) => void
  onClose: (open: boolean) => void
  onConfirm: () => void
}

export function CreateLayerDialog({ open, name, type, setName, setType, onClose, onConfirm }: CreateLayerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
          <DialogHeader>
            <DialogTitle>New Layer</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Layer Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Layer Type</label>
              <Select value={type} onValueChange={(v: LayerType) => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tile">Tile Layer</SelectItem>
                  <SelectItem value="collision">Collision Layer</SelectItem>
                  <SelectItem value="terrain">Terrain Layer</SelectItem>
                  <SelectItem value="objects">Object Layer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => onClose(false)} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Create</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
