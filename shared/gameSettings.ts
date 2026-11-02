// Game settings: the values the author tunes in the editor (Game Settings page) and the game reads at boot.
// Stored in `project/game-settings.json`, copied to `game/public/data/settings.json` by the asset sync.
// The schema below is the single source: the editor builds its form from it, the game and the sync clamp
// whatever they read with `normalizeGameSettings`, so a hand-edited or old file can never break either side.
// Pure: no DOM or Node imports.

export interface DisplaySettings {
  /** How many tiles fit across the screen; the height follows at 16:9. */
  visibleTilesX: number
  /** Scale the picture by whole numbers only (sharpest pixels, black bars around it). */
  integerScaling: boolean
  /** Snap what is drawn to screen pixels (hides seams between tiles). */
  pixelSnapping: boolean
}

export interface CameraSettings {
  /** Seconds the camera takes to catch up with the player; 0 = locked to the player. */
  followLag: number
}

export interface MovementSettings {
  /** Walk from tile to tile (otherwise free movement; the T key switches while playing). */
  tileBased: boolean
  /** Default walking speed in pixels per second. */
  playerSpeed: number
  /** Milliseconds a direction key is held before the player walks (a shorter tap only turns). */
  turnDelayMs: number
}

export interface GameSettings {
  display: DisplaySettings
  camera: CameraSettings
  movement: MovementSettings
}

export type SettingCategoryId = keyof GameSettings

interface FieldBase {
  key: string
  label: string
  /** Shown in the (i) next to the label. */
  info: string
}

export interface NumberSetting extends FieldBase {
  kind: 'number'
  default: number
  min: number
  max: number
  step: number
  unit?: string
}

export interface ToggleSetting extends FieldBase {
  kind: 'toggle'
  default: boolean
}

export type SettingField = NumberSetting | ToggleSetting

export interface SettingCategory {
  id: SettingCategoryId
  label: string
  description: string
  fields: SettingField[]
}

/** The view is always this shape: tiles across x this ratio = tiles down. */
export const VIEW_ASPECT = 16 / 9

export const GAME_SETTINGS_SCHEMA: SettingCategory[] = [
  {
    id: 'display',
    label: 'View',
    description: 'How much of the world is on screen and how it is scaled to the window.',
    fields: [
      {
        key: 'visibleTilesX',
        kind: 'number',
        label: 'Tiles across',
        info: 'How many 32 px tiles fit across the screen. The view is always 16:9, so 32 tiles across shows 18 down. Larger numbers show more of the world, smaller ones zoom in.',
        default: 32,
        min: 16,
        max: 64,
        step: 1,
        unit: 'tiles',
      },
      {
        key: 'integerScaling',
        kind: 'toggle',
        label: 'Whole-number scaling',
        info: 'Scale the picture by 1x, 2x, 3x... only. Pixels stay perfectly even, but the window usually has black bars. Off fills the window at any size.',
        default: false,
      },
      {
        key: 'pixelSnapping',
        kind: 'toggle',
        label: 'Snap to screen pixels',
        info: 'Rounds every position to whole pixels of the picture. Off lets things move in finer steps, which looks smoother (most noticeable when the window is bigger than the view); turn it on if thin lines show between tiles.',
        default: false,
      },
    ],
  },
  {
    id: 'camera',
    label: 'Camera',
    description: 'How the view follows the player.',
    fields: [
      {
        key: 'followLag',
        kind: 'number',
        label: 'Follow lag',
        info: 'How long the camera takes to catch up with the player. 0 keeps the player exactly in the middle; around 0.1 softens starting and stopping.',
        default: 0.08,
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: 's',
      },
    ],
  },
  {
    id: 'movement',
    label: 'Movement',
    description: 'How characters walk.',
    fields: [
      {
        key: 'tileBased',
        kind: 'toggle',
        label: 'Tile-based movement',
        info: 'Characters walk from one tile to the next. Off lets the player move freely in any direction (the T key switches this while playing).',
        default: true,
      },
      {
        key: 'playerSpeed',
        kind: 'number',
        label: 'Walking speed',
        info: 'Pixels per second for the player and for characters that have no speed of their own. A tile is 32 px, so 200 is about six tiles a second.',
        default: 200,
        min: 40,
        max: 600,
        step: 10,
        unit: 'px/s',
      },
      {
        key: 'turnDelayMs',
        kind: 'number',
        label: 'Turn delay',
        info: 'How long a direction key has to be held before the player walks. A shorter tap only turns to face that way. 0 walks immediately.',
        default: 50,
        min: 0,
        max: 300,
        step: 10,
        unit: 'ms',
      },
    ],
  },
]

type Bag = Record<string, unknown>
const isRecord = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The settings of a fresh project. */
export function defaultGameSettings(): GameSettings {
  const out: Record<string, Bag> = {}
  for (const cat of GAME_SETTINGS_SCHEMA) {
    out[cat.id] = {}
    for (const f of cat.fields) out[cat.id][f.key] = f.default
  }
  return out as unknown as GameSettings
}

function cleanNumber(value: unknown, f: NumberSetting): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return f.default
  const clamped = Math.min(f.max, Math.max(f.min, value))
  // snap to the step grid (and drop float noise such as 0.07999999)
  const steps = Math.round((clamped - f.min) / f.step)
  const snapped = f.min + steps * f.step
  return Math.min(f.max, Number(snapped.toFixed(6)))
}

/** A usable GameSettings from anything: unknown keys are dropped, bad or missing values fall back to the default, numbers are clamped. */
export function normalizeGameSettings(raw: unknown): GameSettings {
  const src = isRecord(raw) ? raw : {}
  const out: Record<string, Bag> = {}
  for (const cat of GAME_SETTINGS_SCHEMA) {
    const bag = isRecord(src[cat.id]) ? (src[cat.id] as Bag) : {}
    out[cat.id] = {}
    for (const f of cat.fields) {
      out[cat.id][f.key] = f.kind === 'number' ? cleanNumber(bag[f.key], f) : typeof bag[f.key] === 'boolean' ? bag[f.key] : f.default
    }
  }
  return out as unknown as GameSettings
}

/** The settings with one value replaced (and cleaned). */
export function withSetting(settings: GameSettings, category: SettingCategoryId, key: string, value: number | boolean): GameSettings {
  return normalizeGameSettings({ ...settings, [category]: { ...settings[category], [key]: value } })
}

/** Size of the view in world pixels for a tile count: 32 px tiles, 16:9. */
export function viewSizeForTiles(tilesX: number, tileSize = 32): { width: number; height: number } {
  const width = Math.round(tilesX * tileSize)
  return { width, height: Math.round(width / VIEW_ASPECT) }
}
