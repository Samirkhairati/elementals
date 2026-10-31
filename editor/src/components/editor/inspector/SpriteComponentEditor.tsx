import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Grid3X3, ImageOff, Pause, Play, RotateCcw, ScanLine, TriangleAlert, X } from 'lucide-react'
import type { Facing } from '../../../../../shared/engine/types'
import { FACINGS } from '../../../../../shared/engine/constants'
import { sheetGrid } from '../../../../../shared/engine/sprites'
import { normalizeCollider } from '@/lib/entityVisuals'
import { getSpriteImageSize, useSpriteImagesVersion } from '@/lib/spriteImages'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Badge, EdButton, Field, IconButton, InfoTip, NumberField, SectionTitle, Segmented, useAnimationClock } from '../ui/controls'
import { SpriteThumb } from '../sprites/SpriteThumb'
import { EntityViewport } from './EntityViewport'
import { SpritePicker, splitAssetId } from './SpritePicker'
import type { CustomEditorProps } from './customEditors'

const selectSprites = (c: EditorContextValue) => ({ spriteAssets: c.spriteAssets, spriteList: c.spriteList })

const FACING_ARROWS: Record<Facing, string> = { down: '↓', left: '←', right: '→', up: '↑' }
const FACING_LABEL: Record<Facing, string> = { down: 'Down', left: 'Left', right: 'Right', up: 'Up' }

type Phase = 'idle' | 'walk' | 'run'

export function SpriteComponentEditor({ value, components, onChange, onChangeMany }: CustomEditorProps) {
  const { spriteAssets, spriteList } = useEditorSelector(selectSprites)
  const assetId: string = value.asset ?? ''
  const asset = assetId ? spriteAssets[assetId] : undefined
  const missing = !!assetId && !asset
  const meta = asset?.meta
  const isCharacter = meta?.kind === 'character'

  const [pickerOpen, setPickerOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [playing, setPlaying] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [showCollider, setShowCollider] = useState(true)

  const facing: Facing = FACINGS.includes(value.facing) ? value.facing : 'down'
  const animation: string = value.animation ?? ''
  const animationNames = useMemo(() => Object.keys(meta?.animations ?? {}), [meta])
  const hasAnimation = !isCharacter && !!animation && animationNames.includes(animation)
  const imagesVersion = useSpriteImagesVersion()
  const frameCount = useMemo(() => {
    void imagesVersion
    if (!meta || isCharacter || !asset) return Infinity
    const size = getSpriteImageSize(asset.sheets[meta.sheet ?? ''])
    return size ? Math.max(1, sheetGrid(meta, size.width, size.height).count) : Infinity
  }, [meta, isCharacter, asset, imagesVersion])

  // Reset the phase when the asset stops being a character.
  useEffect(() => {
    if (!isCharacter) setPhase('idle')
  }, [isCharacter])

  const animated = isCharacter ? phase !== 'idle' : hasAnimation
  const tick = useAnimationClock(animated && playing)

  const previewSprite = useMemo(
    () => ({
      facing,
      animation: isCharacter ? (phase === 'idle' ? '' : phase) : animation,
      frame: Number(value.frame) || 0,
      offsetX: Number(value.offsetX) || 0,
      offsetY: Number(value.offsetY) || 0,
      scale: Number(value.scale) > 0 ? Number(value.scale) : 1,
      flipX: !!value.flipX,
      tint: typeof value.tint === 'string' ? value.tint : '',
      opacity: typeof value.opacity === 'number' ? value.opacity : 1,
    }),
    [facing, isCharacter, phase, animation, value.frame, value.offsetX, value.offsetY, value.scale, value.flipX, value.tint, value.opacity],
  )

  const collider = useMemo(() => (components.Collider && showCollider ? normalizeCollider(components.Collider) : null), [components.Collider, showCollider])

  const choose = (id: string) => {
    if (id === assetId) return
    // A new asset invalidates animation / frame (they refer to the old sheet).
    onChangeMany({ asset: id, animation: '', frame: 0 })
  }

  const offsetX = Number(value.offsetX) || 0
  const offsetY = Number(value.offsetY) || 0
  const meaningfulName = meta ? meta.name || splitAssetId(assetId).leaf : ''

  return (
    <div className="flex flex-col gap-3" data-testid="sprite-editor">
      {/* Asset button */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label={asset ? `Sprite asset ${assetId}. Change` : 'Choose sprite'}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-input bg-background/40 p-2 text-left hover:bg-muted"
        >
          <div className="ed-checker flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
            {asset ? <SpriteThumb asset={asset} size={36} /> : <ImageOff className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-ed-body text-foreground">{asset ? meaningfulName : missing ? assetId : 'No sprite'}</div>
            <div className="flex items-center gap-1 truncate text-ed-label text-muted-foreground">
              {asset ? (
                <>
                  <Badge tone={isCharacter ? 'move' : meta?.kind === 'animated' ? 'event' : undefined}>{meta?.kind}</Badge>
                  <span className="truncate">{assetId}</span>
                </>
              ) : (
                <span>Click to choose…</span>
              )}
            </div>
          </div>
        </button>
        {assetId && (
          <IconButton className="self-center" title="Clear sprite" aria-label="Clear sprite" onClick={() => choose('')}>
            <X />
          </IconButton>
        )}
      </div>

      {missing && (
        <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-2" role="alert">
          <div className="flex items-start gap-2 text-ed-label text-warning">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Sprite <b>{assetId}</b> is not in this project (deleted or renamed). The entity will have no graphic in the game.
            </span>
          </div>
          <EdButton size="sm" onClick={() => setPickerOpen(true)}>
            Pick another sprite
          </EdButton>
        </div>
      )}

      {asset && meta && (
        <>
          {/* Live preview */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="ed-section-title">Preview</span>
                <InfoTip>
                  Drag the sprite to move it (1px, hold Shift for 8px). The cross is the anchor on the map. Ctrl/⌘ + scroll or pinch zooms, middle-drag or Alt-drag pans, and the Fit button resets the view.
                </InfoTip>
              </div>
              <div className="flex items-center gap-1">
                <IconButton active={showGrid} title="Tile grid" aria-label="Toggle tile grid" onClick={() => setShowGrid((v) => !v)}>
                  <Grid3X3 />
                </IconButton>
                <IconButton active={showCollider} title="Show collider" aria-label="Toggle collider overlay" onClick={() => setShowCollider((v) => !v)} disabled={!components.Collider}>
                  <ScanLine />
                </IconButton>
              </div>
            </div>

            <EntityViewport
              asset={asset}
              sprite={previewSprite}
              tick={tick}
              showTileGrid={showGrid}
              collider={collider}
              showSpriteFrame
              onSpriteOffsetChange={(x, y) => onChangeMany({ offsetX: x, offsetY: y })}
            />

            {isCharacter && (
              <div className="flex flex-col gap-2">
                <Field label="Facing">
                  <Segmented
                    aria-label="Facing"
                    value={facing}
                    onChange={(f) => onChange('facing', f)}
                    options={FACINGS.map((f) => ({ value: f, label: FACING_ARROWS[f], title: `Face ${FACING_LABEL[f].toLowerCase()}`, ariaLabel: `Face ${FACING_LABEL[f].toLowerCase()}` }))}
                  />
                </Field>
                <Field label="Preview" info="Characters pick idle / walk / run themselves in the game; the phase here is only a preview.">
                  <Segmented
                    aria-label="Preview phase"
                    value={phase}
                    onChange={setPhase}
                    options={[
                      { value: 'idle', label: 'Idle', title: 'Standing still' },
                      { value: 'walk', label: 'Walk', title: 'Walk cycle' },
                      ...(meta.character?.sheets.run ? [{ value: 'run' as const, label: 'Run', title: 'Run cycle' }] : []),
                    ]}
                  />
                  {phase !== 'idle' && (
                    <IconButton title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause preview' : 'Play preview'} onClick={() => setPlaying((p) => !p)}>
                      {playing ? <Pause /> : <Play />}
                    </IconButton>
                  )}
                </Field>
              </div>
            )}

            {!isCharacter && (
              <div className="flex flex-col gap-2">
                <Field label="Animation">
                  <select
                    className="ed-input"
                    aria-label="Animation"
                    value={hasAnimation ? animation : ''}
                    onChange={(e) => onChange('animation', e.target.value)}
                  >
                    <option value="">Static frame</option>
                    {animationNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  {hasAnimation && (
                    <IconButton title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause preview' : 'Play preview'} onClick={() => setPlaying((p) => !p)}>
                      {playing ? <Pause /> : <Play />}
                    </IconButton>
                  )}
                </Field>
                {!hasAnimation && (
                  <Field label="Frame">
                    <IconButton title="Previous frame" aria-label="Previous frame" onClick={() => onChange('frame', Math.max(0, (Number(value.frame) || 0) - 1))}>
                      <ChevronLeft />
                    </IconButton>
                    <NumberField value={Number(value.frame) || 0} min={0} max={frameCount === Infinity ? undefined : frameCount - 1} onCommit={(v) => onChange('frame', v)} aria-label="Frame" className="flex-1" />
                    <IconButton title="Next frame" aria-label="Next frame" onClick={() => onChange('frame', Math.min(frameCount === Infinity ? Infinity : frameCount - 1, (Number(value.frame) || 0) + 1))}>
                      <ChevronRight />
                    </IconButton>
                  </Field>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Where the graphic sits relative to the entity */}
      <div className="flex flex-col gap-2">
        <SectionTitle
          info="Shifts the graphic from the entity's anchor, in pixels. Opacity, tint and flipping are not part of the Sprite; they will become a separate component."
          actions={
            <EdButton size="sm" disabled={offsetX === 0 && offsetY === 0} onClick={() => onChangeMany({ offsetX: 0, offsetY: 0 })} title="Put the sprite back on its anchor">
              <RotateCcw />
              Reset offset
            </EdButton>
          }
        >
          Placement
        </SectionTitle>
        <Field label="Offset X" hint="Shifts the graphic from the anchor (px)">
          <NumberField value={offsetX} unit="px" onCommit={(v) => onChange('offsetX', v)} aria-label="Offset X" />
        </Field>
        <Field label="Offset Y" hint="Shifts the graphic from the anchor (px)">
          <NumberField value={offsetY} unit="px" onCommit={(v) => onChange('offsetY', v)} aria-label="Offset Y" />
        </Field>
        <Field label="Scale">
          <NumberField value={Number(value.scale) || 1} min={0.1} max={8} step={0.25} integer={false} onCommit={(v) => onChange('scale', v)} aria-label="Scale" />
        </Field>
      </div>

      <SpritePicker open={pickerOpen} onOpenChange={setPickerOpen} assets={spriteList} value={assetId} onSelect={choose} />
    </div>
  )
}
