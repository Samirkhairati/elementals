import React, { useMemo, useState } from 'react'
import { Maximize, RotateCcw, Square } from 'lucide-react'
import { COMPONENT_SCHEMAS } from '../../../../../shared/engine/components'
import { FIT_TILE, fitColliderToSprite, normalizeCollider, sameCollider, type ColliderPatch } from '@/lib/entityVisuals'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { TILE_SIZE } from '../../../../../shared/engine/constants'
import { snapColliderToTiles } from '../../../../../shared/engine/placement'
import { Badge, EdButton, Field, InfoTip, NumberField, Toggle } from '../ui/controls'
import { EntityViewport } from './EntityViewport'
import type { CustomEditorProps } from './customEditors'

const selectSprites = (c: EditorContextValue) => ({ spriteAssets: c.spriteAssets })


export function ColliderComponentEditor({ value, components, onChange, onChangeMany }: CustomEditorProps) {
  const { spriteAssets } = useEditorSelector(selectSprites)
  // A tile-based entity's area always covers whole tiles; a free entity's takes any size and offset (see Transform.free).
  const free = components.Transform?.free === true
  const snap = !free
  const grid = snap ? TILE_SIZE : 1
  const collider = useMemo(() => normalizeCollider(value), [value])
  const current: ColliderPatch = { width: collider.width, height: collider.height, offsetX: collider.offsetX, offsetY: collider.offsetY }

  const sprite = components.Sprite
  const asset = sprite?.asset ? spriteAssets[sprite.asset] : undefined
  // The sprite is a dimmed silhouette here: this diagram is about the collider.
  const silhouette = useMemo(
    () =>
      sprite && asset
        ? {
            facing: sprite.facing ?? 'down',
            animation: '',
            frame: Number(sprite.frame) || 0,
            offsetX: Number(sprite.offsetX) || 0,
            offsetY: Number(sprite.offsetY) || 0,
            scale: Number(sprite.scale) > 0 ? Number(sprite.scale) : 1,
            flipX: !!sprite.flipX,
            tint: '',
            opacity: 0.55,
          }
        : undefined,
    [sprite, asset],
  )

  const spriteFit = useMemo(() => {
    const fit = asset && sprite ? fitColliderToSprite(asset.meta, sprite) : null
    return fit && snap ? { ...fit, ...snapColliderToTiles(fit) } : fit
  }, [asset, sprite, snap])
  /** One number changed: a tile-based entity's whole area is snapped to the grid again, a free one's is kept as typed. */
  const commit = (key: keyof ColliderPatch, v: number) => {
    if (snap) onChangeMany(snapColliderToTiles({ ...current, [key]: v }))
    else onChange(key, v)
  }
  const isTileFit = sameCollider(current, FIT_TILE)
  const isSpriteFit = !!spriteFit && sameCollider(current, spriteFit)
  const defaults = COMPONENT_SCHEMAS.Collider.defaultProps as { width: number; height: number; offsetX: number; offsetY: number; isSolid: boolean }
  const isDefault = isTileFit && collider.isSolid === defaults.isSolid

  return (
    <div className="flex flex-col gap-3" data-testid="collider-editor">
      <Field label="Solid" info="Solid blocks the player and other entities. Off lets them walk through; the area still exists for events.">
        <Toggle checked={collider.isSolid} onChange={(v) => onChange('isSolid', v)} aria-label="Solid" />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <span className="ed-section-title">Area</span>
          <InfoTip>
            {free
              ? 'A free entity: drag the box or its handles to any size and place (snaps to 4px; hold Shift for single pixels). '
              : 'A tile-based entity: the box covers whole tiles, so dragging and the numbers snap to the grid (hold Shift to place by the pixel; the entity then no longer fills whole tiles). To size it freely, make the entity free in the inspector. '}
            The dashed square is the entity&apos;s tile, the cross its anchor. Ctrl/⌘ + scroll or pinch zooms, middle-drag or Alt-drag pans, and the Fit button resets the view.
          </InfoTip>
          <span className="ml-auto"><Badge title={free ? 'Any size and position; nothing snaps' : 'Snaps to whole tiles'}>{free ? 'free' : 'tiles'}</Badge></span>
        </div>
        <EntityViewport asset={asset} sprite={silhouette} collider={collider} snapStep={snap ? TILE_SIZE : undefined} onColliderChange={(patch) => onChangeMany(patch)} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Field label="W" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Width">
          <NumberField value={collider.width} min={1} max={4096} step={grid} unit="px" onCommit={(v) => commit('width', v)} aria-label="Width" />
        </Field>
        <Field label="H" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Height">
          <NumberField value={collider.height} min={1} max={4096} step={grid} unit="px" onCommit={(v) => commit('height', v)} aria-label="Height" />
        </Field>
        <Field label="X" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Offset X: the box is centred on the anchor, then shifted">
          <NumberField value={collider.offsetX} step={grid} unit="px" onCommit={(v) => commit('offsetX', v)} aria-label="Offset X" />
        </Field>
        <Field label="Y" className="[grid-template-columns:20px_minmax(0,1fr)]" hint="Offset Y: the box sits on the anchor, then shifted (+ is down)">
          <NumberField value={collider.offsetY} step={grid} unit="px" onCommit={(v) => commit('offsetY', v)} aria-label="Offset Y" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <EdButton size="sm" disabled={isTileFit} onClick={() => onChangeMany({ ...FIT_TILE })} title="32×32 on the entity's tile">
          <Square />
          Fit to tile
        </EdButton>
        <EdButton
          size="sm"
          disabled={!spriteFit || isSpriteFit}
          onClick={() => spriteFit && onChangeMany({ ...spriteFit })}
          title={spriteFit ? `Wrap the sprite (${spriteFit.width}×${spriteFit.height})` : 'Needs a Sprite with an asset'}
        >
          <Maximize />
          Fit to sprite
        </EdButton>
        <EdButton size="sm" disabled={isDefault} onClick={() => onChangeMany({ ...defaults })} title="Back to one solid tile">
          <RotateCcw />
          Reset
        </EdButton>
      </div>
    </div>
  )
}
