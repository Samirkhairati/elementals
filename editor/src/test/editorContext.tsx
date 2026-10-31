/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { EditorProvider, type EditorBaseContextValue } from '@/components/editor/layout/EditorContext'
import type { SpriteAssetInfo, SpriteAssetMeta } from '../../../shared/engine/types'

/** Renders `ui` inside an EditorProvider whose value is only the fields the test cares about. */
export function renderWithEditor(ui: React.ReactElement, value: Partial<EditorBaseContextValue> = {}): RenderResult {
  const full = { spriteAssets: {}, spriteList: [], spriteWarnings: [], maps: [], entities: [], switches: [], variables: [], getSwitch: () => undefined, getVariable: () => undefined, ...value } as unknown as EditorBaseContextValue
  return render(<EditorProvider value={full}>{ui}</EditorProvider>)
}

// A 1x1 transparent PNG: enough for the code paths that only need a URL (jsdom never decodes it).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export function characterMeta(overrides: Partial<SpriteAssetMeta> = {}): SpriteAssetMeta {
  return {
    version: 1,
    name: 'Hero',
    kind: 'character',
    frameWidth: 32,
    frameHeight: 48,
    margin: 0,
    spacing: 0,
    pivotX: 0.5,
    pivotY: 1,
    character: { sheets: { walk: 'walk.png', run: 'run.png' }, framesPerDirection: 4, idleFrame: 1, walkFps: 8, runFps: 12 },
    ...overrides,
  }
}

export function objectMeta(overrides: Partial<SpriteAssetMeta> = {}): SpriteAssetMeta {
  return {
    version: 1,
    name: 'Chest',
    kind: 'object',
    frameWidth: 24,
    frameHeight: 24,
    margin: 0,
    spacing: 0,
    pivotX: 0.5,
    pivotY: 1,
    sheet: 'sheet.png',
    animations: { open: { frames: [1, 2, 3], fps: 8, loop: false } },
    ...overrides,
  }
}

export function makeAsset(id: string, meta: SpriteAssetMeta): SpriteAssetInfo {
  const sheets: Record<string, string> = {}
  if (meta.character) {
    sheets[meta.character.sheets.walk] = PNG
    if (meta.character.sheets.run) sheets[meta.character.sheets.run] = PNG
  } else if (meta.sheet) sheets[meta.sheet] = PNG
  return { id, meta, sheets }
}

export function assetMap(...assets: SpriteAssetInfo[]): Record<string, SpriteAssetInfo> {
  return Object.fromEntries(assets.map((a) => [a.id, a]))
}
