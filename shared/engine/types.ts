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
export const SCHEMA_VERSION = 2;

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

// ── Events (RPG-Maker style pages + a command tree that maps 1:1 onto an event graph) ───────────

export type EventTrigger =
  | 'action' // player presses the action key facing/over the event
  | 'playerTouch' // player steps onto / into it
  | 'eventTouch' // another entity touches it
  | 'autorun' // runs repeatedly, blocks the player until finished
  | 'parallel'; // runs in the background without blocking

export type ComparisonOp = '==' | '!=' | '>' | '>=' | '<' | '<=';
export type SelfSwitchKey = 'A' | 'B' | 'C' | 'D';

/** Conditions are AND-ed. A page is active when ALL its conditions hold. */
export type Condition =
  | { kind: 'switch'; id: string; value: boolean }
  | { kind: 'variable'; id: string; op: ComparisonOp; value: number }
  | { kind: 'selfSwitch'; key: SelfSwitchKey; value: boolean }
  | { kind: 'hasItem'; item: string; qty: number };

/** Where a command acts: this event's entity, the player, or another entity by its editor id. */
export type CommandTarget = 'self' | 'player' | { entity: string };

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

export interface PageAppearance {
  /** Override the Sprite while this page is active. Omitted fields keep the entity's Sprite. */
  visible?: boolean;
  asset?: string;
  animation?: string;
  frame?: number;
  facing?: Facing;
}

export interface EventPage {
  id: string;
  name: string;
  conditions: Condition[];
  trigger: EventTrigger;
  commands: Command[];
  /** Turn to face the player when triggered by `action`. Default true. */
  faceOnInteract: boolean;
  /** null = keep the Collider's isSolid. */
  solid: boolean | null;
  appearance: PageAppearance;
}

export interface EventProps {
  /** Pages are evaluated last-to-first; the LAST page whose conditions hold is the active one. */
  pages: EventPage[];
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
  /** Dotted path inside the entity, e.g. `components.Event.pages[0].commands[1]`. */
  path: string;
  severity: IssueSeverity;
  message: string;
  code: string;
  /** Set when the issue is about one command of an Event page. */
  commandId?: string;
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
}

export interface VariableDef {
  id: string;
  name: string;
  initial: number;
}

export interface GameDatabase {
  version: 1;
  switches: SwitchDef[];
  variables: VariableDef[];
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
