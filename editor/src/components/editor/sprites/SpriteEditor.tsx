// Editor for one sprite asset: sheet with frame grid, frame/pivot settings, character settings,
// animations (with live preview), validation and Save / rename / delete.

import React, { useEffect, useMemo, useState } from 'react'
import { MousePointerClick, Pause, Play, Plus, RotateCcw, Save, Trash2, TriangleAlert, X, CircleAlert, Check } from 'lucide-react'
import type { Facing, SpriteAnimationDef, SpriteAssetInfo, SpriteAssetMeta } from '../../../../../shared/engine/types'
import { FACINGS } from '../../../../../shared/engine/constants'
import { sheetGrid, spriteSheetRoles } from '../../../../../shared/engine/sprites'
import { getSpriteImageSize, useSpriteImagesVersion } from '@/lib/spriteImages'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Badge, EdButton, Field, IconButton, NumberField, Segmented, TextField, Toggle, useAnimationClock } from '../ui/controls'
import { SheetViewer } from './SheetViewer'
import { SpriteMiniPreview } from './SpriteMiniPreview'
import {
  appendFrame,
  cloneMeta,
  isDraftDirty,
  nextAnimationName,
  parseFrameList,
  removeFrameAt,
  switchableKinds,
  validateDraft,
  withKind,
} from './spriteDraft'

const selectEditor = (c: EditorContextValue) => ({
  saveSpriteMeta: c.saveSpriteMeta,
  renameSprite: c.renameSprite,
  removeSprite: c.removeSprite,
  setConfirmDialog: c.setConfirmDialog,
})

const FACING_ARROWS: Record<Facing, string> = { down: '↓', left: '←', right: '→', up: '↑' }

interface SpriteEditorProps {
  asset: SpriteAssetInfo
  /** How many entities use this asset (maps + open map). */
  usage: number
  /** The asset was renamed or deleted. */
  onIdChanged: (newId: string | null) => void
}

function AnimationRow({
  asset,
  draft,
  name,
  anim,
  picking,
  onPick,
  onChange,
  onRename,
  onDelete,
}: {
  asset: SpriteAssetInfo
  draft: SpriteAssetMeta
  name: string
  anim: SpriteAnimationDef
  picking: boolean
  onPick: () => void
  onChange: (anim: SpriteAnimationDef) => void
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const [playing, setPlaying] = useState(true)
  const tick = useAnimationClock(playing)
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background/30 p-2" data-testid={`animation-${name}`}>
      <div className="flex items-center gap-2">
        <SpriteMiniPreview asset={asset} meta={draft} animation={name} tick={tick} size={48} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <TextField value={name} onCommit={onRename} aria-label={`Animation name ${name}`} />
            <IconButton title={playing ? 'Pause preview' : 'Play preview'} aria-label={playing ? 'Pause preview' : 'Play preview'} onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause /> : <Play />}
            </IconButton>
            <IconButton tone="danger" title="Delete animation" aria-label={`Delete animation ${name}`} onClick={onDelete}>
              <Trash2 />
            </IconButton>
          </div>
          <div className="flex items-center gap-2">
            <NumberField value={anim.fps} min={1} max={60} unit="fps" onCommit={(fps) => onChange({ ...anim, fps })} aria-label={`FPS of ${name}`} />
            <label className="flex shrink-0 items-center gap-2 text-ed-label text-muted-foreground">
              Loop
              <Toggle checked={anim.loop} onChange={(loop) => onChange({ ...anim, loop })} aria-label={`Loop ${name}`} />
            </label>
          </div>
        </div>
      </div>

      <Field label="Frames" stack>
        <div className="flex w-full flex-wrap items-center gap-1">
          {anim.frames.map((f, i) => (
            <button
              key={`${i}-${f}`}
              type="button"
              title={`Remove frame ${f}`}
              aria-label={`Remove frame ${f} at position ${i + 1}`}
              onClick={() => onChange(removeFrameAt(anim, i))}
              className="ed-badge hover:!bg-solid/20 hover:!text-solid"
            >
              {f}
              <X />
            </button>
          ))}
          {anim.frames.length === 0 && <span className="ed-hint">No frames yet</span>}
        </div>
        <div className="flex w-full items-center gap-2">
          <TextField
            value={anim.frames.join(', ')}
            onCommit={(text) => {
              const frames = parseFrameList(text)
              if (frames.length > 0) onChange({ ...anim, frames })
            }}
            placeholder="0-3, 5"
            aria-label={`Frame list of ${name}`}
          />
          <EdButton size="sm" variant={picking ? 'primary' : 'default'} onClick={onPick} aria-pressed={picking} title="Click frames on the sheet to append them">
            <MousePointerClick />
            {picking ? 'Picking…' : 'Pick'}
          </EdButton>
        </div>
      </Field>
    </div>
  )
}

/** Walk cycle of every direction; owns the animation clock so only these canvases re-render each frame. */
function CharacterWalkPreview({ asset, draft }: { asset: SpriteAssetInfo; draft: SpriteAssetMeta }) {
  const tick = useAnimationClock(true)
  return (
    <div className="flex items-end gap-2 rounded-md border border-border bg-muted/20 p-2">
      {FACINGS.map((f) => (
        <div key={f} className="flex flex-col items-center gap-1">
          <SpriteMiniPreview asset={asset} meta={draft} facing={f} animation="walk" tick={tick} size={48} />
          <span className="text-ed-label text-muted-foreground">{FACING_ARROWS[f]}</span>
        </div>
      ))}
      <div className="ed-hint flex-1 pl-2">Walk cycle of each direction (what the game plays).</div>
    </div>
  )
}

export function SpriteEditor({ asset, usage, onIdChanged }: SpriteEditorProps) {
  const ctx = useEditorSelector(selectEditor)
  const [draft, setDraft] = useState<SpriteAssetMeta>(() => cloneMeta(asset.meta))
  const [sheetFile, setSheetFile] = useState<string>('')
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [picking, setPicking] = useState<string | null>(null)
  const [idDraft, setIdDraft] = useState(asset.id)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const imagesVersion = useSpriteImagesVersion()

  // A different asset (or a reload that changed the saved meta) resets the draft.
  const savedJson = JSON.stringify(asset.meta)
  useEffect(() => {
    setDraft(cloneMeta(asset.meta))
    setIdDraft(asset.id)
    setPicking(null)
    setMessage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, savedJson])

  const roles = useMemo(() => spriteSheetRoles(draft), [draft])
  const activeSheet = roles.find((r) => r.file === sheetFile)?.file ?? roles[0]?.file ?? ''
  const sheetUrl = asset.sheets[activeSheet]
  const size = useMemo(() => {
    void imagesVersion
    return getSpriteImageSize(sheetUrl)
  }, [sheetUrl, imagesVersion])

  const sizes = useMemo(() => {
    void imagesVersion
    const out: Record<string, { width: number; height: number }> = {}
    for (const f of Object.keys(asset.sheets)) {
      const s = getSpriteImageSize(asset.sheets[f])
      if (s) out[f] = s
    }
    return out
  }, [asset.sheets, imagesVersion])

  const validation = useMemo(() => validateDraft(draft, sizes, Object.keys(asset.sheets)), [draft, sizes, asset.sheets])
  const dirty = isDraftDirty(draft, asset.meta)
  const isCharacter = draft.kind === 'character'
  const grid = size ? sheetGrid(draft, size.width, size.height) : null
  const effectiveZoom = zoom === 'fit' ? (size ? Math.max(1, Math.min(6, Math.floor(300 / Math.max(1, size.width)))) : 1) : zoom

  const patch = (p: Partial<SpriteAssetMeta>) => setDraft((d) => ({ ...d, ...p }))
  const patchChar = (p: Partial<NonNullable<SpriteAssetMeta['character']>>) =>
    setDraft((d) => (d.character ? { ...d, character: { ...d.character, ...p } } : d))
  const animations = draft.animations ?? {}
  const setAnimations = (next: Record<string, SpriteAnimationDef>) => setDraft((d) => ({ ...d, animations: next }))

  const save = async () => {
    setBusy(true)
    setMessage(null)
    const res = await ctx.saveSpriteMeta(asset.id, draft)
    setBusy(false)
    setMessage(res.ok ? { kind: 'ok', text: 'Saved' } : { kind: 'error', text: res.error })
  }

  const rename = async () => {
    const next = idDraft.trim()
    if (!next || next === asset.id) return
    const run = async () => {
      setBusy(true)
      const res = await ctx.renameSprite(asset.id, next)
      setBusy(false)
      if (res.ok) onIdChanged(res.id)
      else setMessage({ kind: 'error', text: res.error })
    }
    if (usage > 0) {
      ctx.setConfirmDialog({
        open: true,
        title: 'Rename sprite',
        description: `“${asset.id}” is used by ${usage} entit${usage === 1 ? 'y' : 'ies'}. They will show no graphic until their Sprite is pointed at “${next}”. Rename anyway?`,
        action: () => void run(),
      })
    } else {
      await run()
    }
  }

  const remove = () => {
    ctx.setConfirmDialog({
      open: true,
      title: 'Delete sprite',
      description:
        usage > 0
          ? `“${asset.id}” is used by ${usage} entit${usage === 1 ? 'y' : 'ies'}; they will lose their graphic. Delete the sprite and its sheets from the project?`
          : `Delete the sprite “${asset.id}” and its sheets from the project?`,
      action: () => {
        void ctx.removeSprite(asset.id).then((res) => {
          if (res.ok) onIdChanged(null)
          else setMessage({ kind: 'error', text: res.error })
        })
      },
    })
  }

  const onFrameClick = (index: number) => {
    if (!picking || !animations[picking]) return
    setAnimations({ ...animations, [picking]: appendFrame(animations[picking], index) })
  }

  const highlight = picking && animations[picking] ? animations[picking].frames : []
  const columns = isCharacter ? draft.character?.framesPerDirection : undefined

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="sprite-editor-panel">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[160px] flex-1">
          <TextField value={draft.name} onCommit={(name) => patch({ name })} aria-label="Sprite name" />
        </div>
        <Badge tone={isCharacter ? 'move' : draft.kind === 'animated' ? 'event' : undefined}>{draft.kind}</Badge>
        <Badge title="Entities using this sprite" tone={usage > 0 ? undefined : 'warn'}>
          {usage === 0 ? 'unused' : `${usage} use${usage === 1 ? '' : 's'}`}
        </Badge>
        <div className="flex items-center gap-1">
          <EdButton size="sm" disabled={!dirty || busy} onClick={() => setDraft(cloneMeta(asset.meta))} title="Throw away unsaved changes">
            <RotateCcw />
            Revert
          </EdButton>
          <EdButton size="sm" variant="primary" disabled={!dirty || busy || validation.errors.length > 0} onClick={save} title={validation.errors.length ? 'Fix the errors first' : 'Write sprite.json'}>
            <Save />
            Save
          </EdButton>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-md border px-2 py-1 text-ed-label ${message.kind === 'ok' ? 'border-success/40 bg-success/10 text-success' : 'border-solid/40 bg-solid/10 text-solid'}`} role="status">
          {message.kind === 'ok' ? <Check className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
          {message.text}
        </div>
      )}

      {/* Id */}
      <div className="flex items-center gap-2">
        <Field label="Asset id" className="flex-1">
          <TextField value={idDraft} onCommit={setIdDraft} aria-label="Asset id" />
          <EdButton size="sm" disabled={busy || idDraft.trim() === asset.id || !idDraft.trim()} onClick={rename}>
            Rename
          </EdButton>
        </Field>
      </div>

      {/* Sheet */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="ed-section-title">Sheet {size ? `· ${size.width}×${size.height}px` : ''}</div>
          <div className="flex items-center gap-2">
            {roles.length > 1 && (
              <Segmented aria-label="Sheet" value={activeSheet} onChange={setSheetFile} options={roles.map((r) => ({ value: r.file, label: r.role }))} />
            )}
            <Segmented
              aria-label="Sheet zoom"
              value={zoom === 'fit' ? 'fit' : String(zoom)}
              onChange={(v) => setZoom(v === 'fit' ? 'fit' : Number(v))}
              options={[{ value: 'fit', label: 'Fit' }, ...[1, 2, 3, 4, 6].map((z) => ({ value: String(z), label: `${z}×` }))]}
            />
          </div>
        </div>
        {sheetUrl && size ? (
          <SheetViewer
            src={sheetUrl}
            imageWidth={size.width}
            imageHeight={size.height}
            frameWidth={draft.frameWidth}
            frameHeight={draft.frameHeight}
            margin={draft.margin}
            spacing={draft.spacing}
            zoom={effectiveZoom}
            highlight={highlight}
            onFrameClick={picking ? onFrameClick : undefined}
            pivot={{ x: draft.pivotX, y: draft.pivotY }}
            onPivotChange={(x, y) => patch({ pivotX: Math.round(x * 100) / 100, pivotY: Math.round(y * 100) / 100 })}
            columns={columns}
            rowLabels={isCharacter ? ['↓ down', '← left', '→ right', '↑ up'] : undefined}
            maxHeight={360}
          />
        ) : (
          <div className="ed-empty rounded-md border border-dashed border-border py-8">{sheetUrl ? 'Decoding sheet…' : 'No sheet image found'}</div>
        )}
        {picking && <div className="ed-hint">Click frames on the sheet to add them to “{picking}”.</div>}
        <div className="ed-hint">Drag the purple dot to move the pivot: the point of the frame that stands on the entity&apos;s anchor.</div>
      </section>

      {/* Frames */}
      <section className="flex flex-col gap-2">
        <div className="ed-section-title">Frames</div>
        {draft.kind !== 'character' && (
          <Field label="Kind">
            <Segmented
              aria-label="Kind"
              value={draft.kind}
              onChange={(k) => setDraft((d) => withKind(d, k))}
              options={switchableKinds(draft.kind).map((k) => ({ value: k, label: k }))}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Field label="W" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Frame width">
            <NumberField value={draft.frameWidth} min={1} max={4096} unit="px" onCommit={(v) => patch({ frameWidth: v })} aria-label="Frame width" />
          </Field>
          <Field label="H" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Frame height">
            <NumberField value={draft.frameHeight} min={1} max={4096} unit="px" onCommit={(v) => patch({ frameHeight: v })} aria-label="Frame height" />
          </Field>
          <Field label="M" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Margin around the whole sheet">
            <NumberField value={draft.margin} min={0} max={512} unit="px" onCommit={(v) => patch({ margin: v })} aria-label="Margin" />
          </Field>
          <Field label="S" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Spacing between frames">
            <NumberField value={draft.spacing} min={0} max={512} unit="px" onCommit={(v) => patch({ spacing: v })} aria-label="Spacing" />
          </Field>
          <Field label="Px" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Pivot X (0 left … 1 right)">
            <NumberField value={draft.pivotX} min={0} max={1} step={0.05} integer={false} onCommit={(v) => patch({ pivotX: v })} aria-label="Pivot X" />
          </Field>
          <Field label="Py" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Pivot Y (0 top … 1 bottom)">
            <NumberField value={draft.pivotY} min={0} max={1} step={0.05} integer={false} onCommit={(v) => patch({ pivotY: v })} aria-label="Pivot Y" />
          </Field>
        </div>
        {grid && (
          <div className="ed-hint" data-testid="grid-summary">
            {grid.columns} × {grid.rows} = {grid.count} frames
          </div>
        )}
      </section>

      {/* Character settings */}
      {isCharacter && draft.character && (
        <section className="flex flex-col gap-2">
          <div className="ed-section-title">Character</div>
          <Field label="Frames / dir" hint="Frames in one row (one direction)">
            <NumberField value={draft.character.framesPerDirection} min={1} max={32} onCommit={(v) => patchChar({ framesPerDirection: v, idleFrame: Math.min(draft.character!.idleFrame, v - 1) })} aria-label="Frames per direction" />
          </Field>
          <Field label="Idle frame" hint="Frame of the row shown when standing still">
            <NumberField value={draft.character.idleFrame} min={0} max={Math.max(0, draft.character.framesPerDirection - 1)} onCommit={(v) => patchChar({ idleFrame: v })} aria-label="Idle frame" />
          </Field>
          <Field label="Walk speed">
            <NumberField value={draft.character.walkFps} min={1} max={60} unit="fps" onCommit={(v) => patchChar({ walkFps: v })} aria-label="Walk fps" />
          </Field>
          <Field label="Run speed">
            <NumberField value={draft.character.runFps} min={1} max={60} unit="fps" onCommit={(v) => patchChar({ runFps: v })} aria-label="Run fps" />
          </Field>
          <Field label="Walk sheet">
            <select
              className="ed-input"
              aria-label="Walk sheet"
              value={draft.character.sheets.walk}
              onChange={(e) => patchChar({ sheets: { ...draft.character!.sheets, walk: e.target.value } })}
            >
              {[...new Set([draft.character.sheets.walk, ...Object.keys(asset.sheets)])].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Run sheet">
            <select
              className="ed-input"
              aria-label="Run sheet"
              value={draft.character.sheets.run ?? ''}
              onChange={(e) => {
                const sheets = { walk: draft.character!.sheets.walk, ...(e.target.value ? { run: e.target.value } : {}) }
                patchChar({ sheets })
              }}
            >
              <option value="">None</option>
              {Object.keys(asset.sheets).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <CharacterWalkPreview asset={asset} draft={draft} />
        </section>
      )}

      {/* Animations */}
      {!isCharacter && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="ed-section-title">Animations</div>
            <EdButton
              size="sm"
              onClick={() => {
                const name = nextAnimationName(Object.keys(animations))
                setAnimations({ ...animations, [name]: { frames: [0], fps: 8, loop: true } })
                setPicking(name)
              }}
            >
              <Plus />
              Add animation
            </EdButton>
          </div>
          {Object.keys(animations).length === 0 && <div className="ed-hint">No animations: the sprite shows one static frame, chosen on the entity.</div>}
          {Object.entries(animations).map(([name, anim]) => (
            <AnimationRow
              key={name}
              asset={asset}
              draft={draft}
              name={name}
              anim={anim}
              picking={picking === name}
              onPick={() => setPicking((p) => (p === name ? null : name))}
              onChange={(next) => setAnimations({ ...animations, [name]: next })}
              onRename={(newName) => {
                const clean = newName.trim()
                if (!clean || clean === name || animations[clean]) return
                const next: Record<string, SpriteAnimationDef> = {}
                for (const [k, v] of Object.entries(animations)) next[k === name ? clean : k] = v
                setAnimations(next)
                if (picking === name) setPicking(clean)
              }}
              onDelete={() => {
                const { [name]: _removed, ...rest } = animations
                setAnimations(rest)
                if (picking === name) setPicking(null)
              }}
            />
          ))}
        </section>
      )}

      {/* Validation */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <section className="flex flex-col gap-1" data-testid="validation">
          {validation.errors.map((e) => (
            <div key={e} className="flex items-start gap-2 text-ed-label text-solid">
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              {e}
            </div>
          ))}
          {validation.warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 text-ed-label text-warning">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              {w}
            </div>
          ))}
        </section>
      )}

      <div className="flex justify-end border-t border-border pt-3">
        <EdButton variant="danger" onClick={remove}>
          <Trash2 />
          Delete sprite
        </EdButton>
      </div>
    </div>
  )
}
