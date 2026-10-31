import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface CreateMapFolderDialogProps {
  open: boolean
  folderName: string
  setFolderName: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}

export function CreateMapFolderDialog({ open, folderName, setFolderName, onClose, onConfirm }: CreateMapFolderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
          <DialogHeader>
            <DialogTitle>New Map Folder</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col gap-1">
              <label className="ed-label">Folder Name</label>
              <Input value={folderName} onChange={e => setFolderName(e.target.value)} autoFocus />
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
