// The Look panel (dock panel `look`): Lightroom-style colour grading of the map, the active layer or the picked
// picture. The profile tabs pick which look is edited, and the canvas shows the same profile (the top toolbar's Look
// menu is the same switch). See docs/looks.md.

import { Check, Clipboard, Copy, Eye, EyeOff, Image as ImageIcon, Layers, Map as MapIcon, MoreHorizontal, Pencil, Pin, PinOff, Plus, RotateCcw, Save, Sparkles, SlidersHorizontal, Trash2, Wand2 } from 'lucide-react'
import React, { useState } from 'react'
import { applyPreset, LOOK_PRESETS, PRESET_GROUPS } from '../../../../../shared/look/presets'
import { lookId } from '../../../../../shared/look/schema'
import type { Grain, Look, Vignette } from '../../../../../shared/look/types'
import { editLookSet, findPicture, lookInView, selectedSubject, withAdjust } from '@/lib/look/lookEdit'
import { updateLooksFile, useLookLibrary } from '@/lib/look/lookLibrary'
import { getLookSet, ownLook, subjectExists, withProfileLook } from '@/lib/look/lookSubjects'
import { getCanvasViewRect, setLookView, subjectKey, useLookView, type LookSubjectRef } from '@/lib/look/lookView'
import { resolveImageItem } from '@/lib/imageItems'
import { mapPixelSize } from '../../../../../shared/mapSize'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { EdButton, IconButton, InfoTip, Segmented, Toggle } from '../ui/controls'
import { ColorField } from '../ui/fields'
import { RenameInput } from '../ui/RenameInput'
import { LookAdjustEditor } from './LookAdjustEditor'
import { LookMasksEditor } from './LookMasksEditor'
import { LookShadersEditor } from './LookShadersEditor'
import { LookSlider, type Change } from './lookControls'

const selectLook = (c: EditorContextValue) => ({
  activeMap: c.activeMap,
  layers: c.layers,
  activeLayerId: c.activeLayerId,
  selectedImageId: c.selectedImageId,
  spriteAssets: c.spriteAssets,
  setLook: c.setLook,
})

type Tab = 'adjust' | 'masks' | 'shaders'

/** The look copied with "Copy look" (pasted onto any subject / profile). */
let copiedLook: Look | null = null

function VignetteGrain({ look, onChange }: { look: Look; onChange: Change<Look> }) {
  const v = look.vignette
  const g = look.grain
  const setV = (patch: Partial<Vignette>, done: boolean) => {
    const next: Vignette = { amount: v?.amount ?? 0, ...v, ...patch }
    const { vignette: _old, ...rest } = look
    onChange(next.amount !== 0 || next.color ? { ...rest, vignette: next } : rest, done)
  }
  const setG = (patch: Partial<Grain>, done: boolean) => {
    const next: Grain = { amount: g?.amount ?? 0, ...g, ...patch }
    const { grain: _old, ...rest } = look
    onChange(next.amount > 0 ? { ...rest, grain: next } : rest, done)
  }
  return (
    <>
      <div className="mt-2 text-ed-label font-medium text-muted-foreground">Vignette</div>
      <LookSlider label="Amount" value={v?.amount ?? 0} min={-100} max={100} step={1} track="linear-gradient(90deg, #000, #888, #fff)" onChange={(amount, done) => setV({ amount }, done)} />
      <LookSlider label="Midpoint" value={v?.midpoint ?? 50} defaultValue={50} min={0} max={100} step={1} onChange={(midpoint, done) => setV({ midpoint }, done)} />
      <LookSlider label="Roundness" value={v?.roundness ?? 0} min={-100} max={100} step={1} onChange={(roundness, done) => setV({ roundness }, done)} />
      <LookSlider label="Feather" value={v?.feather ?? 50} defaultValue={50} min={0} max={100} step={1} onChange={(feather, done) => setV({ feather }, done)} />
      <div className="flex items-center justify-between">
        <span className="text-ed-label text-muted-foreground">Colour</span>
        <ColorField aria-label="Vignette colour" allowEmpty value={v?.color ?? ''} onChange={(color) => setV({ color: color || undefined }, true)} />
      </div>
      <div className="mt-2 text-ed-label font-medium text-muted-foreground">Grain</div>
      <LookSlider label="Grain" value={g?.amount ?? 0} min={0} max={100} step={1} onChange={(amount, done) => setG({ amount }, done)} />
      <LookSlider label="Size" value={g?.size ?? 1} defaultValue={1} min={1} max={8} step={0.5} unit="px" onChange={(size, done) => setG({ size }, done)} />
      <div className="flex items-center justify-between">
        <span className="text-ed-label text-muted-foreground">Animated (game)</span>
        <Toggle aria-label="Animated grain" checked={!!g?.animated} onChange={(animated) => setG({ animated: animated || undefined }, true)} />
      </div>
    </>
  )
}

/** Default + one tab per profile; the selected one is what the canvas shows and what the panel edits. */
function ProfileTabs({ profile, hasOwn }: { profile: string | null; hasOwn: (p: string) => boolean }) {
  const lib = useLookLibrary()
  const [renaming, setRenaming] = useState<string | null>(null)
  const profiles = lib.file.profiles
  const addProfile = () => {
    const id = lookId('p')
    updateLooksFile((f) => ({ ...f, profiles: [...f.profiles, { id, name: `Profile ${f.profiles.length + 1}` }] }))
    setLookView({ profile: id })
    setRenaming(id)
  }
  return (
    <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Look profiles">
      <button type="button" role="tab" aria-selected={profile === null} className={cn('rounded-md px-2 py-0.5 text-ed-label', profile === null ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground')} onClick={() => setLookView({ profile: null })}>
        Default
      </button>
      {profiles.map((p) =>
        renaming === p.id ? (
          <RenameInput key={p.id} className="h-6 w-24" initial={p.name} label="Profile name" onRename={(name) => updateLooksFile((f) => ({ ...f, profiles: f.profiles.map((x) => (x.id === p.id ? { ...x, name } : x)) }))} onClose={() => setRenaming(null)} />
        ) : (
          <DropdownMenu key={p.id}>
            <button
              type="button"
              role="tab"
              aria-selected={profile === p.id}
              className={cn('group relative flex items-center gap-1 rounded-md px-2 py-0.5 text-ed-label', profile === p.id ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground')}
              onClick={() => setLookView({ profile: p.id })}
              onDoubleClick={() => setRenaming(p.id)}
              title={hasOwn(p.id) ? `${p.name}: this subject has its own look` : `${p.name}: same as Default here`}
            >
              {p.name}
              {hasOwn(p.id) ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
              {lib.file.start === p.id || (!lib.file.start && profiles[0]?.id === p.id) ? <span className="text-[9px] opacity-70">▶</span> : null}
              {profile === p.id ? (
                <DropdownMenuTrigger asChild>
                  <span role="button" aria-label={`${p.name} profile menu`} className="-mr-1 rounded px-0.5 hover:bg-black/20" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-3 w-3" />
                  </span>
                </DropdownMenuTrigger>
              ) : null}
            </button>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setRenaming(p.id)}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => updateLooksFile((f) => ({ ...f, start: p.id }))}>
                <Check className="mr-2 h-3.5 w-3.5" /> Game starts in this profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => {
                  updateLooksFile((f) => ({ ...f, profiles: f.profiles.filter((x) => x.id !== p.id), ...(f.start === p.id ? { start: undefined } : {}) }))
                  setLookView({ profile: null })
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete profile
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      )}
      <IconButton aria-label="New profile" title="New profile" onClick={addProfile}>
        <Plus className="h-3.5 w-3.5" />
      </IconButton>
      <InfoTip>
        Profiles are the project&apos;s lighting states (time of day, weather...). Every map, layer and picture can have a look per profile; without one it uses its Default look. The game switches profile with the Set Look Profile event command (▶ = the profile it starts in). Double-click a tab to rename it.
      </InfoTip>
    </div>
  )
}

function PresetMenu({ look, onApply }: { look: Look | undefined; onApply: (l: Look) => void }) {
  const lib = useLookLibrary()
  const presets = lib.file.presets ?? []
  const current = look?.preset ? (LOOK_PRESETS.find((p) => p.id === look.preset)?.name ?? presets.find((p) => p.id === look.preset)?.name) : undefined
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <EdButton size="sm" className="min-w-0 flex-1 justify-start" aria-label="Presets">
          <Wand2 /> <span className="truncate">{current ?? 'Presets'}</span>
        </EdButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {PRESET_GROUPS.map((g) => (
          <DropdownMenuSub key={g}>
            <DropdownMenuSubTrigger className="text-ed-body">{g}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {LOOK_PRESETS.filter((p) => p.group === g).map((p) => (
                <DropdownMenuItem key={p.id} className="text-ed-body" onSelect={() => onApply(applyPreset(look, p))}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
        {presets.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-ed-label">Project presets</DropdownMenuLabel>
            {presets.map((p) => (
              <DropdownMenuItem key={p.id} className="text-ed-body" onSelect={() => onApply(applyPreset(look, p))}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LookPanel() {
  const ctx = useEditorSelector(selectLook)
  const view = useLookView()
  const lib = useLookLibrary()
  const [tab, setTab] = useState<Tab>('adjust')
  const [savingPreset, setSavingPreset] = useState(false)
  const map = ctx.activeMap
  if (!map) return <div className="p-3 text-center text-ed-label text-muted-foreground">No map open</div>

  const followed = selectedSubject(ctx.layers, ctx.activeLayerId, ctx.selectedImageId)
  const ref: LookSubjectRef = view.pinned && subjectExists(ctx.layers, view.pinned) ? view.pinned : followed
  const subject = subjectKey(ref)
  const layer = ref.kind !== 'map' ? ctx.layers.find((l) => l.id === ref.layerId) : undefined
  const picture = findPicture(ctx.layers, ref)
  const set = getLookSet(map, ctx.layers, ref)
  const profile = view.profile !== null && lib.file.profiles.some((p) => p.id === view.profile) ? view.profile : null
  const { look, inherited } = lookInView(set, profile)
  const shown: Look = look ?? {}
  const profileName = profile ? lib.file.profiles.find((p) => p.id === profile)?.name : 'Default'

  const edit = (change: (l: Look) => Look | undefined, done: boolean) => ctx.setLook(ref, editLookSet(set, profile, change), done)

  // the mask space: a picture's own pixels, else the part of the map in view
  const px = mapPixelSize(map)
  const resolved = picture ? resolveImageItem(picture, ctx.spriteAssets) : null
  const box = resolved ? { x: 0, y: 0, w: resolved.src.w, h: resolved.src.h } : (getCanvasViewRect() ?? { x: 0, y: 0, w: px.width, h: px.height })

  const subjects: { value: LookSubjectRef['kind']; label: string; icon: React.ReactNode; ref: LookSubjectRef | null }[] = [
    { value: 'map', label: 'Map', icon: <MapIcon className="h-3.5 w-3.5" />, ref: { kind: 'map' } },
    { value: 'layer', label: 'Layer', icon: <Layers className="h-3.5 w-3.5" />, ref: followed.kind !== 'map' ? { kind: 'layer', layerId: followed.layerId } : ref.kind !== 'map' ? { kind: 'layer', layerId: ref.layerId } : null },
    { value: 'picture', label: 'Picture', icon: <ImageIcon className="h-3.5 w-3.5" />, ref: followed.kind === 'picture' ? followed : ref.kind === 'picture' ? ref : null },
  ]
  const subjectName = ref.kind === 'map' ? map.name || map.fileName : ref.kind === 'layer' ? (layer?.name ?? 'Layer') : picture?.name || picture?.graphicId?.split('/').pop() || picture?.assetId || 'Picture'
  const hasOwn = (p: string) => !!ownLook(set, p)
  const counts = { masks: shown.masks?.length ?? 0, shaders: shown.shaders?.length ?? 0 }
  const enabled = shown.enabled !== false

  return (
    <div className="flex flex-col gap-2 text-ed-body" data-testid="look-panel">
      {/* whose look */}
      <div className="flex items-center gap-1">
        <Segmented<LookSubjectRef['kind']>
          aria-label="Look of"
          value={ref.kind}
          options={subjects.map((s) => ({ value: s.value, label: s.label, icon: s.icon, title: s.ref ? undefined : s.value === 'picture' ? 'Pick a picture on an image layer' : 'Select a tile or image layer' }))}
          onChange={(k) => {
            const target = subjects.find((s) => s.value === k)?.ref
            if (target) setLookView({ pinned: k === followed.kind && !view.pinned ? null : target })
          }}
        />
        <span className="flex-1" />
        <IconButton aria-label={view.pinned ? 'Unpin: follow the selection' : 'Pin this subject'} title={view.pinned ? 'Pinned: click to follow the selection again' : 'Keep editing this one when the selection changes'} active={!!view.pinned} onClick={() => setLookView({ pinned: view.pinned ? null : ref })}>
          {view.pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
        </IconButton>
      </div>
      <div className="flex items-center gap-1.5">
        <IconButton aria-label={enabled ? 'Turn this look off' : 'Turn this look on'} title={enabled ? 'Look on' : 'Look off'} onClick={() => edit((l) => ({ ...l, enabled: enabled ? false : undefined }), true)} disabled={!look}>
          {enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </IconButton>
        <span className="min-w-0 flex-1 truncate font-medium" title={subjectName}>
          {subjectName}
        </span>
        {inherited ? (
          <span className="ed-badge px-1.5 py-0.5 text-[10px]" title={`No ${profileName} look yet: showing Default. Any change makes one.`}>
            = Default
          </span>
        ) : null}
      </div>

      <ProfileTabs profile={profile} hasOwn={hasOwn} />

      <div className="flex items-center gap-1">
        <PresetMenu look={look} onApply={(l) => edit(() => l, true)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Look menu">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!look} onSelect={() => (copiedLook = structuredClone(shown))}>
              <Copy className="mr-2 h-3.5 w-3.5" /> Copy look
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!copiedLook} onSelect={() => copiedLook && edit(() => structuredClone(copiedLook!), true)}>
              <Clipboard className="mr-2 h-3.5 w-3.5" /> Paste look
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!look} onSelect={() => setSavingPreset(true)}>
              <Save className="mr-2 h-3.5 w-3.5" /> Save as project preset…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {profile !== null ? (
              <DropdownMenuItem disabled={!ownLook(set, profile)} onSelect={() => ctx.setLook(ref, withProfileLook(set, profile, undefined), true)}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Use Default for {profileName}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem disabled={!look} className="text-destructive" onSelect={() => ctx.setLook(ref, withProfileLook(set, profile, profile === null ? undefined : {}), true)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Reset {profileName} look
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {savingPreset ? (
        <RenameInput
          initial={look?.preset ? 'My preset' : `${subjectName} ${profileName}`}
          label="Preset name"
          onRename={(name) => {
            const { masks: _m, shaders: _s, preset: _p, ...rest } = shown
            updateLooksFile((f) => ({ ...f, presets: [...(f.presets ?? []), { id: lookId('preset'), name, look: rest }] }))
          }}
          onClose={() => setSavingPreset(false)}
        />
      ) : null}

      <Segmented<Tab>
        aria-label="Look section"
        value={tab}
        options={[
          { value: 'adjust', label: 'Edit', icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
          { value: 'masks', label: counts.masks ? `Masks ${counts.masks}` : 'Masks', icon: <Pencil className="h-3.5 w-3.5" /> },
          { value: 'shaders', label: counts.shaders ? `Shaders ${counts.shaders}` : 'Shaders', icon: <Sparkles className="h-3.5 w-3.5" /> },
        ]}
        onChange={(t) => {
          setTab(t)
          if (t !== 'masks' && view.mask?.subject === subject) setLookView({ mask: null })
        }}
      />

      <div className={cn(!enabled && 'opacity-60')}>
        {tab === 'adjust' ? (
          <LookAdjustEditor
            adjust={shown.adjust}
            onChange={(adjust, done) => edit((l) => withAdjust(l, adjust), done)}
            effectsExtra={<VignetteGrain look={shown} onChange={(l, done) => edit(() => l, done)} />}
            onResetEffectsExtra={() => edit(({ vignette: _v, grain: _g, ...rest }) => rest, true)}
          />
        ) : tab === 'masks' ? (
          <LookMasksEditor
            masks={shown.masks ?? []}
            subject={subject}
            box={box}
            spaceLabel={ref.kind === 'picture' ? "the picture's own pixels (before scaling and flipping)" : 'map pixels'}
            onChange={(masks, done) =>
              edit((l) => {
                const { masks: _old, ...rest } = l
                return masks.length ? { ...rest, masks } : rest
              }, done)
            }
          />
        ) : (
          <LookShadersEditor
            shaders={shown.shaders ?? []}
            onChange={(shaders, done) =>
              edit((l) => {
                const { shaders: _old, ...rest } = l
                return shaders.length ? { ...rest, shaders } : rest
              }, done)
            }
          />
        )}
      </div>
    </div>
  )
}
