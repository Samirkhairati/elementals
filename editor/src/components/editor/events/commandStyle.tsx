import React from 'react'
import {
  BadgeCheck,
  Bug,
  Circle,
  CloudRain,
  Compass,
  DoorOpen,
  Eye,
  GitBranch,
  HeartPulse,
  Image as ImageIcon,
  List,
  LocateFixed,
  LogOut,
  MessageCircleMore,
  MessageSquare,
  Music,
  OctagonX,
  PackageMinus,
  PackagePlus,
  Palette,
  PhoneCall,
  Play,
  Radio,
  Repeat,
  Route,
  ScrollText,
  Store,
  Sunset,
  Swords,
  Terminal,
  Timer,
  ToggleLeft,
  ToggleRight,
  Variable,
  Vibrate,
  Volume2,
  VolumeX,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CommandCategory } from '../../../../../shared/engine/types'

/** Catalog icon names (`CommandDef.icon`, kebab-case lucide names) -> components. */
const ICONS: Record<string, LucideIcon> = {
  'message-square': MessageSquare,
  list: List,
  'git-branch': GitBranch,
  repeat: Repeat,
  'log-out': LogOut,
  'octagon-x': OctagonX,
  timer: Timer,
  'message-circle-more': MessageCircleMore,
  'phone-call': PhoneCall,
  'toggle-right': ToggleRight,
  variable: Variable,
  'toggle-left': ToggleLeft,
  compass: Compass,
  route: Route,
  eye: Eye,
  image: ImageIcon,
  play: Play,
  'locate-fixed': LocateFixed,
  'door-open': DoorOpen,
  sunset: Sunset,
  vibrate: Vibrate,
  palette: Palette,
  'cloud-rain': CloudRain,
  'volume-2': Volume2,
  music: Music,
  'volume-x': VolumeX,
  'package-plus': PackagePlus,
  'package-minus': PackageMinus,
  bug: Bug,
  'heart-pulse': HeartPulse,
  swords: Swords,
  store: Store,
  'scroll-text': ScrollText,
  'badge-check': BadgeCheck,
  radio: Radio,
  terminal: Terminal,
}

export function iconFor(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Zap
}

export interface CategoryStyle {
  /** Icon / label colour. */
  text: string
  /** Soft background behind the icon. */
  bg: string
  /** Dot / accent. */
  dot: string
}

/** Category colours (Tailwind palette classes; the same hue family everywhere a category appears). */
export const CATEGORY_STYLES: Record<CommandCategory, CategoryStyle> = {
  dialogue: { text: 'text-sky-400', bg: 'bg-sky-500/15', dot: 'bg-sky-400' },
  flow: { text: 'text-violet-400', bg: 'bg-violet-500/15', dot: 'bg-violet-400' },
  state: { text: 'text-amber-400', bg: 'bg-amber-500/15', dot: 'bg-amber-400' },
  character: { text: 'text-emerald-400', bg: 'bg-emerald-500/15', dot: 'bg-emerald-400' },
  map: { text: 'text-teal-400', bg: 'bg-teal-500/15', dot: 'bg-teal-400' },
  audio: { text: 'text-pink-400', bg: 'bg-pink-500/15', dot: 'bg-pink-400' },
  rpg: { text: 'text-orange-400', bg: 'bg-orange-500/15', dot: 'bg-orange-400' },
  advanced: { text: 'text-slate-400', bg: 'bg-slate-500/15', dot: 'bg-slate-400' },
}

export const UNKNOWN_STYLE: CategoryStyle = { text: 'text-red-400', bg: 'bg-red-500/15', dot: 'bg-red-400' }

export function CommandIcon({ icon, category, className = '' }: { icon?: string; category?: CommandCategory; className?: string }) {
  const style = category ? CATEGORY_STYLES[category] : UNKNOWN_STYLE
  const Icon = icon ? iconFor(icon) : Circle
  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${style.bg} ${style.text} ${className}`} aria-hidden>
      <Icon className="h-3 w-3" />
    </span>
  )
}

export function PlannedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Planned: you can author this command, but the game does not run it yet (it logs and skips it)."
      className={`shrink-0 rounded border border-border/70 bg-muted/60 px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground ${className}`}
    >
      planned
    </span>
  )
}
