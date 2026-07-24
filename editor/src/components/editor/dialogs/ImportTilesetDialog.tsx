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
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tileset Name</label>
              <Input value={nameInput} onChange={e => setNameInput(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Import</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
