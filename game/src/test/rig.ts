import { commandsToGraph, createCommand, createDefaultComponent, tileToAnchor, type Command, type CommonEvent, type EngineEntity, type EventState, type Facing } from "@shared/engine/index.ts";
import { World } from "@/ecs/World";
import type { Entity } from "@/ecs/Entity";
import type { ExpandContext } from "@/ecs/expand";
import { hydrateMapEntities } from "@/ecs/spawner";
import { gameState } from "@/core/GameState";
import { EventRuntime } from "@/events/EventRuntime";
import type { ChoicesRequest, EventUI, MapService, WarpRequest } from "@/events/types";
import { testSprites } from "./helpers";

export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Scripted UI: text waits for `dismiss()` unless `autoDismiss`; choices wait for `answer(i)` or use `choiceAnswers`. */
export class FakeUI implements EventUI {
  texts: { speaker: string; text: string }[] = [];
  choices: ChoicesRequest[] = [];
  fades: { mode: string; ms: number }[] = [];
  shakes: { power: number; ms: number }[] = [];
  autoDismiss = false;
  choiceAnswers: number[] = [];
  private textWaiters: Array<() => void> = [];
  private choiceWaiters: Array<(i: number) => void> = [];

  showText(request: { speaker: string; text: string }, signal: AbortSignal): Promise<void> {
    this.texts.push(request);
    if (this.autoDismiss) return Promise.resolve();
    return new Promise((resolve) => {
      this.textWaiters.push(resolve);
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }

  showChoices(request: ChoicesRequest, signal: AbortSignal): Promise<number> {
    this.choices.push(request);
    if (this.choiceAnswers.length > 0) return Promise.resolve(this.choiceAnswers.shift() as number);
    return new Promise((resolve) => {
      this.choiceWaiters.push(resolve);
      signal.addEventListener("abort", () => resolve(-1), { once: true });
    });
  }

  fadeScreen(mode: "in" | "out", ms: number): Promise<void> {
    this.fades.push({ mode, ms });
    return Promise.resolve();
  }

  shakeScreen(power: number, ms: number): Promise<void> {
    this.shakes.push({ power, ms });
    return Promise.resolve();
  }

  get waitingText(): boolean {
    return this.textWaiters.length > 0;
  }

  get waitingChoice(): boolean {
    return this.choiceWaiters.length > 0;
  }

  dismiss(): void {
    this.textWaiters.shift()?.();
  }

  answer(index: number): void {
    this.choiceWaiters.shift()?.(index);
  }
}

export class FakeMaps implements MapService {
  known = new Set(["city", "market", "home"]);
  warps: WarpRequest[] = [];
  onWarp?: (request: WarpRequest) => void;
  hasMap(id: string): boolean {
    return this.known.has(id);
  }
  warp(request: WarpRequest): Promise<void> {
    this.warps.push(request);
    this.onWarp?.(request);
    return Promise.resolve();
  }
}

export const TEST_DB = {
  switches: [
    { id: "s1", name: "S1" },
    { id: "s2", name: "S2" },
    { id: "intro_done", name: "Intro" },
  ],
  variables: [
    { id: "v1", name: "V1", initial: 0 },
    { id: "v2", name: "V2", initial: 5 },
    { id: "v3", name: "V3", initial: 0 },
  ],
  stages: [
    {
      id: "cat",
      name: "Lost cat",
      values: [
        { id: "none", name: "Not started" },
        { id: "accepted", name: "Accepted" },
        { id: "found", name: "Found" },
        { id: "done", name: "Done" },
      ],
      initial: "none",
    },
  ],
};

let idCounter = 0;
export const cmd = (type: string, params: Record<string, unknown> = {}, branches?: Record<string, Command[]>): Command => {
  const c = createCommand(type, params, () => `c${++idCounter}`);
  if (branches) c.branches = branches;
  return c;
};

export const state = (commands: Command[], extra: Partial<EventState> = {}): EventState => ({
  id: `p${++idCounter}`,
  name: "state",
  conditions: [],
  trigger: "action",
  graph: commandsToGraph(commands, () => "start", { layout: false }),
  faceOnInteract: true,
  solid: null,
  appearance: {},
  ...extra,
});

export interface EntityOptions {
  id?: string;
  col?: number;
  row?: number;
  sprite?: Record<string, unknown> | false;
  collider?: Record<string, unknown> | false;
  movement?: Record<string, unknown>;
  states?: EventState[];
  tag?: string;
}

export function makeEntityDef(o: EntityOptions = {}): EngineEntity {
  const id = o.id ?? `e${++idCounter}`;
  const { x, y } = tileToAnchor(o.col ?? 0, o.row ?? 0);
  const components: Record<string, unknown> = {
    Transform: createDefaultComponent("Transform", { x, y, depth: 20 }),
  };
  if (o.sprite !== false) components.Sprite = createDefaultComponent("Sprite", { asset: "characters/npc", ...(o.sprite ?? {}) });
  if (o.collider !== false) components.Collider = createDefaultComponent("Collider", o.collider ?? {});
  if (o.movement) components.Movement = createDefaultComponent("Movement", o.movement);
  if (o.states) components.Event = { states: o.states };
  if (o.tag) components.Tag = { tag: o.tag };
  return { id, name: id, x, y, components } as EngineEntity;
}

/** A World + EventRuntime with fake UI / maps and the test sprite registry. */
export function makeRig(options: { random?: () => number } = {}) {
  const world = new World();
  const sprites = testSprites();
  const ui = new FakeUI();
  const maps = new FakeMaps();
  const warnings: string[] = [];
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const expandCtx: ExpandContext = { sprites, warn: (m) => warnings.push(m) };
  const common = new Map<string, CommonEvent>();
  const runtime = new EventRuntime({
    world,
    sprites,
    ui,
    maps,
    database: TEST_DB,
    commonEvent: (id) => common.get(id),
    warn: (m) => warnings.push(m),
    emit: (event, payload) => emitted.push({ event, payload }),
    random: options.random ?? (() => 0),
  });
  runtime.mapId = "test";

  gameState.setInputLocked(false);

  const rig = {
    world,
    sprites,
    ui,
    maps,
    runtime,
    /** Common events `callCommonEvent` can reach, by id. */
    common,
    warnings,
    emitted,
    expandCtx,
    /** Creates an entity from options and selects its state. */
    add(o: EntityOptions = {}): Entity {
      const def = makeEntityDef(o);
      const { entities } = hydrateMapEntities(world, [def], expandCtx);
      runtime.states.refresh(entities[0]);
      return entities[0];
    },
    addPlayer(col = 5, row = 5, facing: Facing = "down"): Entity {
      const def = makeEntityDef({
        id: "player",
        col,
        row,
        sprite: { asset: "characters/player", facing },
        collider: { width: 16, height: 8 },
        movement: { controller: "player", speed: 200 },
        tag: "player",
      });
      const { entities } = hydrateMapEntities(world, [def], expandCtx);
      return entities[0];
    },
    /** Starts an ad-hoc event made of `commands` on a fresh invisible entity (or `on`). */
    runCommands(commands: Command[], on?: Entity) {
      const entity = on ?? rig.add({ id: `adhoc${++idCounter}`, sprite: false, collider: false, states: [state(commands)] });
      return runtime.start(entity, 0, { blocking: true });
    },
    /** Lets promises settle and advances game time by `ms` in 16 ms frames. */
    async advance(ms = 0) {
      await flush();
      let left = ms;
      while (left > 0) {
        const step = Math.min(16, left);
        runtime.update(step);
        left -= step;
        await flush();
      }
      await flush();
    },
  };
  return rig;
}

export type Rig = ReturnType<typeof makeRig>;
