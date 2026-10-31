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
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col gap-1">
              <label className="ed-label">New Name</label>
              <Input value={renameInput} onChange={e => setRenameInput(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <button type="button" onClick={onClose} className="ed-btn">Cancel</button>
            <button type="submit" className="ed-btn" data-variant="primary">Save</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
