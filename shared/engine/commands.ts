// Event command catalog, command-tree helpers and command validation.
// See docs/engine-design.md section 3 for the model.

import type {
  BranchDef,
  ChoiceOption,
  Command,
  CommandCategory,
  CommandDef,
  CommandIssue,
  FieldDef,
  IssueSeverity,
  SummaryContext,
  ValidationContext,
} from './types.ts';
import { COMPARISON_OPS, ROUTE_STEP_TYPES, SELF_SWITCH_KEYS, facingOptions, isFacing } from './constants.ts';
import { newId } from './ids.ts';
import { cloneJson, isRecord } from './util.ts';

// ── summary helpers ─────────────────────────────────────────────────────────────────────────────

function trunc(text: string, max = 48): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function named(lookup: ((id: string) => string | undefined) | undefined, id: string): string {
  if (!id) return '(none)';
  return `"${lookup?.(id) ?? id}"`;
}

function describeTarget(target: unknown, ctx?: SummaryContext): string {
  if (target === 'self' || target === undefined) return 'this event';
  if (target === 'player') return 'the player';
  if (isRecord(target) && typeof target.entity === 'string') return `"${ctx?.entityName?.(target.entity) ?? target.entity}"`;
  return '(invalid target)';
}

function onOff(v: unknown): string {
  return v === false ? 'OFF' : 'ON';
}

/** Human-readable one-liner for a state/conditional condition. */
export function describeCondition(c: unknown, ctx?: SummaryContext): string {
  if (!isRecord(c)) return '(invalid condition)';
  switch (c.kind) {
    case 'switch':
      return `Switch ${named(ctx?.switchName, str(c.id))} is ${onOff(c.value)}`;
    case 'variable':
      return `Variable ${named(ctx?.variableName, str(c.id))} ${str(c.op, '==')} ${num(c.value)}`;
    case 'stage':
      return `Stage ${named(ctx?.stageName, str(c.id))} ${str(c.op, '==')} ${ctx?.stageValueName?.(str(c.id), str(c.value)) ?? (str(c.value) || '(none)')}`;
    case 'selfSwitch':
      return `Self switch ${str(c.key, 'A')} is ${onOff(c.value)}`;
    case 'hasItem':
      return `Has ${num(c.qty, 1)}× ${str(c.item) || '(no item)'}`;
    default:
      return '(invalid condition)';
  }
}

function describeRoute(steps: unknown): string {
  if (!Array.isArray(steps) || steps.length === 0) return 'no steps';
  const parts = steps.map((s) => {
    if (!isRecord(s)) return '?';
    const type = str(s.type, '?');
    return s.value !== undefined && ['turn', 'wait', 'speed'].includes(type) ? `${type} ${String(s.value)}` : type;
  });
  return trunc(parts.join(', '), 40);
}

// ── field builders ──────────────────────────────────────────────────────────────────────────────

function opts(...pairs: [string, string][]): { label: string; value: string }[] {
  return pairs.map(([value, label]) => ({ label, value }));
}

const TARGET_FIELD: FieldDef = {
  key: 'target',
  label: 'Target',
  kind: 'target',
  help: 'Who this applies to: this event, the player or another entity on the map.',
};

const ANIMATION_HELP = 'Name of an animation defined by the sprite asset.';

function def(d: Omit<CommandDef, 'summarize'> & { summarize: CommandDef['summarize'] }): CommandDef {
  return d;
}

// ── the catalog ─────────────────────────────────────────────────────────────────────────────────

export const COMMAND_CATALOG: Record<string, CommandDef> = {
  // Dialogue
  showText: def({
    type: 'showText',
    label: 'Show Text',
    category: 'dialogue',
    description: 'Show a dialogue box and wait for the player to dismiss it.',
    icon: 'message-square',
    params: [
      { key: 'speaker', label: 'Speaker', kind: 'text', placeholder: 'Optional name shown above the text' },
      { key: 'text', label: 'Text', kind: 'textarea', required: true, placeholder: 'What is said...' },
    ],
    defaultParams: { speaker: '', text: '' },
    status: 'implemented',
    summarize: (p) => {
      const text = trunc(str(p.text));
      const speaker = str(p.speaker).trim();
      if (!text) return speaker ? `${speaker}: (empty)` : '(empty text)';
      return speaker ? `${speaker}: "${text}"` : `"${text}"`;
    },
  }),
  showChoices: def({
    type: 'showChoices',
    label: 'Show Choices',
    category: 'dialogue',
    description: 'Let the player pick one option; each option has its own commands.',
    icon: 'list',
    params: [
      { key: 'options', label: 'Options', kind: 'choices', required: true, help: 'Each option becomes a branch of commands.' },
      {
        key: 'cancel',
        label: 'When cancelled',
        kind: 'select',
        options: opts(['none', 'Cannot cancel'], ['last', 'Choose the last option'], ['branch', 'Run the Cancel branch']),
        help: 'What happens when the player presses the cancel key.',
      },
    ],
    defaultParams: {
      options: [
        { id: 'opt1', label: 'Yes' },
        { id: 'opt2', label: 'No' },
      ],
      cancel: 'none',
    },
    branchesFor: (p) => {
      const out: BranchDef[] = [];
      if (Array.isArray(p.options)) {
        for (const o of p.options) {
          if (isRecord(o) && typeof o.id === 'string' && o.id) out.push({ id: o.id, label: str(o.label) || o.id });
        }
      }
      if (p.cancel === 'branch') out.push({ id: 'cancel', label: 'Cancel' });
      return out;
    },
    status: 'implemented',
    summarize: (p) => {
      const labels = Array.isArray(p.options)
        ? p.options.map((o) => (isRecord(o) ? str(o.label) : '')).filter(Boolean)
        : [];
      return labels.length > 0 ? `Choices: ${trunc(labels.join(' / '), 44)}` : 'Choices: (none)';
    },
  }),

  // Flow
  conditional: def({
    type: 'conditional',
    label: 'Conditional Branch',
    category: 'flow',
    description: 'Run one list of commands if all conditions hold, another if not.',
    icon: 'git-branch',
    params: [{ key: 'conditions', label: 'Conditions', kind: 'conditions', required: true, help: 'All conditions must hold.' }],
    defaultParams: { conditions: [] },
    branches: [
      { id: 'then', label: 'Then' },
      { id: 'else', label: 'Else' },
    ],
    status: 'implemented',
    summarize: (p, ctx) => {
      const list = Array.isArray(p.conditions) ? p.conditions : [];
      if (list.length === 0) return 'If (no conditions)';
      return `If ${trunc(list.map((c) => describeCondition(c, ctx)).join(' and '), 60)}`;
    },
  }),
  branchStage: def({
    type: 'branchStage',
    label: 'Branch on Stage',
    category: 'flow',
    description: 'Follow a different path for each value of a stage (and a Default path for the others).',
    icon: 'git-fork',
    params: [
      { key: 'id', label: 'Stage', kind: 'stage', required: true },
      { key: 'cases', label: 'Values', kind: 'stageValue', stageKey: 'id', multiple: true, help: 'Each value you add gets its own path.' },
    ],
    defaultParams: { id: '', cases: [] },
    branchesFor: (p) => {
      const out: BranchDef[] = [];
      const seen = new Set<string>();
      if (Array.isArray(p.cases)) {
        for (const c of p.cases) {
          if (typeof c === 'string' && c && c !== 'default' && !seen.has(c)) {
            seen.add(c);
            out.push({ id: c, label: c });
          }
        }
      }
      out.push({ id: 'default', label: 'Default' });
      return out;
    },
    status: 'implemented',
    summarize: (p, ctx) => {
      const n = Array.isArray(p.cases) ? p.cases.length : 0;
      return `Branch on stage ${named(ctx?.stageName, str(p.id))} (${n} value${n === 1 ? '' : 's'})`;
    },
  }),
  loop: def({
    type: 'loop',
    label: 'Loop',
    category: 'flow',
    description: 'Repeat the commands inside until a Break Loop or Exit Event runs.',
    icon: 'repeat',
    params: [],
    defaultParams: {},
    branches: [{ id: 'body', label: 'Loop' }],
    status: 'implemented',
    summarize: () => 'Loop',
  }),
  breakLoop: def({
    type: 'breakLoop',
    label: 'Break Loop',
    category: 'flow',
    description: 'Leave the innermost loop.',
    icon: 'log-out',
    params: [],
    defaultParams: {},
    status: 'implemented',
    summarize: () => 'Break loop',
  }),
  exitEvent: def({
    type: 'exitEvent',
    label: 'Exit Event',
    category: 'flow',
    description: 'Stop running this event now.',
    icon: 'octagon-x',
    params: [],
    defaultParams: {},
    status: 'implemented',
    summarize: () => 'Exit event',
  }),
  wait: def({
    type: 'wait',
    label: 'Wait',
    category: 'flow',
    description: 'Pause the event for a while.',
    icon: 'timer',
    params: [{ key: 'ms', label: 'Duration', kind: 'number', unit: 'ms', min: 0, max: 60000, step: 100 }],
    defaultParams: { ms: 500 },
    status: 'implemented',
    summarize: (p) => `Wait ${num(p.ms)} ms`,
  }),
  comment: def({
    type: 'comment',
    label: 'Comment',
    category: 'flow',
    description: 'A note for yourself; does nothing in the game.',
    icon: 'message-circle-more',
    params: [{ key: 'text', label: 'Note', kind: 'textarea' }],
    defaultParams: { text: '' },
    status: 'implemented',
    summarize: (p) => `// ${trunc(str(p.text)) || '(empty)'}`,
  }),
  callCommonEvent: def({
    type: 'callCommonEvent',
    label: 'Call Common Event',
    category: 'flow',
    description: 'Run a shared event defined once for the whole game.',
    icon: 'phone-call',
    params: [{ key: 'id', label: 'Common event', kind: 'text', required: true, placeholder: 'common event id' }],
    defaultParams: { id: '' },
    status: 'planned',
    summarize: (p) => `Call common event ${str(p.id) || '(none)'}`,
  }),

  // State
  setSwitch: def({
    type: 'setSwitch',
    label: 'Set Switch',
    category: 'state',
    description: 'Turn a global switch on or off.',
    icon: 'toggle-right',
    params: [
      { key: 'id', label: 'Switch', kind: 'switch', required: true },
      { key: 'value', label: 'Value', kind: 'boolean', help: 'On when checked.' },
    ],
    defaultParams: { id: '', value: true },
    status: 'implemented',
    summarize: (p, ctx) => `Switch ${named(ctx?.switchName, str(p.id))} = ${onOff(p.value)}`,
  }),
  setVariable: def({
    type: 'setVariable',
    label: 'Set Variable',
    category: 'state',
    description: 'Change a global variable: set, add, subtract, multiply, divide or modulo.',
    icon: 'variable',
    params: [
      { key: 'id', label: 'Variable', kind: 'variable', required: true },
      {
        key: 'op',
        label: 'Operation',
        kind: 'select',
        options: opts(['set', 'Set'], ['add', 'Add'], ['sub', 'Subtract'], ['mul', 'Multiply'], ['div', 'Divide'], ['mod', 'Modulo']),
      },
      {
        key: 'operand',
        label: 'Operand',
        kind: 'select',
        options: opts(['const', 'Constant'], ['variable', 'Another variable'], ['random', 'Random number']),
      },
      { key: 'value', label: 'Value', kind: 'number', step: 1, visibleWhen: { key: 'operand', in: ['const'] } },
      { key: 'sourceId', label: 'Source variable', kind: 'variable', required: true, visibleWhen: { key: 'operand', in: ['variable'] } },
      { key: 'min', label: 'Minimum', kind: 'number', step: 1, visibleWhen: { key: 'operand', in: ['random'] } },
      { key: 'max', label: 'Maximum', kind: 'number', step: 1, visibleWhen: { key: 'operand', in: ['random'] } },
    ],
    defaultParams: { id: '', op: 'set', operand: 'const', value: 0, sourceId: '', min: 0, max: 10 },
    status: 'implemented',
    summarize: (p, ctx) => {
      const opSymbol: Record<string, string> = { set: '=', add: '+=', sub: '-=', mul: '*=', div: '/=', mod: '%=' };
      const symbol = opSymbol[str(p.op, 'set')] ?? '=';
      let rhs: string;
      if (p.operand === 'variable') rhs = `variable ${named(ctx?.variableName, str(p.sourceId))}`;
      else if (p.operand === 'random') rhs = `random ${num(p.min)}..${num(p.max, 10)}`;
      else rhs = String(num(p.value));
      return `Variable ${named(ctx?.variableName, str(p.id))} ${symbol} ${rhs}`;
    },
  }),
  setStage: def({
    type: 'setStage',
    label: 'Set Stage',
    category: 'state',
    description: 'Move a global stage (quest or story progress) to a value, or on to its next value.',
    icon: 'milestone',
    params: [
      { key: 'id', label: 'Stage', kind: 'stage', required: true },
      { key: 'mode', label: 'Change', kind: 'select', options: opts(['set', 'Set to a value'], ['advance', 'Advance to the next value']) },
      { key: 'value', label: 'Value', kind: 'stageValue', stageKey: 'id', required: true, visibleWhen: { key: 'mode', in: ['set'] } },
    ],
    defaultParams: { id: '', mode: 'set', value: '' },
    status: 'implemented',
    summarize: (p, ctx) => {
      const stage = named(ctx?.stageName, str(p.id));
      if (p.mode === 'advance') return `Stage ${stage} advances`;
      return `Stage ${stage} = ${ctx?.stageValueName?.(str(p.id), str(p.value)) ?? (str(p.value) || '(none)')}`;
    },
  }),
  setSelfSwitch: def({
    type: 'setSelfSwitch',
    label: 'Set Self Switch',
    category: 'state',
    description: 'Turn one of this event\'s own switches (A-D) on or off.',
    icon: 'toggle-left',
    params: [
      { key: 'key', label: 'Self switch', kind: 'select', options: SELF_SWITCH_KEYS.map((k) => ({ label: k, value: k })) },
      { key: 'value', label: 'Value', kind: 'boolean', help: 'On when checked.' },
    ],
    defaultParams: { key: 'A', value: true },
    status: 'implemented',
    summarize: (p) => `Self switch ${str(p.key, 'A')} = ${onOff(p.value)}`,
  }),

  // Character
  setFacing: def({
    type: 'setFacing',
    label: 'Set Facing',
    category: 'character',
    description: 'Turn a character to face a direction.',
    icon: 'compass',
    params: [TARGET_FIELD, { key: 'facing', label: 'Direction', kind: 'facing' }],
    defaultParams: { target: 'self', facing: 'down' },
    status: 'implemented',
    summarize: (p, ctx) => `Face ${describeTarget(p.target, ctx)} ${str(p.facing, 'down')}`,
  }),
  moveRoute: def({
    type: 'moveRoute',
    label: 'Move Route',
    category: 'character',
    description: 'Make a character walk a list of steps.',
    icon: 'route',
    params: [
      TARGET_FIELD,
      { key: 'steps', label: 'Steps', kind: 'route', help: 'up, down, left, right, forward, back, turn, wait, speed.' },
      { key: 'wait', label: 'Wait until finished', kind: 'boolean', help: 'The event continues after the route ends.' },
    ],
    defaultParams: { target: 'self', steps: [], wait: true },
    status: 'implemented',
    summarize: (p, ctx) => `Move ${describeTarget(p.target, ctx)}: ${describeRoute(p.steps)}`,
  }),
  setVisible: def({
    type: 'setVisible',
    label: 'Set Visible',
    category: 'character',
    description: 'Show or hide a character.',
    icon: 'eye',
    params: [TARGET_FIELD, { key: 'visible', label: 'Visible', kind: 'boolean' }],
    defaultParams: { target: 'self', visible: true },
    status: 'implemented',
    summarize: (p, ctx) => `${p.visible === false ? 'Hide' : 'Show'} ${describeTarget(p.target, ctx)}`,
  }),
  changeSprite: def({
    type: 'changeSprite',
    label: 'Change Sprite',
    category: 'character',
    description: 'Swap the graphic of a character.',
    icon: 'image',
    params: [
      TARGET_FIELD,
      { key: 'asset', label: 'Sprite', kind: 'sprite', required: true },
      { key: 'animation', label: 'Animation', kind: 'text', help: ANIMATION_HELP, placeholder: 'optional' },
    ],
    defaultParams: { target: 'self', asset: '', animation: '' },
    status: 'implemented',
    summarize: (p, ctx) => `Sprite of ${describeTarget(p.target, ctx)} = ${named(ctx?.spriteName, str(p.asset))}`,
  }),
  playAnimation: def({
    type: 'playAnimation',
    label: 'Play Animation',
    category: 'character',
    description: 'Play a named animation of a character\'s sprite.',
    icon: 'play',
    params: [
      TARGET_FIELD,
      { key: 'animation', label: 'Animation', kind: 'text', required: true, help: ANIMATION_HELP, placeholder: 'e.g. open' },
    ],
    defaultParams: { target: 'self', animation: '' },
    status: 'implemented',
    summarize: (p, ctx) => `Play "${str(p.animation) || '(none)'}" on ${describeTarget(p.target, ctx)}`,
  }),
  faceTowards: def({
    type: 'faceTowards',
    label: 'Face Towards',
    category: 'character',
    description: 'Turn a character to look at another one.',
    icon: 'locate-fixed',
    params: [
      TARGET_FIELD,
      { key: 'other', label: 'Look at', kind: 'target', help: 'The character to look at.' },
    ],
    defaultParams: { target: 'self', other: 'player' },
    status: 'implemented',
    summarize: (p, ctx) => `${describeTarget(p.target, ctx)} faces ${describeTarget(p.other, ctx)}`,
  }),

  // Map / screen
  warp: def({
    type: 'warp',
    label: 'Warp',
    category: 'map',
    description: 'Move the player to a tile on this or another map.',
    icon: 'door-open',
    params: [
      { key: 'map', label: 'Map', kind: 'map', required: true },
      { key: 'position', label: 'Tile', kind: 'position', keys: ['x', 'y'], help: 'Destination tile (column, row).' },
      { key: 'facing', label: 'Facing after', kind: 'select', options: [{ label: 'Keep current', value: '' }, ...facingOptions()] },
      { key: 'fade', label: 'Fade screen', kind: 'boolean' },
    ],
    defaultParams: { map: '', x: 0, y: 0, facing: '', fade: true },
    status: 'implemented',
    summarize: (p, ctx) => `Warp to ${named(ctx?.mapName, str(p.map))} (${num(p.x)}, ${num(p.y)})`,
  }),
  fadeScreen: def({
    type: 'fadeScreen',
    label: 'Fade Screen',
    category: 'map',
    description: 'Fade the screen to black or back in.',
    icon: 'sunset',
    params: [
      { key: 'mode', label: 'Mode', kind: 'select', options: opts(['out', 'Fade out (to black)'], ['in', 'Fade in']) },
      { key: 'ms', label: 'Duration', kind: 'number', unit: 'ms', min: 0, max: 10000, step: 50 },
    ],
    defaultParams: { mode: 'out', ms: 400 },
    status: 'implemented',
    summarize: (p) => `Fade ${p.mode === 'in' ? 'in' : 'out'} (${num(p.ms)} ms)`,
  }),
  shakeScreen: def({
    type: 'shakeScreen',
    label: 'Shake Screen',
    category: 'map',
    description: 'Shake the camera.',
    icon: 'vibrate',
    params: [
      { key: 'power', label: 'Power', kind: 'number', min: 1, max: 10, step: 1 },
      { key: 'ms', label: 'Duration', kind: 'number', unit: 'ms', min: 0, max: 10000, step: 50 },
    ],
    defaultParams: { power: 3, ms: 500 },
    status: 'implemented',
    summarize: (p) => `Shake screen (power ${num(p.power, 3)}, ${num(p.ms)} ms)`,
  }),
  tintScreen: def({
    type: 'tintScreen',
    label: 'Tint Screen',
    category: 'map',
    description: 'Colour-tint the whole screen (day/night, flashbacks).',
    icon: 'palette',
    params: [
      { key: 'color', label: 'Colour', kind: 'color' },
      { key: 'opacity', label: 'Strength', kind: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'ms', label: 'Duration', kind: 'number', unit: 'ms', min: 0, max: 10000, step: 50 },
    ],
    defaultParams: { color: '#000000', opacity: 0.5, ms: 500 },
    status: 'planned',
    summarize: (p) => `Tint screen ${str(p.color, '#000000')} (${num(p.opacity, 0.5)})`,
  }),
  setWeather: def({
    type: 'setWeather',
    label: 'Set Weather',
    category: 'map',
    description: 'Start or stop rain, snow or fog.',
    icon: 'cloud-rain',
    params: [
      { key: 'weather', label: 'Weather', kind: 'select', options: opts(['none', 'Clear'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog']) },
      { key: 'intensity', label: 'Intensity', kind: 'number', min: 0, max: 1, step: 0.1 },
    ],
    defaultParams: { weather: 'rain', intensity: 0.5 },
    status: 'planned',
    summarize: (p) => `Weather: ${str(p.weather, 'none')}`,
  }),

  // Audio
  playSound: def({
    type: 'playSound',
    label: 'Play Sound',
    category: 'audio',
    description: 'Play a short sound effect.',
    icon: 'volume-2',
    params: [
      { key: 'sound', label: 'Sound', kind: 'sound', required: true },
      { key: 'volume', label: 'Volume', kind: 'number', min: 0, max: 1, step: 0.05 },
    ],
    defaultParams: { sound: '', volume: 1 },
    status: 'planned',
    summarize: (p) => `Play sound ${str(p.sound) || '(none)'}`,
  }),
  playMusic: def({
    type: 'playMusic',
    label: 'Play Music',
    category: 'audio',
    description: 'Start a background music track.',
    icon: 'music',
    params: [
      { key: 'track', label: 'Track', kind: 'sound', required: true },
      { key: 'fadeMs', label: 'Fade in', kind: 'number', unit: 'ms', min: 0, max: 10000, step: 100 },
    ],
    defaultParams: { track: '', fadeMs: 500 },
    status: 'planned',
    summarize: (p) => `Play music ${str(p.track) || '(none)'}`,
  }),
  stopMusic: def({
    type: 'stopMusic',
    label: 'Stop Music',
    category: 'audio',
    description: 'Fade out the background music.',
    icon: 'volume-x',
    params: [{ key: 'fadeMs', label: 'Fade out', kind: 'number', unit: 'ms', min: 0, max: 10000, step: 100 }],
    defaultParams: { fadeMs: 500 },
    status: 'planned',
    summarize: (p) => `Stop music (${num(p.fadeMs)} ms)`,
  }),

  // RPG
  giveItem: def({
    type: 'giveItem',
    label: 'Give Item',
    category: 'rpg',
    description: 'Add items to the player\'s bag.',
    icon: 'package-plus',
    params: [
      { key: 'item', label: 'Item', kind: 'item', required: true },
      { key: 'qty', label: 'Quantity', kind: 'number', min: 1, max: 999, step: 1 },
    ],
    defaultParams: { item: '', qty: 1 },
    status: 'implemented',
    summarize: (p) => `Give ${num(p.qty, 1)}× ${str(p.item) || '(no item)'}`,
  }),
  removeItem: def({
    type: 'removeItem',
    label: 'Remove Item',
    category: 'rpg',
    description: 'Take items out of the player\'s bag.',
    icon: 'package-minus',
    params: [
      { key: 'item', label: 'Item', kind: 'item', required: true },
      { key: 'qty', label: 'Quantity', kind: 'number', min: 1, max: 999, step: 1 },
    ],
    defaultParams: { item: '', qty: 1 },
    status: 'implemented',
    summarize: (p) => `Remove ${num(p.qty, 1)}× ${str(p.item) || '(no item)'}`,
  }),
  givePokemon: def({
    type: 'givePokemon',
    label: 'Give Pokémon',
    category: 'rpg',
    description: 'Add a creature to the player\'s party.',
    icon: 'bug',
    params: [
      { key: 'species', label: 'Species', kind: 'text', required: true, placeholder: 'species id' },
      { key: 'level', label: 'Level', kind: 'number', min: 1, max: 100, step: 1 },
    ],
    defaultParams: { species: '', level: 5 },
    status: 'planned',
    summarize: (p) => `Give ${str(p.species) || '(no species)'} Lv.${num(p.level, 5)}`,
  }),
  healParty: def({
    type: 'healParty',
    label: 'Heal Party',
    category: 'rpg',
    description: 'Fully restore the player\'s party.',
    icon: 'heart-pulse',
    params: [],
    defaultParams: {},
    status: 'planned',
    summarize: () => 'Heal party',
  }),
  startBattle: def({
    type: 'startBattle',
    label: 'Start Battle',
    category: 'rpg',
    description: 'Begin a trainer or wild battle.',
    icon: 'swords',
    params: [
      { key: 'kind', label: 'Kind', kind: 'select', options: opts(['trainer', 'Trainer'], ['wild', 'Wild']) },
      { key: 'id', label: 'Trainer / encounter id', kind: 'text', required: true, placeholder: 'e.g. trainer-1' },
    ],
    defaultParams: { kind: 'trainer', id: '' },
    status: 'planned',
    summarize: (p) => `Battle (${p.kind === 'wild' ? 'wild' : 'trainer'}) ${str(p.id) || '(none)'}`,
  }),
  openShop: def({
    type: 'openShop',
    label: 'Open Shop',
    category: 'rpg',
    description: 'Open a shop selling the given items.',
    icon: 'store',
    params: [{ key: 'items', label: 'Items for sale', kind: 'item', multiple: true, required: true }],
    defaultParams: { items: [] },
    status: 'planned',
    summarize: (p) => `Open shop (${Array.isArray(p.items) ? p.items.length : 0} items)`,
  }),
  startQuest: def({
    type: 'startQuest',
    label: 'Start Quest',
    category: 'rpg',
    description: 'Add a quest to the journal.',
    icon: 'scroll-text',
    params: [{ key: 'id', label: 'Quest', kind: 'text', required: true, placeholder: 'quest id' }],
    defaultParams: { id: '' },
    status: 'planned',
    summarize: (p) => `Start quest ${str(p.id) || '(none)'}`,
  }),
  completeQuest: def({
    type: 'completeQuest',
    label: 'Complete Quest',
    category: 'rpg',
    description: 'Mark a quest as completed.',
    icon: 'badge-check',
    params: [{ key: 'id', label: 'Quest', kind: 'text', required: true, placeholder: 'quest id' }],
    defaultParams: { id: '' },
    status: 'planned',
    summarize: (p) => `Complete quest ${str(p.id) || '(none)'}`,
  }),

  // Advanced
  emit: def({
    type: 'emit',
    label: 'Emit Event',
    category: 'advanced',
    description: 'Fire a custom event on the game\'s event bus (for code to react to).',
    icon: 'radio',
    params: [
      { key: 'event', label: 'Event name', kind: 'text', required: true, placeholder: 'e.g. OPEN_CHEST_01' },
      { key: 'payload', label: 'Payload', kind: 'text', help: 'Optional text passed along with the event.' },
    ],
    defaultParams: { event: '', payload: '' },
    status: 'implemented',
    summarize: (p) => `Emit "${str(p.event) || '(none)'}"`,
  }),
  runScript: def({
    type: 'runScript',
    label: 'Run Script',
    category: 'advanced',
    description: 'Run a snippet of code.',
    icon: 'terminal',
    params: [{ key: 'code', label: 'Code', kind: 'textarea', required: true }],
    defaultParams: { code: '' },
    status: 'planned',
    summarize: (p) => `Script: ${trunc(str(p.code), 40) || '(empty)'}`,
  }),
};

export const COMMAND_CATEGORIES: { id: CommandCategory; label: string }[] = [
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'flow', label: 'Flow' },
  { id: 'state', label: 'State' },
  { id: 'character', label: 'Character' },
  { id: 'map', label: 'Map & Screen' },
  { id: 'audio', label: 'Audio' },
  { id: 'rpg', label: 'RPG' },
  { id: 'advanced', label: 'Advanced' },
];

/** Looks a definition up safely (`'constructor'` or other prototype names are not commands). */
export function getCommandDef(type: string): CommandDef | undefined {
  return Object.hasOwn(COMMAND_CATALOG, type) ? COMMAND_CATALOG[type] : undefined;
}

/** Catalog entries of one category in catalog order. */
export function commandsInCategory(category: CommandCategory): CommandDef[] {
  return Object.values(COMMAND_CATALOG).filter((d) => d.category === category);
}

/** Summary line for a command; unknown types are described as such instead of throwing. */
export function summarizeCommand(cmd: Command, ctx?: SummaryContext): string {
  const d = getCommandDef(cmd.type);
  if (!d) return `Unknown command "${cmd.type}"`;
  try {
    return d.summarize(isRecord(cmd.params) ? cmd.params : {}, ctx);
  } catch {
    return d.label;
  }
}

/** Branch ids/labels a command currently exposes (derived from its params for `showChoices`). */
export function getBranchDefs(cmd: Pick<Command, 'type' | 'params'>): BranchDef[] {
  const d = getCommandDef(cmd.type);
  if (!d) return [];
  const params = isRecord(cmd.params) ? cmd.params : {};
  if (d.branchesFor) return d.branchesFor(params);
  return d.branches ? d.branches.map((b) => ({ ...b })) : [];
}

/** Whether a param field applies given the command's other params (`visibleWhen`). */
export function isFieldVisible(field: FieldDef, params: Record<string, unknown>, defaults?: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  const current = params[field.visibleWhen.key] ?? defaults?.[field.visibleWhen.key];
  return (field.visibleWhen.in as unknown[]).includes(current);
}

// ── tree helpers ────────────────────────────────────────────────────────────────────────────────

/** Where a command lives in the tree. `path` is [rootIndex, branchId, index, branchId, index...]. */
export interface CommandInfo {
  command: Command;
  path: (string | number)[];
  parentId: string | null;
  branch: string | null;
  /** Index inside its own list. */
  index: number;
  /** 0 for root commands. */
  depth: number;
}

/** Insert position. For a root insert `parentId` is null. `index` is clamped into the list. */
export interface CommandLocation {
  parentId: string | null;
  /** Required when `parentId` is set. */
  branch?: string | null;
  index: number;
}

/** Fresh command with the catalog's default params (deep copied) merged with `params`. */
export function createCommand(type: string, params?: Record<string, unknown>, idFn: () => string = newId): Command {
  const d = getCommandDef(type);
  const cmd: Command = {
    id: idFn(),
    type,
    params: { ...(d ? cloneJson(d.defaultParams) : {}), ...(params ? cloneJson(params) : {}) },
  };
  const branchDefs = getBranchDefs(cmd);
  if (branchDefs.length > 0) cmd.branches = Object.fromEntries(branchDefs.map((b) => [b.id, [] as Command[]]));
  return cmd;
}

/** Deep copy. With `freshIds` every command in the subtree gets a new id (option ids stay). */
export function cloneCommands(commands: Command[], freshIds = false, idFn: () => string = newId): Command[] {
  return commands.map((c) => {
    const copy: Command = { id: freshIds ? idFn() : c.id, type: c.type, params: cloneJson(c.params) };
    if (c.branches) {
      copy.branches = {};
      for (const [k, list] of Object.entries(c.branches)) copy.branches[k] = Array.isArray(list) ? cloneCommands(list, freshIds, idFn) : [];
    }
    return copy;
  });
}

export interface WalkInfo {
  path: (string | number)[];
  parent: Command | null;
  branch: string | null;
  index: number;
  depth: number;
}

/** Depth-first, in execution order. Return `false` from the visitor to stop the walk. */
export function walkCommands(commands: Command[], visit: (cmd: Command, info: WalkInfo) => boolean | void): void {
  const walk = (list: Command[], path: (string | number)[], parent: Command | null, branch: string | null, depth: number): boolean => {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const p = [...path, i];
      if (visit(c, { path: p, parent, branch, index: i, depth }) === false) return false;
      if (c.branches) {
        for (const [bid, sub] of Object.entries(c.branches)) {
          if (!Array.isArray(sub)) continue;
          if (!walk(sub, [...p, bid], c, bid, depth + 1)) return false;
        }
      }
    }
    return true;
  };
  walk(commands, [], null, null, 0);
}

export function countCommands(commands: Command[]): number {
  let n = 0;
  walkCommands(commands, () => {
    n++;
  });
  return n;
}

export function findCommand(commands: Command[], id: string): CommandInfo | null {
  let found: CommandInfo | null = null;
  walkCommands(commands, (cmd, info) => {
    if (cmd.id !== id) return;
    found = {
      command: cmd,
      path: info.path,
      parentId: info.parent ? info.parent.id : null,
      branch: info.branch,
      index: info.index,
      depth: info.depth,
    };
    return false;
  });
  return found;
}

/** Returns a new list where the list at (parentId, branch) was replaced by fn(list); null if not found. */
function updateList(
  list: Command[],
  parentId: string | null,
  branch: string | null,
  fn: (l: Command[]) => Command[],
): Command[] | null {
  if (parentId === null) return fn(list);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.id === parentId) {
      if (branch === null) return null;
      const next = list.slice();
      next[i] = { ...c, branches: { ...(c.branches ?? {}), [branch]: fn(c.branches?.[branch] ?? []) } };
      return next;
    }
    if (c.branches) {
      for (const [bid, sub] of Object.entries(c.branches)) {
        if (!Array.isArray(sub)) continue;
        const r = updateList(sub, parentId, branch, fn);
        if (r) {
          const next = list.slice();
          next[i] = { ...c, branches: { ...c.branches, [bid]: r } };
          return next;
        }
      }
    }
  }
  return null;
}

/**
 * Inserts `cmd` and returns the new tree. If the parent does not exist, the branch is not one the
 * parent exposes, or the location is otherwise unusable, the tree is returned unchanged.
 */
export function insertCommand(commands: Command[], location: CommandLocation, cmd: Command): Command[] {
  const branch = location.parentId === null ? null : (location.branch ?? null);
  if (location.parentId !== null) {
    const parent = findCommand(commands, location.parentId);
    if (!parent || branch === null) return commands;
    const known = getBranchDefs(parent.command).some((b) => b.id === branch);
    const exists = parent.command.branches ? Object.hasOwn(parent.command.branches, branch) : false;
    if (!known && !exists) return commands;
  }
  const result = updateList(commands, location.parentId, branch, (list) => {
    const at = Math.max(0, Math.min(list.length, Math.trunc(location.index)));
    return [...list.slice(0, at), cmd, ...list.slice(at)];
  });
  return result ?? commands;
}

/** Removes the command (and its subtree). Unknown id: tree returned unchanged. */
export function removeCommand(commands: Command[], id: string): Command[] {
  const info = findCommand(commands, id);
  if (!info) return commands;
  return (
    updateList(commands, info.parentId, info.branch, (list) => list.filter((c) => c.id !== id)) ?? commands
  );
}

/**
 * Moves a command (with its subtree). `location.index` is the position in the destination list
 * AFTER the command was taken out. Moving a command into its own subtree is refused (tree unchanged).
 */
export function moveCommand(commands: Command[], id: string, location: CommandLocation): Command[] {
  const info = findCommand(commands, id);
  if (!info) return commands;
  if (location.parentId !== null) {
    if (location.parentId === id) return commands;
    if (findCommand([info.command], location.parentId)) return commands;
  }
  const without = removeCommand(commands, id);
  const moved = insertCommand(without, location, info.command);
  return moved === without ? commands : moved;
}

/** Inserts a copy (new ids for the whole subtree) right after the original. */
export function duplicateCommand(
  commands: Command[],
  id: string,
  idFn: () => string = newId,
): { tree: Command[]; newId: string | null } {
  const info = findCommand(commands, id);
  if (!info) return { tree: commands, newId: null };
  const copy = cloneCommands([info.command], true, idFn)[0];
  const tree = updateList(commands, info.parentId, info.branch, (list) => {
    const at = list.findIndex((c) => c.id === id) + 1;
    return [...list.slice(0, at), copy, ...list.slice(at)];
  });
  return { tree: tree ?? commands, newId: tree ? copy.id : null };
}

/** Replaces a command's params (and re-syncs its branches: new branch ids get an empty list, others are kept). */
export function updateCommandParams(commands: Command[], id: string, patch: Record<string, unknown>): Command[] {
  const info = findCommand(commands, id);
  if (!info) return commands;
  const params = { ...info.command.params, ...patch };
  const branchDefs = getBranchDefs({ type: info.command.type, params });
  const branches: Record<string, Command[]> = { ...(info.command.branches ?? {}) };
  for (const b of branchDefs) if (!branches[b.id]) branches[b.id] = [];
  const updated: Command = { ...info.command, params };
  if (Object.keys(branches).length > 0) updated.branches = branches;
  return (
    updateList(commands, info.parentId, info.branch, (list) => list.map((c) => (c.id === id ? updated : c))) ?? commands
  );
}

// ── validation ──────────────────────────────────────────────────────────────────────────────────

export interface ConditionIssue {
  index: number;
  severity: IssueSeverity;
  code: string;
  message: string;
}

/** Validates a list of conditions (state conditions and the `conditional` command). Never throws. */
export function validateConditions(conditions: unknown, ctx: ValidationContext = {}): ConditionIssue[] {
  const issues: ConditionIssue[] = [];
  if (!Array.isArray(conditions)) {
    return [{ index: -1, severity: 'error', code: 'bad-conditions', message: 'Conditions must be a list' }];
  }
  conditions.forEach((c, index) => {
    const add = (severity: IssueSeverity, code: string, message: string) => issues.push({ index, severity, code, message });
    if (!isRecord(c)) return add('error', 'bad-condition', 'Condition is not an object');
    switch (c.kind) {
      case 'switch':
        if (typeof c.id !== 'string' || c.id === '') add('warning', 'missing-param', 'Condition has no switch selected');
        else if (ctx.switchIds && !ctx.switchIds.includes(c.id)) add('error', 'dangling-switch', `Switch "${c.id}" does not exist`);
        if (typeof c.value !== 'boolean') add('error', 'bad-condition', 'Switch condition needs an on/off value');
        break;
      case 'variable':
        if (typeof c.id !== 'string' || c.id === '') add('warning', 'missing-param', 'Condition has no variable selected');
        else if (ctx.variableIds && !ctx.variableIds.includes(c.id)) add('error', 'dangling-variable', `Variable "${c.id}" does not exist`);
        if (!(COMPARISON_OPS as readonly unknown[]).includes(c.op)) add('error', 'bad-condition', `Unknown comparison "${String(c.op)}"`);
        if (typeof c.value !== 'number' || !Number.isFinite(c.value)) add('error', 'bad-condition', 'Variable condition needs a number');
        break;
      case 'stage':
        if (typeof c.id !== 'string' || c.id === '') add('warning', 'missing-param', 'Condition has no stage selected');
        else if (ctx.stageIds && !ctx.stageIds.includes(c.id)) add('error', 'dangling-stage', `Stage "${c.id}" does not exist`);
        if (!(COMPARISON_OPS as readonly unknown[]).includes(c.op)) add('error', 'bad-condition', `Unknown comparison "${String(c.op)}"`);
        if (typeof c.value !== 'string' || c.value === '') add('warning', 'missing-param', 'Condition has no stage value selected');
        else if (typeof c.id === 'string' && ctx.stageValues?.[c.id] && !ctx.stageValues[c.id].includes(c.value)) {
          add('error', 'dangling-stage-value', `Stage "${c.id}" has no value "${c.value}"`);
        }
        break;
      case 'selfSwitch':
        if (typeof c.key !== 'string' || c.key.trim() === '') add('error', 'bad-condition', 'Self switch needs a name');
        if (typeof c.value !== 'boolean') add('error', 'bad-condition', 'Self switch condition needs an on/off value');
        break;
      case 'hasItem':
        if (typeof c.item !== 'string' || c.item === '') add('warning', 'missing-param', 'Condition has no item selected');
        if (typeof c.qty !== 'number' || !Number.isFinite(c.qty) || c.qty < 1) add('error', 'bad-condition', 'Item condition needs a quantity of at least 1');
        break;
      default:
        add('error', 'bad-condition', `Unknown condition kind "${String(c.kind)}"`);
    }
  });
  return issues;
}

type Report = (severity: IssueSeverity, code: string, message: string) => void;

function validateTarget(value: unknown, label: string, ctx: ValidationContext, report: Report): void {
  if (value === 'self' || value === 'player') return;
  if (isRecord(value) && typeof value.entity === 'string' && value.entity !== '') {
    if (ctx.entityIds && !ctx.entityIds.includes(value.entity)) {
      report('error', 'dangling-entity', `${label}: entity "${value.entity}" does not exist`);
    }
    return;
  }
  report('error', 'bad-param', `${label}: must be "self", "player" or an entity`);
}

function validateField(field: FieldDef, params: Record<string, unknown>, ctx: ValidationContext, report: Report): void {
  if (field.kind === 'position') {
    for (const k of field.keys ?? ['x', 'y']) {
      const v = params[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) report('error', 'bad-param', `${field.label}: "${k}" must be a number`);
      else if (v < 0) report('warning', 'out-of-range', `${field.label}: "${k}" is negative`);
    }
    return;
  }

  const v = params[field.key];
  const empty = v === undefined || v === null || v === '' || (field.required && Array.isArray(v) && v.length === 0);
  if (empty) {
    if (field.required) report('warning', 'missing-param', `"${field.label}" is not set`);
    return;
  }

  const bad = (what: string) => report('error', 'bad-param', `${field.label}: ${what}`);

  if (field.multiple) {
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) bad('must be a list of text values');
    return;
  }

  switch (field.kind) {
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return bad('must be a number');
      if (field.min !== undefined && v < field.min) report('warning', 'out-of-range', `${field.label}: ${v} is below the minimum ${field.min}`);
      if (field.max !== undefined && v > field.max) report('warning', 'out-of-range', `${field.label}: ${v} is above the maximum ${field.max}`);
      return;
    case 'boolean':
      if (typeof v !== 'boolean') bad('must be on or off');
      return;
    case 'select':
      if (typeof v !== 'string' || (field.options && !field.options.some((o) => o.value === v))) bad(`"${String(v)}" is not a valid choice`);
      return;
    case 'facing':
      if (!isFacing(v)) bad(`"${String(v)}" is not a direction`);
      return;
    case 'color':
      if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) bad('must be a #rrggbb colour');
      return;
    case 'stageValue': {
      if (typeof v !== 'string') return bad('must be an id');
      const stageId = params[field.stageKey ?? 'id'];
      const known = typeof stageId === 'string' ? ctx.stageValues?.[stageId] : undefined;
      if (known && !known.includes(v)) report('error', 'dangling-stage-value', `${field.label}: stage "${String(stageId)}" has no value "${v}"`);
      return;
    }
    case 'switch':
    case 'variable':
    case 'stage':
    case 'map':
    case 'sprite': {
      if (typeof v !== 'string') return bad('must be an id');
      const lists = { switch: ctx.switchIds, variable: ctx.variableIds, stage: ctx.stageIds, map: ctx.mapIds, sprite: ctx.spriteIds };
      const list = lists[field.kind];
      if (list && !list.includes(v)) report('error', `dangling-${field.kind}`, `${field.label}: ${field.kind} "${v}" does not exist`);
      return;
    }
    case 'target':
      validateTarget(v, field.label, ctx, report);
      return;
    case 'route':
      if (!Array.isArray(v)) return bad('must be a list of steps');
      v.forEach((s, i) => {
        if (!isRecord(s) || !(ROUTE_STEP_TYPES as readonly unknown[]).includes(s.type)) {
          report('error', 'bad-param', `${field.label}: step ${i + 1} is not a valid step`);
        } else if (['wait', 'speed'].includes(s.type as string) && (typeof s.value !== 'number' || !Number.isFinite(s.value))) {
          report('error', 'bad-param', `${field.label}: step ${i + 1} (${String(s.type)}) needs a number`);
        } else if (s.type === 'turn' && !isFacing(s.value)) {
          report('error', 'bad-param', `${field.label}: step ${i + 1} (turn) needs a direction`);
        }
      });
      return;
    case 'conditions':
      for (const issue of validateConditions(v, ctx)) report(issue.severity, issue.code, `${field.label}: ${issue.message}`);
      return;
    case 'choices':
      if (!Array.isArray(v)) bad('must be a list of options');
      return;
    default:
      if (typeof v !== 'string') bad('must be text');
  }
}

/**
 * Validates one command's type and parameters (shared by command trees and event graphs). Returns
 * false when the type is unknown, in which case nothing else can be checked.
 */
export function validateCommandParams(
  cmd: { type?: unknown; params?: unknown },
  ctx: ValidationContext,
  report: (severity: IssueSeverity, code: string, message: string) => void,
): boolean {
  const d = typeof cmd.type === 'string' ? getCommandDef(cmd.type) : undefined;
  if (!d) {
    report('error', 'unknown-command', `Unknown command type "${String(cmd.type)}"`);
    return false;
  }
  const params = isRecord(cmd.params) ? cmd.params : {};
  if (!isRecord(cmd.params)) report('error', 'bad-param', 'Command params must be an object');

  for (const field of d.params) {
    if (!isFieldVisible(field, params, d.defaultParams)) continue;
    validateField(field, params, ctx, report);
  }

  if (cmd.type === 'showChoices') {
    const options = Array.isArray(params.options) ? params.options : [];
    if (options.length === 0) report('error', 'empty-choices', 'Show Choices needs at least one option');
    const optionIds = new Set<string>();
    options.forEach((o, i) => {
      const opt = o as Partial<ChoiceOption>;
      if (!isRecord(o) || typeof opt.id !== 'string' || opt.id === '') report('error', 'bad-choice', `Option ${i + 1} has no id`);
      else if (optionIds.has(opt.id)) report('error', 'bad-choice', `Option id "${opt.id}" is used more than once`);
      else optionIds.add(opt.id);
      if (isRecord(o) && (typeof opt.label !== 'string' || opt.label.trim() === '')) report('warning', 'missing-param', `Option ${i + 1} has no label`);
    });
  }

  if (cmd.type === 'conditional' && Array.isArray(params.conditions) && params.conditions.length === 0) {
    report('warning', 'missing-param', 'Conditional Branch has no conditions (it always takes the Then branch)');
  }

  if (cmd.type === 'branchStage' && typeof params.id === 'string' && Array.isArray(params.cases)) {
    const known = ctx.stageValues?.[params.id];
    if (known) {
      for (const c of params.cases) {
        if (typeof c === 'string' && !known.includes(c)) report('error', 'dangling-stage-value', `Values: stage "${params.id}" has no value "${c}"`);
      }
    }
  }
  return true;
}

/**
 * Validates a command tree. Never throws. Unset required parameters are warnings (the author has not
 * finished yet); wrong types, unknown commands, dangling references and structural problems are errors.
 */
export function validateCommands(commands: Command[], ctx: ValidationContext = {}): CommandIssue[] {
  const issues: CommandIssue[] = [];
  const seen = new Set<string>();

  const visitList = (list: unknown, path: (string | number)[], inLoop: boolean): void => {
    if (!Array.isArray(list)) return;
    list.forEach((raw, index) => {
      const here = [...path, index];
      const cmd = raw as Command;
      const id = isRecord(raw) && typeof raw.id === 'string' ? raw.id : '';
      const report: Report = (severity, code, message) => issues.push({ commandId: id, path: here, severity, message, code });

      if (!isRecord(raw)) {
        report('error', 'bad-command', 'Command is not an object');
        return;
      }
      if (!id) report('error', 'missing-id', 'Command has no id');
      else if (seen.has(id)) report('error', 'duplicate-command-id', `Command id "${id}" is used more than once`);
      else seen.add(id);

      if (!validateCommandParams(cmd, ctx, report)) return;
      const params = isRecord(cmd.params) ? cmd.params : {};

      if (cmd.type === 'breakLoop' && !inLoop) report('error', 'break-outside-loop', 'Break Loop can only be used inside a Loop');

      if (cmd.branches !== undefined) {
        if (!isRecord(cmd.branches)) {
          report('error', 'bad-branches', 'Command branches must be an object');
        } else {
          const valid = new Set(getBranchDefs({ type: cmd.type, params }).map((b) => b.id));
          for (const [bid, sub] of Object.entries(cmd.branches)) {
            if (!Array.isArray(sub)) {
              report('error', 'bad-branches', `Branch "${bid}" must be a list of commands`);
              continue;
            }
            if (!valid.has(bid)) {
              report('warning', 'orphan-branch', `Branch "${bid}" no longer exists on this command${sub.length ? ` (its ${sub.length} command(s) never run)` : ''}`);
              continue;
            }
            visitList(sub, [...here, bid], inLoop || cmd.type === 'loop');
          }
        }
      }
    });
  };

  visitList(commands, [], false);
  return issues;
}
