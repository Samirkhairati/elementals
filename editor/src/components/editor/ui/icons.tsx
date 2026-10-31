// Maps the icon names used by the shared engine (component schemas, prefabs) and by entityIconName() to lucide icons.
import React from 'react'
import {
  Box,
  BoxSelect,
  CircleDot,
  DoorOpen,
  Footprints,
  Image as ImageIcon,
  Move,
  Package,
  Signpost,
  SquareDashed,
  Swords,
  Tag as TagIcon,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  box: Box,
  'box-select': BoxSelect,
  'circle-dot': CircleDot,
  'door-open': DoorOpen,
  footprints: Footprints,
  image: ImageIcon,
  move: Move,
  package: Package,
  signpost: Signpost,
  'square-dashed': SquareDashed,
  swords: Swords,
  tag: TagIcon,
  user: User,
  zap: Zap,
}

export function iconByName(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Box
}

export function NamedIcon({ name, className }: { name: string | undefined; className?: string }) {
  const Icon = iconByName(name)
  return <Icon className={className} />
}

/** Schema accent name (`violet`, `amber` ...) -> the CSS variable holding its hsl triplet. */
export function accentVar(accent: string | undefined): string {
  return `var(--accent-${accent || 'slate'})`
}
