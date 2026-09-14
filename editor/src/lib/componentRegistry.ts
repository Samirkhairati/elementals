import { ComponentType, ComponentSchemaEntry } from '@/types/editor'

export const COMPONENT_REGISTRY: Record<ComponentType, ComponentSchemaEntry> = {
  Transform: {
    label: 'Transform',
    singleton: true,
    defaultProps: { x: 0, y: 0, depth: 10 },
    fields: [
      { key: 'x', label: 'Position X (px)', type: 'number', step: 16 },
      { key: 'y', label: 'Position Y (px)', type: 'number', step: 16 },
      { key: 'depth', label: 'Depth (Z)', type: 'number', min: 0, step: 1 },
    ],
  },
  SpriteView: {
    label: 'Sprite View',
    singleton: true,
    defaultProps: {
      texture: 'player-walk',
      frame: 0,
      originX: 0.5,
      originY: 1.0,
      visible: true,
      alpha: 1.0,
      flipX: false,
    },
    fields: [
      { key: 'texture', label: 'Texture Key', type: 'string', placeholder: 'e.g. player-walk' },
      { key: 'frame', label: 'Frame Index', type: 'number', min: 0, step: 1 },
      { key: 'originX', label: 'Origin X', type: 'number', min: 0, max: 1, step: 0.1 },
      { key: 'originY', label: 'Origin Y', type: 'number', min: 0, max: 1, step: 0.1 },
      { key: 'visible', label: 'Visible', type: 'boolean' },
      { key: 'alpha', label: 'Opacity (Alpha)', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'flipX', label: 'Flip Horizontally', type: 'boolean' },
    ],
  },
  Collider: {
    label: 'Collider',
    singleton: true,
    defaultProps: {
      width: 16,
      height: 8,
      offsetX: 0,
      offsetY: 0,
      isSolid: true,
    },
    fields: [
      { key: 'width', label: 'Width (px)', type: 'number', min: 1, step: 1 },
      { key: 'height', label: 'Height (px)', type: 'number', min: 1, step: 1 },
      { key: 'offsetX', label: 'Offset X', type: 'number', step: 1 },
      { key: 'offsetY', label: 'Offset Y', type: 'number', step: 1 },
      { key: 'isSolid', label: 'Is Solid (Blocks Movement)', type: 'boolean' },
    ],
  },
  GridMovement: {
    label: 'Grid Movement',
    singleton: true,
    defaultProps: {
      speed: 100,
      direction: 'down',
    },
    fields: [
      { key: 'speed', label: 'Move Speed', type: 'number', min: 10, max: 500, step: 10 },
      {
        key: 'direction',
        label: 'Facing Direction',
        type: 'select',
        options: [
          { label: 'Down', value: 'down' },
          { label: 'Up', value: 'up' },
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
    ],
  },
  FreeMovement: {
    label: 'Free Movement',
    singleton: true,
    defaultProps: {
      speed: 100,
      direction: 'down',
    },
    fields: [
      { key: 'speed', label: 'Move Speed', type: 'number', min: 10, max: 500, step: 10 },
      {
        key: 'direction',
        label: 'Facing Direction',
        type: 'select',
        options: [
          { label: 'Down', value: 'down' },
          { label: 'Up', value: 'up' },
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
    ],
  },
  PlayerControl: {
    label: 'Player Control',
    singleton: true,
    defaultProps: {
      isMovementLocked: false,
    },
    fields: [
      { key: 'isMovementLocked', label: 'Lock Movement Input', type: 'boolean' },
    ],
  },
  CharacterAnimation: {
    label: 'Character Animation',
    singleton: true,
    defaultProps: {
      characterKey: 'player',
      direction: 'down',
      movementType: 'walk',
    },
    fields: [
      { key: 'characterKey', label: 'Character Key', type: 'string', placeholder: 'e.g. player' },
      {
        key: 'direction',
        label: 'Default Direction',
        type: 'select',
        options: [
          { label: 'Down', value: 'down' },
          { label: 'Up', value: 'up' },
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
      {
        key: 'movementType',
        label: 'Default Movement',
        type: 'select',
        options: [
          { label: 'Walk', value: 'walk' },
          { label: 'Run', value: 'run' },
        ],
      },
    ],
  },
  Interactable: {
    label: 'Interactable',
    singleton: true,
    defaultProps: {
      type: 'on_interact',
      message: '',
      eventKey: '',
      targetMap: '',
      targetX: 0,
      targetY: 0,
    },
    fields: [
      {
        key: 'type',
        label: 'Trigger Type',
        type: 'select',
        options: [
          { label: 'On Interact (Action Button)', value: 'on_interact' },
          { label: 'On Step (Touch / Walk Over)', value: 'on_step' },
        ],
      },
      { key: 'message', label: 'Dialogue Message', type: 'textarea', placeholder: 'Enter dialogue message or description...' },
      { key: 'eventKey', label: 'Custom Event Key', type: 'string', placeholder: 'e.g. OPEN_CHEST_01' },
      { key: 'targetMap', label: 'Warp Destination Map', type: 'string', placeholder: 'e.g. city.json' },
      { key: 'targetX', label: 'Warp Target Tile X', type: 'number', step: 1 },
      { key: 'targetY', label: 'Warp Target Tile Y', type: 'number', step: 1 },
    ],
  },
  AIWander: {
    label: 'AI Wander',
    singleton: true,
    defaultProps: {
      radius: 3,
      interval: 4000,
      speed: 60,
    },
    fields: [
      { key: 'radius', label: 'Wander Radius (tiles)', type: 'number', min: 1, max: 20, step: 1 },
      { key: 'interval', label: 'Wander Interval (ms)', type: 'number', min: 500, max: 30000, step: 500 },
      { key: 'speed', label: 'Wander Speed', type: 'number', min: 10, max: 200, step: 10 },
    ],
  },
  Tag: {
    label: 'Tag',
    singleton: false,
    defaultProps: {
      tag: 'npc',
    },
    fields: [
      { key: 'tag', label: 'Tag Name', type: 'string', placeholder: 'e.g. npc, chest, warp' },
    ],
  },
}

export interface PresetPrefab {
  name: string
  components: Partial<Record<ComponentType, Record<string, any>>>
}

export const PRESET_PREFABS: PresetPrefab[] = [
  {
    name: 'NPC',
    components: {
      Transform: { x: 0, y: 0, depth: 10 },
      SpriteView: { texture: 'player-walk', frame: 0, originX: 0.5, originY: 1.0, visible: true, alpha: 1.0, flipX: false },
      Collider: { width: 16, height: 8, offsetX: 0, offsetY: 0, isSolid: true },
      GridMovement: { speed: 80, direction: 'down' },
      CharacterAnimation: { characterKey: 'player', direction: 'down', movementType: 'walk' },
      Interactable: { type: 'on_interact', message: 'Hello traveler!', eventKey: '' },
      AIWander: { radius: 2, interval: 4000, speed: 60 },
      Tag: { tag: 'npc' },
    },
  },
  {
    name: 'Warp Trigger',
    components: {
      Transform: { x: 0, y: 0, depth: 5 },
      Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: false },
      Interactable: { type: 'on_step', message: '', eventKey: 'WARP', targetMap: '', targetX: 0, targetY: 0 },
      Tag: { tag: 'warp' },
    },
  },
  {
    name: 'Sign / Inspectable',
    components: {
      Transform: { x: 0, y: 0, depth: 10 },
      Collider: { width: 16, height: 16, offsetX: 0, offsetY: 0, isSolid: true },
      Interactable: { type: 'on_interact', message: 'The ancient sign is faded...', eventKey: '' },
      Tag: { tag: 'sign' },
    },
  },
  {
    name: 'Treasure Chest',
    components: {
      Transform: { x: 0, y: 0, depth: 10 },
      Collider: { width: 16, height: 16, offsetX: 0, offsetY: 0, isSolid: true },
      Interactable: { type: 'on_interact', message: 'You found a potion!', eventKey: 'CHEST_OPEN' },
      Tag: { tag: 'chest' },
    },
  },
]
