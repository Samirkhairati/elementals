import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface RenameDialogProps {
  open: boolean
  type: 'folder' | 'tileset' | 'map-folder' | 'map' | 'layer'
  renameInput: string
  setRenameInput: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}

export function RenameDialog({ open, type, renameInput, setRenameInput, onClose, onConfirm }: RenameDialogProps) {
  const title = type === 'folder' || type === 'map-folder' ? 'Folder' : type === 'tileset' ? 'Tileset' : type === 'layer' ? 'Layer' : 'Map'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
          <DialogHeader>
            <DialogTitle>Rename {title}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Name</label>
              <Input value={renameInput} onChange={e => setRenameInput(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Save</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
