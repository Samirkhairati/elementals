// Component schemas (labels, defaults, form fields), default/normalise helpers and entity cloning.

import type {
  ComparisonOp,
  ComponentPropsMap,
  ComponentSchema,
  ComponentType,
  Condition,
  EngineEntity,
  EventState,
  EventProps,
  FieldDef,
  StateAppearance,
} from './types.ts';
import { EVENT_TRIGGERS, COMPARISON_OPS, SELF_SWITCH_KEYS, isFacing } from './constants.ts';
import { cloneCommands } from './commands.ts';
import { newId } from './ids.ts';
import { cloneJson, isRecord } from './util.ts';

export const COMPONENT_TYPES = ['Transform', 'Sprite', 'Collider', 'Movement', 'Event', 'Tag'] as const satisfies readonly ComponentType[];

export function isComponentType(value: unknown): value is ComponentType {
  return typeof value === 'string' && (COMPONENT_TYPES as readonly string[]).includes(value);
}

// ── event defaults ──────────────────────────────────────────────────────────────────────────────

export function createDefaultEventState(name = 'State 1'): EventState {
  return {
    id: newId(),
    name,
    conditions: [],
    trigger: 'action',
    commands: [],
    faceOnInteract: true,
    solid: null,
    appearance: {},
  };
}

/** One `action` state with no commands. */
export function createDefaultEventProps(): EventProps {
  return { states: [createDefaultEventState()] };
}

// ── schemas ─────────────────────────────────────────────────────────────────────────────────────

export const COMPONENT_SCHEMAS: Record<ComponentType, ComponentSchema> = {
  Transform: {
    type: 'Transform',
    label: 'Transform',
    description: 'Where the entity stands on the map and what draws on top of what.',
    icon: 'move',
    accent: 'slate',
    category: 'core',
    singleton: true,
    required: true,
    defaultProps: { x: 0, y: 0, depth: 10 },
    fields: [
      { key: 'x', label: 'Position X', kind: 'number', unit: 'px', step: 16, help: 'Anchor: the bottom-centre of the entity\'s tile.' },
      { key: 'y', label: 'Position Y', kind: 'number', unit: 'px', step: 16, help: 'Anchor: the bottom edge of the entity\'s tile.' },
      { key: 'depth', label: 'Depth', kind: 'number', min: 0, max: 999, step: 1, help: 'Draw order; higher draws on top. Characters 20, objects 10, flat triggers 5.' },
    ],
  },
  Sprite: {
    type: 'Sprite',
    label: 'Sprite',
    description: 'What the entity looks like. Pick a sprite asset; characters animate automatically.',
    icon: 'image',
    accent: 'violet',
    category: 'visual',
    singleton: true,
    defaultProps: {
      asset: '',
      facing: 'down',
      animation: '',
      frame: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      flipX: false,
      tint: '',
      opacity: 1,
      visible: true,
    },
    fields: [
      { key: 'asset', label: 'Sprite asset', kind: 'sprite', help: 'Empty means no graphic.' },
      { key: 'facing', label: 'Facing', kind: 'facing', help: 'Idle direction; for characters this picks the sheet row.' },
      { key: 'animation', label: 'Animation', kind: 'text', placeholder: 'automatic', help: 'Characters: leave empty for automatic walk/idle. Objects: an animation name from the asset (loops); empty shows the static frame.' },
      { key: 'frame', label: 'Frame', kind: 'number', min: 0, step: 1, help: 'Static frame index when no animation plays.' },
      { key: 'offsetX', label: 'Offset X', kind: 'number', unit: 'px', step: 1, help: 'Shifts the graphic from the anchor.' },
      { key: 'offsetY', label: 'Offset Y', kind: 'number', unit: 'px', step: 1 },
      { key: 'scale', label: 'Scale', kind: 'number', min: 0.1, max: 8, step: 0.25 },
      { key: 'flipX', label: 'Flip horizontally', kind: 'boolean' },
      { key: 'tint', label: 'Tint', kind: 'color', help: 'Empty for no tint.' },
      { key: 'opacity', label: 'Opacity', kind: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'visible', label: 'Visible', kind: 'boolean' },
    ],
  },
  Collider: {
    type: 'Collider',
    label: 'Collider',
    description: 'The space the entity occupies, or the area an event reacts in.',
    icon: 'box-select',
    accent: 'amber',
    category: 'physics',
    singleton: true,
    defaultProps: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true },
    fields: [
      { key: 'width', label: 'Width', kind: 'number', unit: 'px', min: 1, max: 4096, step: 1 },
      { key: 'height', label: 'Height', kind: 'number', unit: 'px', min: 1, max: 4096, step: 1 },
      { key: 'offsetX', label: 'Offset X', kind: 'number', unit: 'px', step: 1, help: 'The box is bottom-centred on the anchor, then shifted.' },
      { key: 'offsetY', label: 'Offset Y', kind: 'number', unit: 'px', step: 1 },
      { key: 'isSolid', label: 'Solid', kind: 'boolean', help: 'Solid colliders block movement; non-solid ones only trigger events.' },
    ],
  },
  Movement: {
    type: 'Movement',
    label: 'Movement',
    description: 'Whether the entity moves and who drives it: nobody, the player or a wander AI.',
    icon: 'footprints',
    accent: 'emerald',
    category: 'behavior',
    singleton: true,
    defaultProps: { controller: 'none', speed: 100, canRun: true, wanderRadius: 3, wanderInterval: 4000 },
    fields: [
      {
        key: 'controller',
        label: 'Controller',
        kind: 'select',
        options: [
          { label: 'None (stands still)', value: 'none' },
          { label: 'Player (keyboard / touch)', value: 'player' },
          { label: 'Wander (random walk)', value: 'wander' },
        ],
        help: 'Who decides where this entity goes.',
      },
      { key: 'speed', label: 'Speed', kind: 'number', unit: 'px/s', min: 10, max: 500, step: 10, help: 'Walking speed.' },
      { key: 'canRun', label: 'Can run', kind: 'boolean', help: 'Allow running with the run key.', visibleWhen: { key: 'controller', in: ['player'] } },
      { key: 'wanderRadius', label: 'Wander radius', kind: 'number', unit: 'tiles', min: 1, max: 20, step: 1, help: 'How far it may roam from where it was placed.', visibleWhen: { key: 'controller', in: ['wander'] } },
      { key: 'wanderInterval', label: 'Wander interval', kind: 'number', unit: 'ms', min: 500, max: 30000, step: 500, help: 'Pause between wander steps.', visibleWhen: { key: 'controller', in: ['wander'] } },
    ],
  },
  Event: {
    type: 'Event',
    label: 'Event',
    description: 'What happens when the player talks to, touches or approaches the entity (states and commands).',
    icon: 'zap',
    accent: 'blue',
    category: 'logic',
    singleton: true,
    // `states` is created fresh by createDefaultComponent / createDefaultEventProps; this value is only a shape hint.
    defaultProps: { states: [] },
    fields: [],
  },
  Tag: {
    type: 'Tag',
    label: 'Tag',
    description: 'A free-form label for finding the entity (npc, chest, ...).',
    icon: 'tag',
    accent: 'zinc',
    category: 'core',
    singleton: true,
    defaultProps: { tag: 'entity', icon: '', color: '' },
    fields: [
      { key: 'tag', label: 'Tag', kind: 'text', placeholder: 'e.g. npc, chest, warp' },
      { key: 'icon', label: 'Icon', kind: 'text', help: 'Editor-only icon for the map marker and the entity lists.' },
      {
        key: 'color',
        label: 'Area colour',
        kind: 'select',
        help: 'Editor-only tint of the entity area on the map.',
        options: [{ label: 'White', value: '' }, ...['pink', 'peach', 'yellow', 'mint', 'sky', 'lavender'].map((v) => ({ label: v, value: v }))],
      },
    ],
  },
};

// ── normalisation ───────────────────────────────────────────────────────────────────────────────

function expandHex(v: string): string | null {
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  return null;
}

/** Coerces one value to what its field expects; returns `fallback` when it cannot. */
export function coerceFieldValue(field: FieldDef, value: unknown, fallback: unknown): unknown {
  switch (field.kind) {
    case 'number': {
      let n = Number.NaN;
      if (typeof value === 'number') n = value;
      else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      if (field.min !== undefined) n = Math.max(field.min, n);
      if (field.max !== undefined) n = Math.min(field.max, n);
      if (field.step === 1) n = Math.round(n);
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return fallback;
    case 'select':
      if (typeof value === 'string' && (!field.options || field.options.some((o) => o.value === value))) return value;
      return fallback;
    case 'facing':
      return isFacing(value) ? value : fallback;
    case 'color': {
      if (value === '') return '';
      if (typeof value === 'string') return expandHex(value) ?? fallback;
      return fallback;
    }
    default:
      return typeof value === 'string' ? value : fallback;
  }
}

function normalizeCondition(c: unknown): Condition | null {
  if (!isRecord(c)) return null;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const int = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  switch (c.kind) {
    case 'switch':
      return { kind: 'switch', id: typeof c.id === 'string' ? c.id : '', value: bool(c.value, true) };
    case 'variable':
      return {
        kind: 'variable',
        id: typeof c.id === 'string' ? c.id : '',
        op: (COMPARISON_OPS as readonly unknown[]).includes(c.op) ? (c.op as ComparisonOp) : '==',
        value: int(c.value, 0),
      };
    case 'stage':
      return {
        kind: 'stage',
        id: typeof c.id === 'string' ? c.id : '',
        op: (COMPARISON_OPS as readonly unknown[]).includes(c.op) ? (c.op as ComparisonOp) : '==',
        value: typeof c.value === 'string' ? c.value : '',
      };
    case 'selfSwitch':
      return {
        kind: 'selfSwitch',
        key: typeof c.key === 'string' && c.key.trim() !== '' ? c.key : SELF_SWITCH_KEYS[0],
        value: bool(c.value, true),
      };
    case 'hasItem':
      return { kind: 'hasItem', item: typeof c.item === 'string' ? c.item : '', qty: Math.max(1, int(c.qty, 1)) };
    default:
      return null;
  }
}

function normalizeCommandList(list: unknown): EventState['commands'] {
  if (!Array.isArray(list)) return [];
  const out: EventState['commands'] = [];
  for (const raw of list) {
    if (!isRecord(raw) || typeof raw.type !== 'string') continue;
    const cmd: EventState['commands'][number] = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
      type: raw.type,
      params: isRecord(raw.params) ? cloneJson(raw.params) : {},
    };
    if (isRecord(raw.branches)) {
      cmd.branches = {};
      for (const [k, sub] of Object.entries(raw.branches)) cmd.branches[k] = normalizeCommandList(sub);
    }
    out.push(cmd);
  }
  return out;
}

function normalizeAppearance(a: unknown): StateAppearance {
  const out: StateAppearance = {};
  if (!isRecord(a)) return out;
  if (typeof a.visible === 'boolean') out.visible = a.visible;
  if (typeof a.asset === 'string') out.asset = a.asset;
  if (typeof a.animation === 'string') out.animation = a.animation;
  if (typeof a.frame === 'number' && Number.isFinite(a.frame)) out.frame = Math.max(0, Math.round(a.frame));
  if (isFacing(a.facing)) out.facing = a.facing;
  return out;
}

export function normalizeEventState(state: unknown, index = 0): EventState {
  const p = isRecord(state) ? state : {};
  return {
    id: typeof p.id === 'string' && p.id ? p.id : newId(),
    name: typeof p.name === 'string' ? p.name : `State ${index + 1}`,
    conditions: Array.isArray(p.conditions)
      ? p.conditions.map(normalizeCondition).filter((c): c is Condition => c !== null)
      : [],
    trigger: (EVENT_TRIGGERS as readonly unknown[]).includes(p.trigger) ? (p.trigger as EventState['trigger']) : 'action',
    commands: normalizeCommandList(p.commands),
    faceOnInteract: typeof p.faceOnInteract === 'boolean' ? p.faceOnInteract : true,
    solid: typeof p.solid === 'boolean' ? p.solid : null,
    appearance: normalizeAppearance(p.appearance),
  };
}

export function normalizeEventProps(props: unknown): EventProps {
  // `pages` is the schemaVersion 2 name of `states`; still accepted so un-migrated data loads.
  const raw = isRecord(props) ? (Array.isArray(props.states) ? props.states : props.pages) : undefined;
  const states = Array.isArray(raw) ? raw : [];
  if (states.length === 0) return createDefaultEventProps();
  return { states: states.map((p, i) => normalizeEventState(p, i)) };
}

/**
 * Returns complete, well-typed props for a component from untrusted input: missing keys get defaults,
 * numbers/booleans/strings are coerced, numbers are clamped to min/max (rounded when `step` is 1),
 * enum values that are not valid are replaced by the default, and unknown keys are dropped.
 * Never throws; the input is not modified.
 */
export function normalizeProps<T extends ComponentType>(type: T, props: unknown): ComponentPropsMap[T];
export function normalizeProps(type: ComponentType, props: unknown): ComponentPropsMap[ComponentType] {
  if (type === 'Event') return normalizeEventProps(props);
  const schema = COMPONENT_SCHEMAS[type];
  const input = isRecord(props) ? props : {};
  const out: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const fallback = schema.defaultProps[field.key];
    out[field.key] = Object.hasOwn(input, field.key) ? coerceFieldValue(field, input[field.key], fallback) : fallback;
  }
  return out as unknown as ComponentPropsMap[ComponentType];
}

/** Default props for a component (a fresh object each call), merged with `overrides` and normalised. */
export function createDefaultComponent<T extends ComponentType>(type: T, overrides?: Partial<ComponentPropsMap[T]>): ComponentPropsMap[T] {
  if (type === 'Event') {
    const base = createDefaultEventProps() as unknown as Record<string, unknown>;
    return normalizeProps(type, overrides ? { ...base, ...(overrides as Record<string, unknown>) } : base);
  }
  return normalizeProps(type, { ...cloneJson(COMPONENT_SCHEMAS[type].defaultProps), ...(overrides as Record<string, unknown> | undefined) });
}

// ── entity cloning ──────────────────────────────────────────────────────────────────────────────

/** Deep copy of Event props. With `freshIds` every state and command gets a new id. */
export function cloneEventProps(event: EventProps, freshIds = false): EventProps {
  return {
    states: event.states.map((state) => ({
      ...cloneJson({ ...state, commands: [] as EventState['commands'] }),
      id: freshIds ? newId() : state.id,
      commands: cloneCommands(state.commands, freshIds),
    })),
  };
}

/** Deep copy of an entity. With `freshIds` the entity id and all event state/command ids are regenerated. */
export function cloneEntity<T extends EngineEntity>(entity: T, freshIds = false): T {
  const { components, ...rest } = entity;
  const copy = { ...cloneJson(rest), components: {} as T['components'] } as T;
  for (const [type, props] of Object.entries(components)) {
    if (type === 'Event' && isRecord(props) && Array.isArray((props as { states?: unknown }).states)) {
      (copy.components as Record<string, unknown>)[type] = cloneEventProps(props as unknown as EventProps, freshIds);
    } else {
      (copy.components as Record<string, unknown>)[type] = cloneJson(props);
    }
  }
  if (freshIds) copy.id = newId();
  return copy;
}
