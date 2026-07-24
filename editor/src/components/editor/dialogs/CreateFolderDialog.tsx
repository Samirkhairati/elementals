import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface CreateFolderDialogProps {
  open: boolean
  folderName: string
  setFolderName: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}

export function CreateFolderDialog({ open, folderName, setFolderName, onClose, onConfirm }: CreateFolderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Folder Name</label>
              <Input value={folderName} onChange={e => setFolderName(e.target.value)} autoFocus />
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
