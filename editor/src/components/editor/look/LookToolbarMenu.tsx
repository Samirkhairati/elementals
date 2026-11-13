// The top toolbar's Look menu: which profile the canvas shows (Default or a profile: every map, layer and picture
// switches together, like the game's Set Look Profile), looks on / off, animated shaders, and opening the Look panel.

import { ChevronDown, SunMoon } from 'lucide-react'
import { useLookLibrary } from '@/lib/look/lookLibrary'
import { setLookView, useLookView } from '@/lib/look/lookView'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const DEFAULT = '__default__'

export function LookToolbarMenu({ disabled, onOpenPanel }: { disabled?: boolean; onOpenPanel: () => void }) {
  const view = useLookView()
  const lib = useLookLibrary()
  const profile = view.profile !== null && lib.file.profiles.some((p) => p.id === view.profile) ? view.profile : null
  const name = !view.enabled ? 'Looks off' : profile ? (lib.file.profiles.find((p) => p.id === profile)?.name ?? profile) : 'Default'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Look profile"
          title="Look: the profile the canvas shows (Alt+G opens the Look panel)"
          className={cn('flex h-6 items-center gap-1 rounded-sm px-1.5 text-ed-body', view.enabled ? 'text-foreground hover:bg-muted' : 'text-muted-foreground hover:bg-muted', disabled && 'opacity-50')}
        >
          <SunMoon className="h-3.5 w-3.5" />
          <span className="max-w-24 truncate">{name}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-48">
        <DropdownMenuLabel className="text-ed-label">View in profile</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={profile ?? DEFAULT} onValueChange={(v) => setLookView({ profile: v === DEFAULT ? null : v, enabled: true })}>
          <DropdownMenuRadioItem value={DEFAULT} className="text-ed-body">
            Default
          </DropdownMenuRadioItem>
          {lib.file.profiles.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id} className="text-ed-body">
              {p.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem className="text-ed-body" checked={view.enabled} onCheckedChange={(enabled) => setLookView({ enabled: enabled === true })}>
          Show looks
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem className="text-ed-body" checked={view.animate} onCheckedChange={(animate) => setLookView({ animate: animate === true })}>
          Animate shaders and grain
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-ed-body" onSelect={onOpenPanel}>
          Open Look panel…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
