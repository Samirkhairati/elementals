import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function ShortcutsDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-3">
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div className="font-medium">Undo</div>
            <div className="text-muted-foreground">Ctrl+Z / Cmd+Z</div>
            
            <div className="font-medium">Redo</div>
            <div className="text-muted-foreground">Ctrl+Y / Cmd+Shift+Z</div>
            
            <div className="font-medium">Brush Tool</div>
            <div className="text-muted-foreground">B</div>
            
            <div className="font-medium">Eraser Tool</div>
            <div className="text-muted-foreground">E</div>
            
            <div className="font-medium">Rectangle Tool</div>
            <div className="text-muted-foreground">M</div>
            
            <div className="font-medium">Paint Bucket</div>
            <div className="text-muted-foreground">G</div>
            
            <div className="font-medium">Collider Tool</div>
            <div className="text-muted-foreground">C (drag: Shift free, Alt from centre, Esc cancel)</div>

            <div className="font-medium">Isolate Layer Visibility</div>
            <div className="text-muted-foreground">Shift + Click (Eye Icon)</div>
            
            <div className="font-medium">Delete Folder</div>
            <div className="text-muted-foreground">Delete / Backspace</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
