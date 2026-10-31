// Engine data contract shared by the editor (renderer + Electron), the game, and scripts.
//
// Rules for this folder: pure TypeScript, no DOM / Node / Phaser / React imports, only
// `import type`, no enums or parameter properties (Node strips types natively and the editor,
// game and Vite all compile it). Relative imports inside shared/ use explicit `.ts` extensions.
//
// See docs/engine-design.md for the model these types describe.

// ── Basics ──────────────────────────────────────────────────────────────────────────────────────

export type Facing = 'down' | 'up' | 'left' | 'right';

/** Component names used in maps (`entity.components[<name>]`). */
export type ComponentType = 'Transform' | 'Sprite' | 'Collider' | 'Movement' | 'Event' | 'Tag';

/** Names that existed before schemaVersion 2; accepted on load and converted by `migrateEntity`. */
export type LegacyComponentType =
  | 'SpriteView'
  | 'CharacterAnimation'
  | 'GridMovement'
  | 'FreeMovement'
  | 'PlayerControl'
  | 'AIWander'
  | 'Interactable';

/** Version written to `map.schemaVersion`. Maps without it are legacy (1). */
export const SCHEMA_VERSION = 4;

// ── Component props ─────────────────────────────────────────────────────────────────────────────
// Positions are pixels in map space. A tile is 32px. The Transform position is the entity's
// ANCHOR: the bottom-centre of the tile it stands on (x = col*32+16, y = (row+1)*32).
// Collider/Sprite offsets are measured from that anchor, +x right, +y down.

export interface TransformProps {
  x: number;
  y: number;
  /** Draw order. Higher draws on top. Characters default to 20, objects to 10, flat triggers to 5. */
  depth: number;
}

export interface SpriteProps {
  /** Sprite asset id: path under project/sprites, e.g. `characters/player`. Empty = no graphic. */
  asset: string;
  /** Initial/idle facing. For `character` assets this picks the row of the sheet. */
  facing: Facing;
  /**
   * `character` assets: '' = automatic (idle/walk/run chosen from movement + facing).
   * other assets: name of an animation from the asset (looping autoplay); '' = static `frame`.
   */
  animation: string;
  /** Static frame index when no animation plays (non-character assets). */
  frame: number;
  /** Pixel offset of the graphic from the Transform anchor. */
  offsetX: number;
  offsetY: number;
  scale: number;
  flipX: boolean;
  /** '#rrggbb' or '' for none. */
  tint: string;
  /** 0..1 */
  opacity: number;
  visible: boolean;
}

export interface ColliderProps {
  /** Box size in px; the box is bottom-centred on the anchor, then shifted by the offsets. */
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  /** Solid colliders block movement; non-solid ones only exist for event triggers. */
  isSolid: boolean;
}

export type Controller = 'none' | 'player' | 'wander';

export interface MovementProps {
  /** Who drives this entity. */
  controller: Controller;
  /** Pixels per second while walking. */
  speed: number;
  /** player controller only: allow running with the run key. */
  canRun: boolean;
  /** wander controller only: how far (tiles, from the start tile) it may roam. */
  wanderRadius: number;
  /** wander controller only: ms between wander decisions. */
  wanderInterval: number;
}

export interface TagProps {
  tag: string;
  /** Editor icon name for the entity's marker on the map and its rows in the lists ('' = guessed from the tag). */
  icon?: string;
  /** Editor-only tint of the entity's area outline on the map: a pastel id ('' = white). */
  color?: string;
}

// ── Events (RPG-Maker style states + a command tree that maps 1:1 onto an event graph) ───────────

export type EventTrigger =
  | 'action' // player presses the action key facing/over the event
  | 'playerTouch' // player steps onto / into it
  | 'eventTouch' // another entity touches it
  | 'autorun' // runs repeatedly, blocks the player until finished
  | 'parallel'; // runs in the background without blocking

export type ComparisonOp = '==' | '!=' | '>' | '>=' | '<' | '<=';
/**
 * Name of one of an event's own (local) on/off flags. 'A'-'D' are the classic self switches and the
 * editor's quick picks, but any non-empty name works (e.g. 'opened').
 */
export type SelfSwitchKey = string;

/** Conditions are AND-ed. A state is active when ALL its conditions hold. */
export type Condition =
  | { kind: 'switch'; id: string; value: boolean }
  | { kind: 'variable'; id: string; op: ComparisonOp; value: number }
  /** Compares a stage by the order of its values: `op` between the current value and `value` (a value id). */
  | { kind: 'stage'; id: string; op: ComparisonOp; value: string }
  | { kind: 'selfSwitch'; key: SelfSwitchKey; value: boolean }
  | { kind: 'hasItem'; item: string; qty: number };

/** Where a command acts: this event's entity, the player, or another entity by its editor id. */
export type CommandTarget = 'self' | 'player' | { entity: string };

/**
 * The command TREE of schemaVersion 3 and earlier (kept for migration, command templates and tests; states
 * now store a graph). Flow commands nest lists in `branches`.
 */
export interface Command {
  /** Stable id (uuid-ish) so editors can address/reorder/undo and graph views can key nodes. */
  id: string;
  /** Key of COMMAND_CATALOG. */
  type: string;
  params: Record<string, unknown>;
  /**
   * Nested command lists for flow commands, keyed by branch id from the catalog definition
   * (e.g. conditional -> 'then' | 'else', choices -> option ids + 'cancel', loop -> 'body').
   */
  branches?: Record<string, Command[]>;
}

// ── Event graphs (see docs/event-graph-spec.md) ─────────────────────────────────────────────────

/** An output of a graph node. `next` is the default; branching nodes expose `then`/`else`, one per choice... */
export interface PortDef {
  id: string;
  label: string;
}

/**
 * One step of an event graph: a command (or a structural `start` / `end` / `junction`) with a canvas
 * position and its wiring. `out` maps an output port id to the id of the node it leads to; a port with no
 * entry ends the run (like the end of a command list). At most one wire per port by construction.
 */
export interface GraphNode {
  /** Stable id. For migrated commands this IS the old Command.id. */
  id: string;
  /** Key of COMMAND_CATALOG, or 'start' | 'end' | 'junction'. */
  type: string;
  params: Record<string, unknown>;
  out: Record<string, string>;
  x: number;
  y: number;
}

/** Visual-only comment box. The game ignores it; membership is geometric. */
export interface GraphFrame {
  id: string;
  title: string;
  /** '#rrggbb' */
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EventGraph {
  nodes: GraphNode[];
  frames: GraphFrame[];
}

export interface GraphIssue {
  nodeId: string;
  /** Set when the issue is about one output port. */
  port?: string;
  severity: IssueSeverity;
  /** Stable machine-readable code, e.g. 'dangling-edge', 'cycle-without-wait'. */
  code: string;
  message: string;
}

export interface StateAppearance {
  /** Override the Sprite while this state is active. Omitted fields keep the entity's Sprite. */
  visible?: boolean;
  asset?: string;
  animation?: string;
  frame?: number;
  facing?: Facing;
}

export interface EventState {
  id: string;
  name: string;
  conditions: Condition[];
  trigger: EventTrigger;
  /** What runs when the state is triggered: a graph of nodes wired from its `start` node. */
  graph: EventGraph;
  /** Turn to face the player when triggered by `action`. Default true. */
  faceOnInteract: boolean;
  /** null = keep the Collider's isSolid. */
  solid: boolean | null;
  appearance: StateAppearance;
}

export interface EventProps {
  /** States are evaluated last-to-first; the LAST state whose conditions hold is the active one. */
  states: EventState[];
}

// ── Component schema (single source of truth for editor forms, defaults, validation) ────────────

export type FieldKind =
  | 'number'
  | 'text'
  | 'textarea'
  | 'boolean'
  | 'select'
  | 'color'
  | 'sprite' // asset picker
  | 'facing' // 4-way picker
  | 'map' // map picker
  | 'switch' // global switch picker
  | 'variable' // global variable picker
  | 'stage' // global stage picker
  | 'stageValue' // a value of the stage chosen in the param named by `stageKey`
  | 'target' // CommandTarget picker
  | 'position' // map position picker (x,y tile) — params use {x,y}
  | 'sound'
  | 'item'
  | 'route' // move-route steps editor
  | 'choices' // choice option list editor
  | 'conditions'; // list of `Condition`s (conditional command)

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { label: string; value: string }[];
  /** Only show/validate this field when another prop has one of these values. */
  visibleWhen?: { key: string; in: (string | number | boolean)[] };
  /** The field must be filled in (non-empty string / defined). Validation reports it as a warning. */
  required?: boolean;
  /**
   * Compound kinds that edit several params at once list them here (`position` -> ['x', 'y']).
   * `key` is then only an identifier for the field.
   */
  keys?: string[];
  /** The value is an array of the kind (e.g. `item` with `multiple` = a list of item ids). */
  multiple?: boolean;
  /** `stageValue` fields: the param holding the stage id whose values are offered. */
  stageKey?: string;
}

/** Props of every component type, by name. */
export type ComponentPropsMap = Required<EntityComponents>;

export interface ComponentSchema {
  type: ComponentType;
  label: string;
  /** One-line explanation shown in the "Add component" menu and inspector. */
  description: string;
  /** Short icon name from lucide-react (editor maps it to an icon). */
  icon: string;
  /** Accent colour token name used by the editor (e.g. 'blue', 'emerald'). */
  accent: string;
  category: 'core' | 'visual' | 'physics' | 'behavior' | 'logic';
  /** Only one per entity (all of them today). */
  singleton: boolean;
  /** Components that cannot be removed (Transform). */
  required?: boolean;
  defaultProps: Record<string, unknown>;
  fields: FieldDef[];
}

// ── Event commands ──────────────────────────────────────────────────────────────────────────────

export type CommandCategory =
  | 'dialogue'
  | 'flow'
  | 'state'
  | 'character'
  | 'map'
  | 'audio'
  | 'rpg'
  | 'advanced';

export interface BranchDef {
  id: string;
  label: string;
}

export interface CommandDef {
  type: string;
  label: string;
  category: CommandCategory;
  description: string;
  icon: string;
  params: FieldDef[];
  defaultParams: Record<string, unknown>;
  /**
   * Static branches (conditional: then/else, loop: body). Commands whose branches depend on params
   * (choices) return them from `branchesFor`.
   */
  branches?: BranchDef[];
  /** Branch ids derived from params (e.g. one per choice option). Overrides `branches` when set. */
  branchesFor?: (params: Record<string, unknown>) => BranchDef[];
  /**
   * 'implemented' = the game runs it. 'planned' = defined for authoring, the game logs and skips it
   * (until the matching system exists). The editor shows a badge for planned commands.
   */
  status: 'implemented' | 'planned';
  /**
   * Short, human summary of the configured command for list rows. `ctx` (optional) lets the editor
   * show names instead of ids.
   */
  summarize: (params: Record<string, unknown>, ctx?: SummaryContext) => string;
}

/** Name lookups for `CommandDef.summarize`; every function may return undefined for an unknown id. */
export interface SummaryContext {
  switchName?: (id: string) => string | undefined;
  variableName?: (id: string) => string | undefined;
  stageName?: (id: string) => string | undefined;
  /** Name of a value of a stage. */
  stageValueName?: (stageId: string, valueId: string) => string | undefined;
  mapName?: (id: string) => string | undefined;
  spriteName?: (id: string) => string | undefined;
  entityName?: (id: string) => string | undefined;
}

/** One option of a `showChoices` command (`params.options`). `id` is the branch id. */
export interface ChoiceOption {
  id: string;
  label: string;
}

export type RouteStepType = 'up' | 'down' | 'left' | 'right' | 'forward' | 'back' | 'turn' | 'wait' | 'speed';

/**
 * One step of `moveRoute.params.steps`. up/down/left/right/forward/back move one tile (forward/back
 * relative to the current facing); `turn` rotates to `value` (a Facing); `wait` waits `value` ms;
 * `speed` sets the walking speed to `value` px/s.
 */
export interface RouteStep {
  type: RouteStepType;
  value?: number | Facing;
}

// ── Validation ──────────────────────────────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning';

/** Names of things a command/entity may reference; a missing list disables that check. */
export interface ValidationContext {
  switchIds?: string[];
  variableIds?: string[];
  stageIds?: string[];
  /** Value ids of each stage, for `stageValue` fields. */
  stageValues?: Record<string, string[]>;
  mapIds?: string[];
  spriteIds?: string[];
  /** Editor ids of entities (for `{ entity: id }` targets). */
  entityIds?: string[];
}

export interface CommandIssue {
  commandId: string;
  /** Position in the tree: root index, then branch id, index, branch id, index ... e.g. [2, 'then', 0]. */
  path: (string | number)[];
  severity: IssueSeverity;
  message: string;
  /** Stable machine-readable code, e.g. 'unknown-command', 'dangling-switch'. */
  code: string;
}

export interface EntityIssue {
  entityId: string;
  /** Dotted path inside the entity, e.g. `components.Event.states[0].commands[1]`. */
  path: string;
  severity: IssueSeverity;
  message: string;
  code: string;
  /** Set when the issue is about one node of an Event state's graph. */
  nodeId?: string;
}

// ── Sprite assets ───────────────────────────────────────────────────────────────────────────────

export type SpriteKind = 'character' | 'object' | 'animated';

export interface SpriteAnimationDef {
  frames: number[];
  fps: number;
  loop: boolean;
}

/**
 * `project/sprites/<id>/sprite.json`. The asset id is the directory path under project/sprites.
 * Sheets are PNG files in the same directory, referenced by file name.
 */
export interface SpriteAssetMeta {
  version: 1;
  name: string;
  kind: SpriteKind;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  spacing: number;
  /** Pivot inside one frame (0..1). Default (0.5, 1): bottom-centre, sitting on the Transform anchor. */
  pivotX: number;
  pivotY: number;
  /**
   * character: 4-direction sheets. Rows are down, left, right, up (this order), 4 frames each.
   * `sheets` maps a movement type to a PNG file name; `idleFrame` is the frame within a row that is
   * shown when standing still (taken from the `walk` sheet).
   */
  character?: {
    sheets: { walk: string; run?: string };
    framesPerDirection: number;
    idleFrame: number;
    walkFps: number;
    runFps: number;
  };
  /** object / animated: one sheet + named animations. */
  sheet?: string;
  animations?: Record<string, SpriteAnimationDef>;
}

/** What the editor/IPC returns for an asset (meta + preview data). */
export interface SpriteAssetInfo {
  id: string;
  meta: SpriteAssetMeta;
  /** data: URLs of each sheet file by file name (editor previews only). */
  sheets: Record<string, string>;
}

// ── Global game database (project/database.json) ────────────────────────────────────────────────

export interface SwitchDef {
  id: string;
  name: string;
  /** Slash path used to group entries in the editor ("Quests/Lost cat"). */
  folder?: string;
}

export interface VariableDef {
  id: string;
  name: string;
  initial: number;
  /** Slash path used to group entries in the editor ("Quests/Lost cat"). */
  folder?: string;
}

/** One named step of a stage. */
export interface StageValueDef {
  id: string;
  name: string;
}

/**
 * Global progress through an ordered list of named values (a quest, a story act, a door that is locked
 * -> unlocked -> open). Conditions compare by the order of `values`.
 */
export interface StageDef {
  id: string;
  name: string;
  folder?: string;
  values: StageValueDef[];
  /** Id of the starting value (the first one when empty or unknown). */
  initial: string;
}

export interface GameDatabase {
  /** 2 adds `stages` and `folder`; version 1 files are accepted and upgraded on load. */
  version: 1 | 2;
  switches: SwitchDef[];
  variables: VariableDef[];
  stages: StageDef[];
}

// ── Entities and maps (editor format) ───────────────────────────────────────────────────────────

export interface EntityComponents {
  Transform?: TransformProps;
  Sprite?: SpriteProps;
  Collider?: ColliderProps;
  Movement?: MovementProps;
  Event?: EventProps;
  Tag?: TagProps;
}

export interface EngineEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  visible?: boolean;
  folder?: string | null;
  components: EntityComponents;
}

export interface Prefab {
  id: string;
  name: string;
  description: string;
  icon: string;
  components: EntityComponents;
}
