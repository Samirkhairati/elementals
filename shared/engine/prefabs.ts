// Ready-made entities for the editor's "add entity" menu. Everything here uses real catalog commands
// and passes validateEntity without errors (unset references such as a warp destination are warnings).
//
// Sprite asset ids used (they only render if the project provides them; otherwise the entity is
// simply invisible until the author picks a sprite): characters/player, objects/sign, objects/chest,
// objects/item-ball. The chest asset is expected to have frame 0 = closed and frame 1 = open.

import type { Command, Condition, EngineEntity, EntityComponents, EventState, StateAppearance, Prefab } from './types.ts';
import { cloneEntity, createDefaultComponent } from './components.ts';
import { createCommand } from './commands.ts';
import { commandsToGraph } from './graph.ts';
import { newId, deterministicId } from './ids.ts';
import { cloneJson } from './util.ts';

function builder(prefabId: string) {
  let n = 0;
  const idFn = () => deterministicId(`prefab/${prefabId}/${++n}`);
  const cmd = (type: string, params?: Record<string, unknown>): Command => createCommand(type, params, idFn);
  const state = (
    name: string,
    commands: Command[],
    extra: { conditions?: Condition[]; trigger?: EventState['trigger']; solid?: boolean | null; appearance?: StateAppearance } = {},
  ): EventState => ({
    id: idFn(),
    name,
    conditions: extra.conditions ?? [],
    trigger: extra.trigger ?? 'action',
    graph: commandsToGraph(commands, idFn),
    faceOnInteract: true,
    solid: extra.solid ?? null,
    appearance: extra.appearance ?? {},
  });
  return { cmd, state };
}

function buildNpc(): Prefab {
  const { cmd, state } = builder('npc');
  return {
    id: 'npc',
    name: 'NPC',
    description: 'A character who says something when spoken to. Add wandering in the Movement component.',
    icon: 'user',
    components: {
      Transform: createDefaultComponent('Transform', { depth: 20 }),
      Sprite: createDefaultComponent('Sprite', { asset: 'characters/player', facing: 'down' }),
      Collider: createDefaultComponent('Collider'),
      Movement: createDefaultComponent('Movement', { controller: 'none', speed: 80 }),
      Event: { states: [state('State 1', [cmd('showText', { text: 'Hello traveler!' })])] },
      Tag: createDefaultComponent('Tag', { tag: 'npc' }),
    },
  };
}

function buildSign(): Prefab {
  const { cmd, state } = builder('sign');
  return {
    id: 'sign',
    name: 'Sign',
    description: 'A readable sign.',
    icon: 'signpost',
    components: {
      Transform: createDefaultComponent('Transform', { depth: 10 }),
      Sprite: createDefaultComponent('Sprite', { asset: 'objects/sign' }),
      Collider: createDefaultComponent('Collider'),
      Event: { states: [state('State 1', [cmd('showText', { text: 'The ancient sign is faded...' })])] },
      Tag: createDefaultComponent('Tag', { tag: 'sign' }),
    },
  };
}

function buildChest(): Prefab {
  const { cmd, state } = builder('chest');
  return {
    id: 'chest',
    name: 'Chest',
    description: 'A chest that can be opened once (state 2 uses self switch A).',
    icon: 'package',
    components: {
      Transform: createDefaultComponent('Transform', { depth: 10 }),
      Sprite: createDefaultComponent('Sprite', { asset: 'objects/chest', frame: 0 }),
      Collider: createDefaultComponent('Collider'),
      Event: {
        states: [
          state('Closed', [cmd('showText', { text: 'You found a potion!' }), cmd('setSelfSwitch', { key: 'A', value: true })]),
          state('Open', [cmd('showText', { text: 'The chest is empty.' })], {
            conditions: [{ kind: 'selfSwitch', key: 'A', value: true }],
            appearance: { frame: 1 },
          }),
        ],
      },
      Tag: createDefaultComponent('Tag', { tag: 'chest' }),
    },
  };
}

function buildDoor(): Prefab {
  const { cmd, state } = builder('door');
  return {
    id: 'door',
    name: 'Door / Warp',
    description: 'Walk onto it to be taken to another map. Pick the destination in the warp command.',
    icon: 'door-open',
    components: {
      Transform: createDefaultComponent('Transform', { depth: 5 }),
      Collider: createDefaultComponent('Collider', { isSolid: false }),
      Event: { states: [state('State 1', [cmd('warp')], { trigger: 'playerTouch' })] },
      Tag: createDefaultComponent('Tag', { tag: 'warp' }),
    },
  };
}

function buildTrigger(): Prefab {
  const { state } = builder('trigger');
  return {
    id: 'trigger',
    name: 'Trigger Zone',
    description: 'An invisible, non-solid area that runs commands when the player walks into it.',
    icon: 'square-dashed',
    components: {
      Transform: createDefaultComponent('Transform', { depth: 5 }),
      Collider: createDefaultComponent('Collider', { isSolid: false }),
      Event: { states: [state('State 1', [], { trigger: 'playerTouch' })] },
      Tag: createDefaultComponent('Tag', { tag: 'trigger' }),
    },
  };
}

function buildItemBall(): Prefab {
  const { cmd, state } = builder('item-ball');
  return {
    id: 'item-ball',
    name: 'Item Ball',
    description: 'An item lying on the ground; picking it up hides it for good (self switch A).',
    icon: 'circle-dot',
    components: {
      Transform: createDefaultComponent('Transform', { depth: 10 }),
      Sprite: createDefaultComponent('Sprite', { asset: 'objects/item-ball' }),
      Collider: createDefaultComponent('Collider'),
      Event: {
        states: [
          state('Pick up', [
            cmd('giveItem', { item: 'potion', qty: 1 }),
            cmd('showText', { text: 'You found a Potion!' }),
            cmd('setSelfSwitch', { key: 'A', value: true }),
          ]),
          state('Taken', [], {
            conditions: [{ kind: 'selfSwitch', key: 'A', value: true }],
            solid: false,
            appearance: { visible: false },
          }),
        ],
      },
      Tag: createDefaultComponent('Tag', { tag: 'item' }),
    },
  };
}

function buildTrainer(): Prefab {
  const { cmd, state } = builder('trainer');
  return {
    id: 'trainer',
    name: 'Trainer',
    description: 'A trainer who challenges the player (battles are a placeholder until the battle system exists).',
    icon: 'swords',
    components: {
      Transform: createDefaultComponent('Transform', { depth: 20 }),
      Sprite: createDefaultComponent('Sprite', { asset: 'characters/player', facing: 'down' }),
      Collider: createDefaultComponent('Collider'),
      Movement: createDefaultComponent('Movement', { controller: 'none', speed: 80 }),
      Event: {
        states: [
          state('Challenge', [
            cmd('showText', { text: 'Let\'s battle!' }),
            cmd('startBattle', { kind: 'trainer', id: 'trainer-1' }),
            cmd('setSelfSwitch', { key: 'A', value: true }),
          ]),
          state('Defeated', [cmd('showText', { text: 'You beat me fair and square.' })], {
            conditions: [{ kind: 'selfSwitch', key: 'A', value: true }],
          }),
        ],
      },
      Tag: createDefaultComponent('Tag', { tag: 'trainer' }),
    },
  };
}

export const PREFABS: Prefab[] = [buildNpc(), buildSign(), buildChest(), buildDoor(), buildTrigger(), buildItemBall(), buildTrainer()];

export function getPrefab(id: string): Prefab | undefined {
  return PREFABS.find((p) => p.id === id);
}

export interface InstantiateOptions {
  /** Anchor position in pixels (see TransformProps). */
  x: number;
  y: number;
  name?: string;
  folder?: string | null;
  /** Entity id; a fresh one when omitted. */
  id?: string;
}

/** Builds an entity from a prefab: deep copy, fresh ids for the entity, event states and commands, Transform set. */
export function instantiatePrefab(prefab: Prefab, options: InstantiateOptions): EngineEntity {
  const entity = cloneEntity(
    {
      id: options.id ?? newId(),
      name: options.name ?? prefab.name,
      x: options.x,
      y: options.y,
      visible: true,
      folder: options.folder ?? null,
      components: cloneJson(prefab.components) as EntityComponents,
    } satisfies EngineEntity,
    true,
  );
  if (options.id) entity.id = options.id;
  const transform = entity.components.Transform ?? createDefaultComponent('Transform');
  entity.components.Transform = { ...transform, x: options.x, y: options.y };
  return entity;
}
