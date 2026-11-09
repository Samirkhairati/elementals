import { Link } from '@tanstack/react-router'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SHORTCUT_ACTIONS, describeBindings } from '@/lib/shortcuts'
import { useBindings } from '@/store/shortcutStore'

// Mouse gestures that are not keys (so not rebindable).
const GESTURES: [string, string][] = [
  ['Isolate layer visibility', 'Shift + click the eye'],
  ['Pick several layers or pictures', 'Ctrl/Cmd + click; Shift + click for a range'],
]

export function ShortcutsDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
  const bindings = useBindings()
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Change any of these in <Link to="/settings" onClick={onClose} className="underline">Settings › Shortcuts</Link>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-3">
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            {SHORTCUT_ACTIONS.filter((a) => (bindings[a.id] ?? []).length > 0).flatMap((a) => [
              <div key={`${a.id}-l`} className="font-medium">{a.label}</div>,
              <div key={`${a.id}-k`} className="text-muted-foreground">{describeBindings(a.id, bindings)}</div>,
            ])}
            {GESTURES.flatMap(([label, how]) => [
              <div key={`${label}-l`} className="font-medium">{label}</div>,
              <div key={`${label}-k`} className="text-muted-foreground">{how}</div>,
            ])}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
