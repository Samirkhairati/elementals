import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface ImportTilesetDialogProps {
  open: boolean
  nameInput: string
  setNameInput: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}

export function ImportTilesetDialog({ open, nameInput, setNameInput, onClose, onConfirm }: ImportTilesetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
          <DialogHeader>
            <DialogTitle>Import Tileset</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col gap-1">
              <label className="ed-label">Tileset Name</label>
              <Input value={nameInput} onChange={e => setNameInput(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <button type="button" onClick={onClose} className="ed-btn">Cancel</button>
            <button type="submit" className="ed-btn" data-variant="primary">Import</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
