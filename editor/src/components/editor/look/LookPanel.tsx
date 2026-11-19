// The Look panel (dock panel `look`): Lightroom-style colour grading of the selected node (a Node, a TileMap or a Sprite:
// its Look child; the map's own look while the Scene panel's root row is selected), plus its drop shadow. The profile picked here is what the panel edits and what the canvas shows (the top
// toolbar's Look menu is the same switch). See docs/looks.md.

import { Aperture, Check, Clipboard, Copy, Map as MapIcon, MoreHorizontal, Pencil, Pin, PinOff, Plus, RotateCcw, Save, Sparkles, SlidersHorizontal, Trash2, Wand2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { applyPreset, LOOK_PRESETS, PRESET_GROUPS } from '../../../../../shared/look/presets'
import { lookId, resolveLook } from '../../../../../shared/look/schema'
import type { Grain, Look, Vignette } from '../../../../../shared/look/types'
import { editLookSet, findPicture, lookInView, selectedSubject, withAdjust } from '@/lib/look/lookEdit'
import { updateLooksFile, useLookLibrary } from '@/lib/look/lookLibrary'
import { getLookSet, ownLook, subjectExists, withProfileLook } from '@/lib/look/lookSubjects'
import { getCanvasViewRect, setLookView, subjectKey, useLookView, type LookSubjectRef } from '@/lib/look/lookView'
import { resolveImageItem } from '@/lib/imageItems'
import { mapPixelSize } from '../../../../../shared/mapSize'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Badge, Card, EdButton, EyeButton, Field, IconButton, InfoTip, Segmented, Toggle } from '../ui/controls'
import { ColorField } from '../ui/fields'
import { RenameInput } from '../ui/RenameInput'
import { sceneIndex } from '@/lib/sceneIndex'
import { NODE_TYPES, ownLook as ownLookOf } from '../../../../../shared/sceneTree'
import { NodeTypeIcon } from '../panels/SceneTree'
import { LookAdjustEditor } from './LookAdjustEditor'
import { LookMasksEditor } from './LookMasksEditor'
import { LookShadersEditor } from './LookShadersEditor'
import { LookShadowEditor } from './LookShadowEditor'
import { LookSection, LookSlider, type Change } from './lookControls'

const selectLook = (c: EditorContextValue) => ({
  activeMap: c.activeMap,
  nodes: c.activeMap?.nodes,
  activeLayerId: c.activeLayerId,
  selectedImageId: c.selectedImageId,
  spriteAssets: c.spriteAssets,
  setLook: c.setLook,
})

type Tab = 'adjust' | 'masks' | 'shaders'
const DEFAULT_TAB = '__default'

/** The look copied with "Copy look" (pasted onto any subject / profile). */
let copiedLook: Look | null = null

/** Without a field: the rest of the look. */
function without<K extends keyof Look>(look: Look, key: K): Omit<Look, K> {
  const { [key]: _drop, ...rest } = look
  return rest
}

function VignetteSection({ look, onChange }: { look: Look; onChange: Change<Look> }) {
  const v = look.vignette
  const set = (patch: Partial<Vignette>, done: boolean) => {
    const next: Vignette = { amount: v?.amount ?? 0, ...v, ...patch }
    onChange(next.amount !== 0 || next.color ? { ...without(look, 'vignette'), vignette: next } : without(look, 'vignette'), done)
  }
  return (
    <LookSection title="Vignette" icon={<Aperture />} summary={v?.amount ? `${v.amount > 0 ? '+' : ''}${v.amount}` : undefined} onReset={v ? () => onChange(without(look, 'vignette'), true) : undefined}>
      <LookSlider label="Amount" value={v?.amount ?? 0} min={-100} max={100} step={1} track="linear-gradient(90deg, #000, #888, #fff)" onChange={(amount, done) => set({ amount }, done)} />
      <LookSlider label="Midpoint" value={v?.midpoint ?? 50} defaultValue={50} min={0} max={100} step={1} onChange={(midpoint, done) => set({ midpoint }, done)} />
      <LookSlider label="Roundness" value={v?.roundness ?? 0} min={-100} max={100} step={1} onChange={(roundness, done) => set({ roundness }, done)} />
      <LookSlider label="Feather" value={v?.feather ?? 50} defaultValue={50} min={0} max={100} step={1} onChange={(feather, done) => set({ feather }, done)} />
      <Field label="Colour">
        <ColorField aria-label="Vignette colour" allowEmpty value={v?.color ?? ''} onChange={(color) => set({ color: color || undefined }, true)} />
      </Field>
    </LookSection>
  )
}

function GrainSection({ look, onChange }: { look: Look; onChange: Change<Look> }) {
  const g = look.grain
  const set = (patch: Partial<Grain>, done: boolean) => {
    const next: Grain = { amount: g?.amount ?? 0, ...g, ...patch }
    onChange(next.amount > 0 ? { ...without(look, 'grain'), grain: next } : without(look, 'grain'), done)
  }
  return (
    <LookSection title="Grain" icon={<Sparkles />} summary={g?.amount ? `${g.amount}` : undefined} onReset={g ? () => onChange(without(look, 'grain'), true) : undefined}>
      <LookSlider label="Amount" value={g?.amount ?? 0} min={0} max={100} step={1} onChange={(amount, done) => set({ amount }, done)} />
      <LookSlider label="Size" value={g?.size ?? 1} defaultValue={1} min={1} max={8} step={0.5} unit="px" onChange={(size, done) => set({ size }, done)} />
      <Field label="Animated (game)">
        <Toggle aria-label="Animated grain" checked={!!g?.animated} onChange={(animated) => set({ animated: animated || undefined }, true)} />
      </Field>
    </LookSection>
  )
}

/** Default + one option per profile; the picked one is what the canvas shows and what the panel edits. */
function ProfilePicker({ profile, hasOwn }: { profile: string | null; hasOwn: (p: string) => boolean }) {
  const lib = useLookLibrary()
  const [renaming, setRenaming] = useState<string | null>(null)
  const profiles = lib.file.profiles
  const start = lib.file.start ?? profiles[0]?.id
  const current = profiles.find((p) => p.id === profile)
  const addProfile = () => {
    const id = lookId('p')
    updateLooksFile((f) => ({ ...f, profiles: [...f.profiles, { id, name: `Profile ${f.profiles.length + 1}` }] }))
    setLookView({ profile: id })
    setRenaming(id)
  }
  const renamingProfile = profiles.find((p) => p.id === renaming)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="ed-section-title flex-1">Profile</span>
        <IconButton aria-label="New profile" title="New profile" onClick={addProfile}>
          <Plus />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Profile menu" disabled={!current}>
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          {current ? (
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(current.id)}>
                <Pencil /> Rename {current.name}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={start === current.id} onSelect={() => updateLooksFile((f) => ({ ...f, start: current.id }))}>
                <Check /> The game starts in {current.name}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                onSelect={() => {
                  updateLooksFile((f) => ({ ...f, profiles: f.profiles.filter((x) => x.id !== current.id), ...(f.start === current.id ? { start: undefined } : {}) }))
                  setLookView({ profile: null })
                }}
              >
                <Trash2 /> Delete {current.name}
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
        <InfoTip>
          Profiles are the project&apos;s lighting states (time of day, weather...). Every map, layer and picture can have a look per profile; without one it uses its Default look (a dot marks the profiles this one has its own look in). The game switches profile with the Set Look Profile event command and starts in the one marked ▶.
        </InfoTip>
      </div>
      {renamingProfile ? (
        <RenameInput key={renamingProfile.id} initial={renamingProfile.name} label="Profile name" onRename={(name) => updateLooksFile((f) => ({ ...f, profiles: f.profiles.map((x) => (x.id === renamingProfile.id ? { ...x, name } : x)) }))} onClose={() => setRenaming(null)} />
      ) : (
        <Segmented<string>
          aria-label="Look profile"
          className="flex w-full flex-wrap"
          value={profile ?? DEFAULT_TAB}
          options={[
            { value: DEFAULT_TAB, label: 'Default' },
            ...profiles.map((p) => ({
              value: p.id,
              title: hasOwn(p.id) ? `${p.name}: its own look here` : `${p.name}: the same as Default here`,
              label: (
                <>
                  {start === p.id ? <span aria-hidden className="text-[9px] opacity-70">▶</span> : null}
                  {p.name}
                  {hasOwn(p.id) ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
                </>
              ),
              ariaLabel: p.name,
            })),
          ]}
          onChange={(v) => setLookView({ profile: v === DEFAULT_TAB ? null : v })}
        />
      )}
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
      <DropdownMenuContent align="start">
        {PRESET_GROUPS.map((g) => (
          <DropdownMenuSub key={g}>
            <DropdownMenuSubTrigger>{g}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {LOOK_PRESETS.filter((p) => p.group === g).map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => onApply(applyPreset(look, p))}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
        {presets.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Project presets</DropdownMenuLabel>
            {presets.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => onApply(applyPreset(look, p))}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The canvas edits a mask only while the panel shows that mask's subject: picking another node puts its handles away. */
function MaskFollowsSubject({ subject }: { subject: string | null }) {
  const mask = useLookView().mask
  useEffect(() => {
    if (mask && mask.subject !== subject) setLookView({ mask: null })
  }, [mask, subject])
  return null
}

export function LookPanel() {
  const ctx = useEditorSelector(selectLook)
  const view = useLookView()
  const lib = useLookLibrary()
  const [tab, setTab] = useState<Tab>('adjust')
  const [savingPreset, setSavingPreset] = useState(false)
  const map = ctx.activeMap
  if (!map) return <div className="ed-empty">No map open</div>

  const nodes = ctx.nodes ?? []
  const followed = selectedSubject(nodes, ctx.activeLayerId, ctx.selectedImageId)
  const active = ctx.activeLayerId ? sceneIndex(nodes).byId.get(ctx.activeLayerId)?.node : undefined
  if (!view.pinned && active && followed.kind === 'map') {
    return (
      <div className="ed-empty">
        <MaskFollowsSubject subject={null} />A {NODE_TYPES[active.type].label} has no look. Select a Node, TileMap or Sprite, or the map (the Scene panel&apos;s top row).
      </div>
    )
  }
  const ref: LookSubjectRef = view.pinned && subjectExists(nodes, view.pinned) ? view.pinned : followed
  const subject = subjectKey(ref)
  const layer = ref.kind !== 'map' ? sceneIndex(nodes).byId.get(ref.layerId)?.node : undefined
  const picture = findPicture(nodes, ref)
  const set = getLookSet(map, nodes, ref)
  const profile = view.profile !== null && lib.file.profiles.some((p) => p.id === view.profile) ? view.profile : null
  const { look, inherited } = lookInView(set, profile)
  const shown: Look = look ?? {}
  const profileName = profile ? lib.file.profiles.find((p) => p.id === profile)?.name : 'Default'

  const edit = (change: (l: Look) => Look | undefined, done: boolean) => ctx.setLook(ref, editLookSet(set, profile, change), done)
  const editPart = <K extends 'masks' | 'shaders'>(key: K) => (value: Look[K] & unknown[], done: boolean) => edit((l) => (value.length ? { ...without(l, key), [key]: value } : without(l, key)), done)

  // the mask space: a picture's own pixels, else the part of the map in view
  const px = mapPixelSize(map)
  const resolved = picture ? resolveImageItem(picture, ctx.spriteAssets) : null
  const box = resolved ? { x: 0, y: 0, w: resolved.src.w, h: resolved.src.h } : (getCanvasViewRect() ?? { x: 0, y: 0, w: px.width, h: px.height })

  const subjectNode = ref.kind === 'picture' ? sceneIndex(nodes).byId.get(ref.imageId)?.node : layer
  const subjectType = subjectNode ? NODE_TYPES[subjectNode.type].label : 'Map'
  const subjectName = ref.kind === 'map' ? map.name || map.fileName : ref.kind === 'layer' ? (layer?.name ?? 'Layer') : picture?.name || picture?.graphicId?.split('/').pop() || picture?.assetId || 'Picture'
  const hasOwn = (p: string) => !!ownLook(set, p)
  const counts = { masks: shown.masks?.length ?? 0, shaders: shown.shaders?.length ?? 0 }
  const enabled = shown.enabled !== false
  // a picture without its own shadow gets its layer's
  const layerShadow = ref.kind === 'picture' ? (resolveLook(ownLookOf(layer), profile)?.shadow ?? undefined) : undefined

  return (
    <div className="flex w-full flex-col gap-3 text-left" data-testid="look-panel">
      <MaskFollowsSubject subject={subject} />
      <Card
        caps
        icon={subjectNode ? <NodeTypeIcon type={subjectNode.type} /> : <MapIcon style={{ color: '#93c5fd' }} />}
        title={<span title={`${subjectType}: ${subjectName}`}>Look · {subjectName}</span>}
        actions={
          <>
            {inherited ? <Badge title={`No ${profileName} look yet: showing Default. Any change makes one.`}>= Default</Badge> : null}
            <EyeButton name="this look" visible={enabled} disabled={!look} onToggle={() => edit((l) => ({ ...l, enabled: enabled ? false : undefined }), true)} />
            <IconButton
              aria-label={view.pinned ? 'Unpin: follow the selection' : 'Pin this subject'}
              title={view.pinned ? 'Pinned: click to follow the selection again' : 'Keep editing this one when the selection changes'}
              active={!!view.pinned}
              onClick={() => setLookView({ pinned: view.pinned ? null : ref })}
            >
              {view.pinned ? <Pin /> : <PinOff />}
            </IconButton>
          </>
        }
      >
        <ProfilePicker profile={profile} hasOwn={hasOwn} />
        <div className="flex items-center gap-1">
          <PresetMenu look={look} onApply={(l) => edit(() => l, true)} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Look menu">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!look} onSelect={() => (copiedLook = structuredClone(shown))}>
                <Copy /> Copy look
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!copiedLook} onSelect={() => copiedLook && edit(() => structuredClone(copiedLook!), true)}>
                <Clipboard /> Paste look
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!look} onSelect={() => setSavingPreset(true)}>
                <Save /> Save as project preset…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {profile !== null ? (
                <DropdownMenuItem disabled={!ownLook(set, profile)} onSelect={() => ctx.setLook(ref, withProfileLook(set, profile, undefined), true)}>
                  <RotateCcw /> Use Default for {profileName}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem destructive disabled={!look} onSelect={() => ctx.setLook(ref, withProfileLook(set, profile, profile === null ? undefined : {}), true)}>
                <Trash2 /> Reset {profileName} look
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {savingPreset ? (
          <RenameInput
            initial={look?.preset ? 'My preset' : `${subjectName} ${profileName}`}
            label="Preset name"
            onRename={(name) => {
              // a preset is a grade: masks, shaders and the shadow belong to the subject
              const { masks: _m, shaders: _s, shadow: _sh, preset: _p, ...rest } = shown
              updateLooksFile((f) => ({ ...f, presets: [...(f.presets ?? []), { id: lookId('preset'), name, look: rest }] }))
            }}
            onClose={() => setSavingPreset(false)}
          />
        ) : null}
      </Card>

      <Segmented<Tab>
        aria-label="Look section"
        className="w-full"
        value={tab}
        options={[
          { value: 'adjust', label: 'Edit', icon: <SlidersHorizontal /> },
          { value: 'masks', label: counts.masks ? `Masks ${counts.masks}` : 'Masks', icon: <Pencil /> },
          { value: 'shaders', label: counts.shaders ? `Shaders ${counts.shaders}` : 'Shaders', icon: <Sparkles /> },
        ]}
        onChange={(t) => {
          setTab(t)
          if (t !== 'masks' && view.mask?.subject === subject) setLookView({ mask: null })
        }}
      />

      <div className={enabled ? 'flex flex-col gap-2' : 'flex flex-col gap-2 opacity-60'}>
        {tab === 'adjust' ? (
          <>
            {ref.kind !== 'map' ? (
              <LookShadowEditor
                shadow={shown.shadow}
                inherited={layerShadow}
                defaultOpen={!!shown.shadow}
                onChange={(shadow, done) => edit((l) => (shadow ? { ...without(l, 'shadow'), shadow } : without(l, 'shadow')), done)}
              />
            ) : null}
            <LookAdjustEditor adjust={shown.adjust} onChange={(adjust, done) => edit((l) => withAdjust(l, adjust), done)} />
            <VignetteSection look={shown} onChange={(l, done) => edit(() => l, done)} />
            <GrainSection look={shown} onChange={(l, done) => edit(() => l, done)} />
          </>
        ) : tab === 'masks' ? (
          <LookMasksEditor
            masks={shown.masks ?? []}
            subject={subject}
            box={box}
            spaceLabel={ref.kind === 'picture' ? "the picture's own pixels (before scaling and flipping)" : 'map pixels'}
            onChange={editPart('masks')}
          />
        ) : (
          <LookShadersEditor shaders={shown.shaders ?? []} onChange={editPart('shaders')} />
        )}
      </div>
    </div>
  )
}
