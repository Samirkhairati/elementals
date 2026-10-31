# Database & Characters — design spec (v2)

Status: **proposal**. Nothing here is implemented yet. When it is, fold the data-contract parts into
[engine-design.md](engine-design.md) and keep this file as the UX/phasing reference. As with the rest of the engine, if this
document and `shared/engine/types.ts` ever disagree, fix the types first, then this document.

## 0. Goals and non-goals

**Goals**

1. Replace the *Asset manager* page with a **Database** page: one place that browses every kind of project data, split into
   **Visual** (read-only) and **Design** (editable) tables, extensible for maps, text, Pokémon, items, moves…
2. Let the author **create a character** (anything drawn that can animate: a person, a flower, a chest, a door), **attach
   pre-existing sheets** to it, tell the editor how each sheet is cut (columns × rows), **define any number of named animations**,
   **choose the frames** of each by clicking, and say **which direction** each animation's frames are for — or that it has none.
3. Adding a new animation later (`swim`, `attack`, `fish`) needs **no code change and no new "kind"**.
4. **Animation speed is dynamic**: an event (or the movement speed itself) can change how fast an animation plays at runtime.
5. A **where-used** view for everything (character → maps/entities/events; graphic → characters; tileset → maps), and safe
   rename/delete built on it.
6. Fields are **compact and intuitive**, with an **"i" info popover** on everything that is not obvious.

**Non-goals (for now)**: 8-direction facings, per-frame durations, skeletal animation, paper-doll character creator, atlas
packing, audio, the Pokémon/items/moves tables themselves. The design leaves room for each (see §14).

### 0.1 Relationship to the event-graph work (read first)

[`event-graph-spec.md`](event-graph-spec.md) is being implemented in parallel (worktree `.claude/worktrees/event-graph`, branch
`worktree-event-graph`; so far Phase 0 only: `EventState → GameFlags`, `pages → states`, `conditions → when`, `schemaVersion 3`).
This spec **builds on it** and must not fight it. Decisions:

| Topic | Event-graph vocabulary / contract | What this spec does |
|---|---|---|
| "State" | An **event state** (was page): `when`, trigger, `appearance`, `graph` | Animation selection never uses the word *state*: it is an **animation binding** (`CharacterDef.bindings`) over an **activity** and **mode** (§5.4) |
| Appearance override | `StateAppearance` (was `PageAppearance`) on each event state, applied by `StateSelector` when the active state changes | Same field; `StateAppearance.asset` now holds a Character id. The override layer in §10.2 sits *above* it |
| Commands | A command is a `GraphNode`; handlers are `(node, rt) => NodeResult`; `Flow`/`runBranch`/`loopDepth` are gone | New/changed commands (§10.3) are plain nodes with the single `next` port; handlers return `void`; waiting uses `rt.guard` |
| Validation | `validateGraph` → `GraphIssue { nodeId, code, … }` | Character/clip checks are new issue codes in that function; `yields` becomes optionally a predicate (§10.3) |
| Runtime store | `GameFlags` (switches, variables, stages, local flags) + `FLAGS_CHANGED` | Appearance overrides get their own `AppearanceOverrides` store; `GameFlags` stays a pure flag store |
| Usage scan | `databaseUsage.ts` rewritten to read/write-scan graphs | One provider of the reference index (§11); not duplicated |
| Database | `project/database.json` v2 (switches, variables, stages, folders) + `project/common/` | Untouched. The Database page hosts a **Flags** table that uses the event work's panel/hooks as they land |
| Schema version | `SCHEMA_VERSION 2 → 3` (entities) | **No bump**: `Sprite.animSpeed` is additive with a default in `normalizeProps`. Character files carry their own `version: 2` |

**Merge hygiene** — both streams touch `shared/engine/{types,commands,migrate,index}.ts`, `game/src/events/commands/character.ts`,
`WorldEntityOps`, `databaseUsage.ts`, `DatabasePanel.tsx`. To keep conflicts mechanical: new character types, helpers, migration and
validation go in **new files** (`shared/engine/characters.ts`, `characterMigrate.ts`, `references.ts`), re-exported from `index.ts`; the
only edits to shared files are additive (`SpriteProps.animSpeed`, new `COMMAND_CATALOG` entries, new `FieldDef` kinds). **Work starts
from the event-graph branch tip once the event editor work is finished** (or from `main` once that branch is merged), never from the
current `main`, and rebases onto it before each phase is handed over.

---

## 1. What exists today (and what hurts)

| Area | Today | Problem |
|---|---|---|
| Storage | `project/sprites/<id>/sprite.json` + the sheet PNGs *inside* that folder | A sheet can't be shared by two characters or attached from elsewhere |
| Kinds | `character` \| `object` \| `animated` (`shared/engine/types.ts`, `SpriteAssetMeta`) | The kind welds sheet layout, animation set and driver together (see §2) |
| Character animations | Generated: `idle/walk/run-<facing>`; `character.sheets` is exactly `{ walk, run? }` (`shared/engine/sprites.ts`, `buildAnimationRegistrations`) | No `attack`, `swim`, … |
| Object animations | Author-named `animations`, **no directions** | A door that faces 4 ways can't exist |
| Frame size | One `frameWidth/frameHeight/margin/spacing` for the whole asset | A bigger `attack` sheet needs its own frame size |
| FPS | `walkFps`/`runFps`, or per-animation `fps`, fixed at registration (`createPlannedAnimations`) | Cannot change at runtime; movement speed and animation speed are unrelated |
| Runtime | `AnimationSystem` picks `idle|walk|run` (`game/src/ecs/systems/AnimationSystem.ts`) | Hard-coded phases |
| Events | `changeSprite {asset, animation}` and `playAnimation {animation}` (free-text animation name) | No picker, no validation, no "wait until finished", no speed |
| UI | `/assets` → `SpritesPanel` + `SpriteEditor`; `.ed-input` is `w-full` inside a `1fr` grid column | Inputs stretch to the full panel width (the "too long" problem) |
| Usage | `usage.ts` counts entities per asset id only; `databaseUsage.ts` scans switches/variables | No list of *where*, no rename-with-rewrite |
| Database | `DatabasePanel` (switches/variables) lives only inside the map editor | Not part of any browsable database |

What is already good and is **kept**: the project → `assets:sync` → game manifest pipeline, the shared frame maths
(`previewFrame`) so editor and game agree, versioned formats with `migrate`, `InfoTip` and `Field`'s `info` prop in
`editor/src/components/editor/ui/controls.tsx`, `openEventEditor`, the `databaseUsage` scanner pattern.

---

## 2. Vocabulary and the core decision

The old `kind` answered three different questions at once. v2 separates them:

| Question | v1 answer | v2 answer |
|---|---|---|
| How is the image cut into frames? | one grid per asset | **per sheet** (`SheetDef`) |
| Which frames make which animation, for which facing? | generated (`character`) or none (`object`) | **per clip** (`ClipDef`), directional or not |
| What decides which clip plays? | fixed phases for `character` | **animation bindings** (`bindings`) + explicit `playAnimation` |

So there is **one record type: `Character`** — "anything that is drawn and may animate". A flower, a chest, a door and the
player are all Characters. *Actor*, *Object* and *Animated prop* are **presets** that pre-fill the wizard (§8.3); they leave no
trace in the data except an optional `profile` (§5.6).

> **Naming.** The UI says *Character*. The persisted field on a map entity stays `Sprite.asset` (a string id), so **no map
> migration is needed**. Internally the code may keep calling the runtime piece "sprite".

Terms used below:

* **Graphic** — a raw image file in the project's graphics library (read-only, Visual).
* **Sheet** — a Graphic *as used by one Character*, plus how it is cut into frames.
* **Frame** — one cell of a sheet, numbered left→right, top→bottom (`index = row * columns + column`).
* **Clip** — a named animation: sheet + frames (per facing if directional) + fps + loop.
* **Activity** / **mode** — what the entity is doing for animation purposes: activity `idle | walk | run` (from movement), mode `normal` (later `swim`, `bike`, …). A **binding** maps `<mode>.<activity>` to a clip name.
* *Not to be confused with* an **event state** (the event-graph work's word for a page): that decides what an entity *is like and does*; an animation binding only decides *which clip plays*.
* **Facing** — `down | left | right | up` (`FACINGS`, in that row order by convention).

---

## 3. Layers (data flow)

```
Graphic (png in project/graphics)           read-only, Visual
   └─ Sheet  (image ref + frame size/margin/spacing [+ pivot])      \
        └─ Clip  (sheet + frames/facing + fps + loop + options)       } Character  (Design, editable)
             └─ Animation bindings (idle → "idle", walk → "walk", …)  /
                    │
Entity.Sprite { asset, facing, animation, animSpeed, frame, … }   ← what a map stores
                    │
Runtime appearance = base ← event-state appearance ← node override       (§10)
```

Rule of thumb: **assets don't know about entities; entities reference characters by id; characters reference graphics by id.**
Everything the editor shows under "Used by" is this chain read backwards.

---

## 4. Project layout and ids

```
project/
  graphics/                    ← NEW. Plain image library, folders allowed. Visual, read-only in the Database.
    sprites/player/walk.png
    sprites/player/run.png
    props/flower.png
  tilesets/…                   ← unchanged (Visual, read-only)
  database/
    characters/<id>.json       ← NEW home of Character records (replaces project/sprites/<id>/sprite.json)
    database.json              ← unchanged for now (switches/variables); may move here later
  maps/…                       ← unchanged
```

* **Character ids stay exactly as today** (`characters/player`, `objects/flower`) so no map, prefab or event changes. Their
  files therefore land at `project/database/characters/characters/player.json`; the folders are just organisation and carry no
  meaning. (An optional later cleanup — shorter ids — is a rename-with-rewrite, §11.4.)
* **Graphic ids** are the path under `project/graphics` including extension: `sprites/player/walk.png`.
* Id rules unchanged: `^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$` for characters (`isValidSpriteId`); graphics may also contain
  `.` before the extension.
* A Character references Graphics, never copies them. Two characters may point at the same Graphic with different cuts
  (recolours, a shared 'effects' sheet).
* `assets:sync` copies only Graphics that some Character or Tileset references, and emits `data/characters.json`
  (replacing `sprites.json`; see §12).

---

## 5. Data format — `Character` v2

### 5.1 Types (`shared/engine/types.ts`)

```ts
export type FacingMode = 'none' | 'four';          // 'eight' is reserved, see §14

export interface PivotDef { x: number; y: number } // 0..1 inside a frame; (0.5, 1) = bottom-centre

export interface SheetDef {
  /** Graphic id: path under project/graphics, e.g. "sprites/player/walk.png". */
  image: string;
  frameWidth: number;   // px
  frameHeight: number;  // px
  margin: number;       // px around the whole image
  spacing: number;      // px between frames
  /** Overrides CharacterDef.pivot for clips on this sheet (e.g. a larger attack frame). */
  pivot?: PivotDef;
}

export type PlaybackMode = 'forward' | 'reverse' | 'pingpong';

export interface ClipDef {
  /** Key in CharacterDef.sheets. */
  sheet: string;
  fps: number;                    // authored base speed, > 0
  loop: boolean;
  mode?: PlaybackMode;            // default 'forward'
  /** false: `frames` is used for every facing. true: `byFacing` is used (requires CharacterDef.facing === 'four'). */
  directional: boolean;
  frames?: number[];              // when !directional  — frame indexes into the clip's sheet
  byFacing?: Partial<Record<Facing, number[]>>;   // when directional
  /** Facing that reuses another facing's frames drawn flipped: { left: 'right' }. */
  mirror?: Partial<Record<Facing, Facing>>;
  /**
   * Optional: scale fps with the entity's movement speed. effective fps = fps × clamp(speed / reference, 0.25, 4).
   * `reference` is the speed (px/s) at which the authored fps looks right. null/absent = fixed fps.
   */
  followSpeed?: { reference: number } | null;
}

export interface CharacterDef {
  version: 2;
  name: string;
  /** Free labels for filtering in the Database ("npc", "prop", "boss"). Editor-only. */
  tags: string[];
  /** Optional contract this character claims to satisfy (§5.6). */
  profile?: string;
  facing: FacingMode;
  pivot: PivotDef;
  sheets: Record<string, SheetDef>;     // key = slug, unique inside the character
  clips: Record<string, ClipDef>;       // key = clip name, unique inside the character
  /**
   * Binding → clip name. Keys: "idle" | "walk" | "run" | "<mode>.<activity>" (e.g. "swim.walk").
   * Absent keys fall back as described in §5.4. Characters that never move may have none.
   */
  bindings: Record<string, string>;
  /** Static frame shown when no clip plays (replaces the old "object with no animations"). */
  still?: { sheet: string; frame: number };
}
```

`SpriteProps` (the `Sprite` component on a map entity) gains one field and keeps the rest:

```ts
animation: string;   // '' = automatic (animation bindings). Any clip name = play that clip (loops/ends per the clip).
animSpeed: number;   // NEW, default 1. Multiplies the clip's effective fps. 0 pauses.
```

### 5.2 Examples

**Player** — 4 facings, three clips from two sheets, walk/run follow movement speed:

```json
{
  "version": 2, "name": "Player", "tags": ["actor"], "facing": "four", "pivot": { "x": 0.5, "y": 1 },
  "sheets": {
    "walk": { "image": "sprites/player/walk.png", "frameWidth": 32, "frameHeight": 48, "margin": 0, "spacing": 0 },
    "run":  { "image": "sprites/player/run.png",  "frameWidth": 32, "frameHeight": 48, "margin": 0, "spacing": 0 }
  },
  "clips": {
    "idle": { "sheet": "walk", "fps": 1,  "loop": false, "directional": true,
              "byFacing": { "down": [0], "left": [4], "right": [8], "up": [12] } },
    "walk": { "sheet": "walk", "fps": 10, "loop": true,  "directional": true,
              "byFacing": { "down": [0,1,2,3], "left": [4,5,6,7], "right": [8,9,10,11], "up": [12,13,14,15] },
              "followSpeed": { "reference": 100 } },
    "run":  { "sheet": "run",  "fps": 15, "loop": true,  "directional": true,
              "byFacing": { "down": [0,1,2,3], "left": [4,5,6,7], "right": [8,9,10,11], "up": [12,13,14,15] },
              "followSpeed": { "reference": 150 } }
  },
  "bindings": { "idle": "idle", "walk": "walk", "run": "run" }
}
```

**Flower** — no facing, one clip, nothing bound (it just plays):

```json
{
  "version": 2, "name": "Flower", "tags": ["prop"], "facing": "none", "pivot": { "x": 0.5, "y": 1 },
  "sheets": { "sheet": { "image": "props/flower.png", "frameWidth": 32, "frameHeight": 32, "margin": 0, "spacing": 0 } },
  "clips": { "sway": { "sheet": "sheet", "fps": 4, "loop": true, "directional": false, "frames": [0,1,2,1] } },
  "bindings": {}
}
```

**Adding `swim` later** is one more sheet (or the same sheet), two clips and two bindings — no code:

```json
"clips":  { "swim": {…directional…}, "swim_idle": {…directional…} },
"bindings": { "swim.idle": "swim_idle", "swim.walk": "swim", "swim.run": "swim" }
```

**Chest** — non-directional, two still clips; opened by a `playAnimation` node or an event-state appearance:
`closed: frames [0], loop false`, `open: frames [1, 2], fps 8, loop false`.

### 5.3 Directional clips: how frames are stored

The engine stays dumb: a directional clip stores **explicit frame lists per facing** (`byFacing`). The *editor* offers the
convenience "this row is *down*, this row is *left*…" (§8.5) and expands it into those lists. Consequences:

* any sheet layout works (rows in any order, columns not contiguous, facings on different sheets' rows);
* the runtime and the preview never need to know about "rows";
* if the author later changes a sheet's grid, indexes shift — validation warns when a frame index is outside the sheet
  (`animation "walk" uses frame 15 but "walk.png" has 12 frames`).

`mirror: { left: 'right' }` means: facing `left` plays the `right` frames with `flipX`. The facing being mirrored needs no
`byFacing` entry. An authored `Sprite.flipX` is XOR-ed with the mirror flip.

A clip with `directional: true` on a character with `facing: 'none'` is a validation **error**. A `directional: false` clip on
a four-facing character is fine (e.g. `sleep`, `emote`): every facing shows the same frames.

### 5.4 Animation bindings and clip resolution

The engine computes, every frame, two things per entity: **mode** (default `normal`; later `swim`, `bike`, … set by a command
or terrain) and **activity** (`idle | walk | run`, from movement). The clip is the first existing binding in:

| activity | candidates (in order; `m` = mode, omitted when `normal`) |
|---|---|
| `run`  | `m.run`, `m.walk`, `m.idle`, `run`, `walk`, `idle` |
| `walk` | `m.walk`, `m.idle`, `walk`, `idle` |
| `idle` | `m.idle`, `idle` |

If nothing resolves, the sprite shows `still` (or frame 0) and the validator has already warned. `Sprite.animation ≠ ''`
**bypasses** this resolution entirely (explicit clip), until it is cleared or the clip ends (one-shot, §10.3).

Pure function in `shared/engine/sprites.ts`: `resolveClip(def, mode, activity): string | null` — used by game and preview.

### 5.5 Dynamic speed

Effective fps of a playing clip:

```
effectiveFps = clip.fps
             × (clip.followSpeed ? clamp(entitySpeed / clip.followSpeed.reference, 0.25, 4) : 1)
             × entity.animSpeed            // Sprite.animSpeed, changed at runtime by events
```

* `entitySpeed` is the entity's *current* movement speed in px/s **including the run multiplier**
  (`MovementSystem` uses `speed * 1.5` when running; export that as `RUN_SPEED_MULTIPLIER` in `shared/engine/constants.ts` so
  the editor's reference value and the game agree).
* Because of `followSpeed`, a `moveRoute` `speed` step — or any future "set move speed" — makes the walk cycle faster
  automatically. No extra event command is needed for the common case.
* `animSpeed` is the explicit knob (slow-mo, frozen, excited NPC) — §10.3.
* Phaser implementation: animations are still registered once at the **authored** fps; the render bridge sets
  `sprite.anims.timeScale = effectiveFps / authoredFps` each frame it changes. No re-registration.
* One shared pure function `effectiveFps(clip, entitySpeed, animSpeed)` is used by the game and by the editor preview (the
  preview has a **Speed** slider and an **Entity speed** field so you can see exactly what the game will show).

### 5.6 Profiles (optional contract, not a "kind")

A profile is a named checklist a character can claim, so the editor can validate it and so assets can be *swapped* safely
(bike/outfit/paper-doll later). Stored in code (`shared/engine/profiles.ts`), not user data, for now:

| Profile | Requires |
|---|---|
| `actor4` | `facing: four`; directional clips bound to `idle`, `walk`; `run` optional |
| `prop` | `facing: none`; at least one clip or a `still` |

A character with no `profile` is "custom" and is still fully valid. The `changeSprite` command warns (not errors) when it
swaps between characters with different profiles.

### 5.7 Validation (`validateCharacter`)

Errors block saving; warnings do not. Every message names the thing and how to fix it.

* **Errors**: bad `version`/id; empty `name`; `facing` invalid; sheet with `frameWidth/Height < 1` or `margin/spacing < 0`;
  `pivot` outside 0..1; clip with missing `sheet`; `fps ≤ 0`; `loop` not boolean; `directional` clip on `facing: none`;
  directional clip with a facing that has neither `byFacing` nor `mirror`; `frames`/`byFacing` empty or containing non-integers
  or negatives; `mirror` cycles or pointing at a facing that has no frames; `bindings` pointing at a missing clip;
  `followSpeed.reference ≤ 0`; duplicate clip/sheet keys; a sheet whose `image` is not a known Graphic.
* **Warnings**: frame index beyond the sheet's frame count; image size not an exact multiple of the cut (`130px wide does not
  divide into 4 columns of 32px`); a clip never referenced by any binding, entity or event (informational "unused"); the
  character claims a `profile` it does not satisfy; `walk` bound but no `idle`.

---

## 6. Migration v1 → v2

Deterministic, idempotent, pure (`shared/engine/migrate.ts`, same contract as the entity migration: `{ value, changed }`).
The editor migrates on load (nothing written until the author saves), `npm run assets:migrate` rewrites the files, the game
migrates defensively.

| v1 (`sprite.json`) | v2 |
|---|---|
| `kind: character`, `frameWidth/Height/margin/spacing` | `facing: four`; every referenced sheet gets those four values |
| `character.sheets.walk` / `.run` | `sheets.walk` / `sheets.run` (images moved to `project/graphics/sprites/<id>/…`) |
| `character.framesPerDirection = N`, `idleFrame = k` | `idle` clip: `fps 1, loop false`, `byFacing[f] = [row(f)·N + k]`; `walk`/`run` clips: `byFacing[f] = [row·N … row·N+N-1]` |
| `walkFps`, `runFps` | `walk.fps`, `run.fps`; `followSpeed` **absent** (keeps today's fixed-fps behaviour; new characters get it by default) |
| *(implicit)* bindings | `bindings: { idle: "idle", walk: "walk", run: "run" }` (`run` only if a run sheet exists) |
| `kind: object` / `animated`, `sheet` | `facing: none`; `sheets.sheet`; each `animations[name]` → clip `{ sheet:"sheet", directional:false, frames, fps, loop }` |
| `animations: {}` (static object) | no clips; `still: { sheet:"sheet", frame:0 }` (a map's `Sprite.frame` keeps working) |
| `pivotX/pivotY` | `pivot` |
| `name` | `name` (`tags: []`) |

Naming contract is **preserved for migrated data** so the game, tests and any saved state keep working:
texture `sprite:<id>:<sheetKey>` (sheet keys `walk`/`run`/`sheet` as above); directional clip animation
`sprite:<id>:<clip>-<facing>`; non-directional clip `sprite:<id>:<clip>` (= today's `objectAnimKey`).
Mirrored facings reuse the source facing's animation key with `flipX`.

Maps need **no** changes: `Sprite.asset`, `Sprite.animation` (`'' | 'idle' | 'walk' | 'run'` today's forced phases are simply clip
names now) and event-state `appearance.asset/animation` (`StateAppearance`) mean the same. `animSpeed` defaults to 1.

---

## 7. The Database page

### 7.1 Navigation

Sidebar item **Database** (icon `Database`) replaces **Asset Manager**; `/assets` redirects to `/database`. Deep links:
`/database?table=characters&id=characters/player&tab=used-by`. Every "Open in Database" link in the editor (Sprite inspector,
event command rows) uses this form.

### 7.2 Table registry (the extensibility point)

```ts
interface DatabaseTable {
  id: string;                 // 'characters' | 'graphics' | 'tilesets' | 'maps' | 'switches' | 'text' | 'pokemon' | …
  label: string;
  group: 'visual' | 'design' | 'world' | 'text' | 'game';
  icon: LucideIcon;
  access: 'readonly' | 'editable';
  status: 'ready' | 'planned';             // 'planned' renders disabled with a "Planned" badge
  Browser: React.ComponentType;            // left pane: list/tree + search + filters
  Detail: React.ComponentType<{ id: string }>;
  usageOf(id: string): Reference[];        // §11
  validateAll(): Issue[];                  // feeds the red/amber counters on the table row
}
```

Adding Pokémon or Items later = add one entry; the shell, search, usage panel, deep links and counters come for free.

### 7.3 Tables and access

| Group | Table | Access | Phase 1 content |
|---|---|---|---|
| **Visual** (read-only) | Graphics | readonly | folder tree of `project/graphics`, viewer, Used by |
| | Tilesets | readonly | list, image, tile size, columns×rows, tile count, Used by (maps) |
| **Design** (editable) | Characters | **editable** | everything in §8 |
| | Flags (switches, variables, stages, common events) | editable | whatever the event-graph work's Database panel exports (§0.1), hosted in the shell unchanged |
| **World** | Maps | readonly listing | name, size, entity count, tilesets & characters used, **Open in Map Editor** |
| **Text** | Dialogue / strings | planned | — |
| **Game** | Pokémon, Items, Moves, Abilities, Types, Trainers… | planned | — (a Pokémon will *reference* Characters/Graphics by id) |

**What "read-only" means for Visual tables**: you can look, zoom, search, see dimensions/size/format and *where each is
used*; you cannot change content or properties. Import is the one allowed write (it adds a file); **Rename / Move / Delete** of a
Graphic are disabled until the reference-rewrite flow (§11.4) lands, then enabled behind a confirm that lists every
reference it will rewrite or break. Tileset properties continue to be edited where they are today (map editor tileset panel).
The read-only state is visible: a lock badge on the table header with an info popover — *"Visual resources are shown exactly as
stored. To use one, attach it to a character; to change it, edit the image file."*

### 7.4 Shell layout

```
┌ Database ─────────────────────────────────────────────────────────────────────────────┐
│ 🔎 Search everything…                                              ⚠ 2 issues  ↻     │
├───────────────┬───────────────────────────┬───────────────────────────────────────────┤
│ VISUAL  🔒    │ Characters           [+ New]│ Player        ▸ actor4   Used in 14 ▾    │
│  Graphics  48 │ 🔎 filter…  ⌗ tags ▾  ◫ ▤  │ ─────────────────────────────────────────│
│  Tilesets   7 │ ▾ characters               │ [Animations] [Sheets] [Setup] [Used by]  │
│ DESIGN        │   ● Player        14       │                                           │
│ ▸Characters 9 │   ○ NPC Blue       3       │   (detail editor — §8)                    │
│  Switches &   │ ▾ objects                  │                                           │
│  Variables 12 │   ○ Chest          6       │                                           │
│ WORLD         │   ○ Flower         0 unused│                                           │
│  Maps       6 │                            │                                           │
│ TEXT  planned │                            │                                           │
│ GAME  planned │                            │                                           │
└───────────────┴───────────────────────────┴───────────────────────────────────────────┘
```

* Left rail: groups → tables with record counts and a red/amber dot when `validateAll()` has issues.
* Middle: the table's `Browser` (tree/grid/list toggle, search, tag filter, "unused" and "has problems" filters). Rows show an
  **animated thumbnail** on hover (plays the first clip), the usage count and issue dot.
* Right: `Detail`. Panes are resizable (existing `resizable` component) and remember sizes.
* Global search finds records across tables (`Player`, `chest`, `PokemonFont.png`) and jumps to them.
* A top-level **issues** popover lists every validation problem across tables; each row jumps to the field.

---

## 8. The Characters editor

### 8.1 Header (always visible)

`[thumb] Name ▸ id (copy) · profile badge · facing badge · Used in N ▾ · [Revert] [Save]`

* **Used in N ▾** opens the where-used popover (§11.3). `0` shows an amber *unused* badge.
* Save is disabled while there are errors; the tooltip says which.
* Unsaved changes mark the tab and the list row with a dot; leaving with changes prompts.

### 8.2 Tabs

1. **Animations** (default) — clip list + clip editor + live preview.
2. **Sheets** — the images this character uses and how each is cut.
3. **Setup** — name, id, tags, facing, pivot, animation bindings, still frame, profile.
4. **Used by** — the full where-used browser (also reachable from the header popover).

### 8.3 Creating a character — the wizard

`[+ New]` → a 3-step dialog; every step can be skipped back to.

1. **Start from** (presets are only generators): 
   *Person / animal* (4 facings: idle, walk, run) · *Still object* (one frame) · *Animated object* (looping strip) · *Blank*.
2. **Pick the image(s)**: *Choose from Graphics…* (browser dialog, search, preview) or *Import new image…*. For *Person*,
   pick a walk sheet and optionally a run sheet. The same image can be picked for both.
3. **Cut the sheet**: **Columns × Rows** inputs with a live grid overlay on the image (frame size is computed and shown;
   *Or set frame size in pixels* toggles it). The editor **suggests** a cut: tries common frame sizes (16/24/32/48/64) and
   column counts that divide the image exactly and pre-fills the best, with a hint if none divides cleanly.
   For presets, the clips are generated from the cut: *Person* with `N` columns and 4 rows → `idle/walk/run` with rows
   assigned down, left, right, up (editable afterwards); *Animated object* → one looping clip over all frames.

Finish → the new character opens on the **Animations** tab. Cancel creates nothing.

### 8.4 Animations tab

```
┌ Clips ───────────────┬ walk ──────────────────────────────────────────────────────────┐
│ + Add animation ▾    │ Sheet  [walk ▾]  ⓘ     Directional [on] ⓘ     Loop [on] ⓘ      │
│ ┌──────────────────┐ │ ─ Pick frames ────────────────────────────────────────────────  │
│ │▶ idle   ↻ 1 fps  │ │  ┌ sheet view (zoom, grid, row labels) ───────┐  Preview        │
│ │▶ walk ● ↻ 10 fps │ │  │ ↓down  ▣0 ▣1 ▣2 ▣3                         │  ┌────────┐     │
│ │▶ run    ↻ 15 fps │ │  │ ←left  ▣4 ▣5 ▣6 ▣7                         │  │  ◀ ▶   │     │
│ │▶ swim   ↻ 8 fps  │ │  │ →right ▣8 …                                │  └────────┘     │
│ └──────────────────┘ │  │ ↑up    ▣12…                                │  facing ◀ ↓ ▶ ↑ │
│  bound to: idle,walk │  └────────────────────────────────────────────┘  speed ──●── 1× │
│                      │ ─ Timeline (for ↓ down) ───────────────────────  entity speed 100│
│                      │  [0][1][2][3]  + drag to reorder · ✕ remove                    │
│                      │ Speed  fps [10]━━●━━  ▾ Follow movement speed ⓘ  Playback [→ ▾]│
└──────────────────────┴─────────────────────────────────────────────────────────────────┘
```

**Clip list**: each row has a playing thumbnail, name, fps, loop icon, directional icon, a dot if bound to an animation binding, a warning
dot if invalid. Drag to reorder (order is cosmetic). Context menu: Rename (with rewrite, §11.4), Duplicate, Delete (blocked or
confirmed when in use).

**Add animation ▾**: *Blank*, *From template…* (Idle · Walk · Run · Attack · Swim · Open/Close · Custom — a template only picks
a name, loop, fps and which binding to set; frames are still chosen by you), *Duplicate existing*.

### 8.5 Choosing frames (the core interaction)

*Sheet view* (extends today's `SheetViewer`): zoom, pan, pixel/grid toggle, frame numbers, row labels, the pivot dot.

* **Click** a frame → append it to the current clip (to the *current facing's* list when directional).
* **Shift+click** → append the range from the last clicked frame. **Drag a marquee** → append every frame inside, reading order.
* **Click a row header** (or the row's ⟲ icon) → append that whole row. With *Directional* on, row headers carry a facing
  picker: *"Row 2 is → left"*. **Auto-assign rows** fills down, left, right, up in order; assigning a row to a facing
  appends that row's frames (or the chosen column range) to that facing's list.
* **Same columns for all rows**: a `Columns 0–3` range control applies to every assigned row at once (the 4-frame walk cycle
  case is two clicks).
* **Mirror**: for a directional clip, each facing has a `Use ▾` select: *Own frames* | *Mirror of → right* | …; mirrored
  facings need no frames.
* **Timeline** (below): the current facing's frames as thumbnails — drag to reorder, click to select, `Delete` removes,
  `D` duplicates, buttons *Reverse* and *Ping-pong*. A **facing selector** switches which facing's timeline is shown; a dot
  marks facings with no frames yet.
* **Text mode** for power users: `0-3, 5, 3-1` (existing `parseFrameList`) per facing.
* **Preview** (right): plays the clip with the facing selector (clicking ◀▶↓↑ or the keyboard arrows), **Speed** slider (×0–×3),
  **Entity speed** number (so `followSpeed` is visible), play/pause/step. It calls the same pure functions as the game
  (`previewFrame`, `effectiveFps`) — what you see is what ships.
* The *current clip's* frames are highlighted on the sheet with their order number, so you can see overlaps between clips.

### 8.6 Sheets tab

One card per sheet: thumbnail, **Image** (picker → Graphics browser dialog, shows size `128×192 px`), key (slug), and the cut:

```
Image   sprites/player/walk.png  [Change…]          128 × 192 px
Cut     Columns [4] × Rows [4]   = 16 frames of 32 × 48 px           (✓ fits exactly)
        ▸ Advanced  Margin [0]  Spacing [0]  Pivot override [ ]
```

* The grid overlay preview is inline. Changing columns/rows recomputes frame size; changing frame size recomputes
  columns/rows. A mismatch is shown inline (`130px does not divide by 4`).
* **Used by clips**: chips of the clips that use this sheet. Deleting a sheet used by clips is blocked with that list.
* **+ Add sheet** (choose from Graphics / import).

### 8.7 Setup tab

* **Name**, **Id** (read-only here; *Rename…* opens the rewrite flow), **Tags** (chips).
* **Facing**: *None* / *Four directions*. Changing it shows what will happen (`"3 directional clips will become invalid"`).
* **Pivot**: 3×3 anchor picker (bottom-centre default) + a draggable dot on a frame preview + two small numbers in *Advanced*.
* **Animation bindings** table: rows `Idle · Walk · Run` + **+ Add binding** (`swim.walk`, …), each with a clip dropdown. Info popover
  explains the fallback chain (§5.4).
* **Still frame**: sheet + frame, shown when nothing plays.
* **Profile**: dropdown (*Custom*, *Actor (4 directions)*, *Prop*) with the checklist and live pass/fail.

### 8.8 Compact, intuitive fields

The "too long" problem is structural: `.ed-input { width: 100% }` inside a `1fr` column makes a 2-digit number as wide as a
name. Rules (implemented in `controls.tsx` + `index.css`, then used everywhere):

| Control | Width | Notes |
|---|---|---|
| Integer / small number | **72 px** (`size="sm"`), 56 px for 1–2 digit (`xs`) | unit suffix lives *inside* (`px`, `fps`, `×`); ▲▼ steppers on hover; mouse-wheel **off** unless focused |
| Decimal 0–1 (pivot, opacity) | 72 px **plus slider** | slider + number together |
| FPS / speed / scale | slider (flex) + 64 px number | one row |
| Name / id / path | fills the row | `lg` only for text |
| Select | content width, min 120 px | |
| Boolean | toggle, right-aligned | |
| Enum with 2–4 values | segmented control | e.g. Facing: None · Four |

New primitives: **`FieldRow`** puts related values on one line (`W [32] × H [48]`, `Cols [4] × Rows [4]`, `Margin [0]  Spacing [0]`),
**`GridInput`** (columns × rows with the frame-size readout), **`PivotPicker`** (3×3 + drag), **`SliderNumber`**,
**`Section`** (collapsible, shows a one-line summary when closed: *"32×48 px · margin 0 · 4×4 = 16 frames"*), and **`Advanced`**
disclosure for rarely-touched values (margin, spacing, per-sheet pivot, ping-pong). Labels sit left for ≤ 320 px-wide forms of
short labels and **above** the control for text fields. Defaults are chosen so a typical character needs **no** Advanced value.

### 8.9 Info ("i") icons

`InfoTip` already exists; the rule is: **every label whose meaning isn't obvious from its name gets one**, every icon-only button
gets a `title`, and every empty state says what to do next. Copy is ≤ 2 sentences, says *what it does* and *what you'll see in
the game*. Initial copy (Appendix A has the full list):

| Where | Text |
|---|---|
| Directional | "Turn on if this animation looks different when the character faces up, down, left or right. Leave off for things that look the same from every side, like a flower." |
| Loop | "On: the animation repeats forever. Off: it plays once and stops on its last frame." |
| FPS | "Frames per second at normal speed. Higher is faster. Events and movement speed can speed it up or slow it down while the game runs." |
| Follow movement speed | "Makes the animation play faster when the character moves faster, so feet don't slide. 'Reference speed' is the movement speed (px/s) at which this FPS looks right." |
| Mirror | "Re-use another direction's frames flipped sideways, e.g. left = right flipped. Saves drawing both." |
| Pivot | "The point of the frame that stands on the spot where the entity is placed. Bottom-centre suits characters; centre suits things that float." |
| Columns × Rows | "How many frames the image has across and down. The frame size is worked out from this." |
| Animation bindings | "Which animation plays automatically for each thing the character does. If a binding is missing, the next best one is used (run → walk → idle)." |
| Still frame | "The picture shown when no animation is playing." |
| Profile | "A checklist for characters that must behave the same way (for example, anything that can be swapped in as the player). Custom has no checklist." |

---

## 9. Visual tables (read-only)

### 9.1 Graphics

* Left: folder tree of `project/graphics` + search; right: **viewer** — zoom/pan, checkerboard, pixel grid toggle, dimensions,
  file size, last modified, path with copy button.
* **Overlay a grid**: pick a character's sheet to draw its cut over the image — a read-only way to check how it's used.
* **Used by**: characters (and which sheet/clip), listed with *Open* links; `unused` badge otherwise.
* Toolbar: *Import…*, *Reveal in Finder*. Rename/Move/Delete appear disabled with an info popover until §11.4 ships.

### 9.2 Tilesets

* Cards/list with the image, tile size, columns × rows, tile count and a **Used by** list of maps (and which layers).
* Opening one shows the image with the tile grid and index numbers. Editing stays in the map editor.

### 9.3 Maps (World)

* Read-only list: size, layers, entity count, tilesets used, characters used (aggregated from the reference index), warnings
  from `validateEditorMap`. **Open in Map Editor** selects the map. This is the first consumer proving the registry scales.

---

## 10. Runtime behaviour

### 10.1 Components

`AnimationComponent` (character phases) becomes a generic **`AnimatorComponent`**:

```ts
class AnimatorComponent {
  characterId: string;
  facing: Facing;
  mode: string;                 // 'normal' by default
  activity: 'idle' | 'walk' | 'run';     // from movement, set by AnimationSystem
  explicitClip: string | null;  // set by playAnimation / Sprite.animation ≠ ''
  oneShot: { clip: string; resolve: () => void } | null;
  animSpeed: number;            // Sprite.animSpeed, mutated by events
  entitySpeed: number;          // px/s incl. run multiplier, for followSpeed
  currentAnimKey: string;       // chosen by AnimationSystem, played by RenderBridgeSystem
  flipX: boolean;               // from mirror
}
```

`AnimationSystem` (priority 400) now: read movement → `activity`/`entitySpeed`; `explicitClip ?? resolveClip(def, mode, activity)`
→ clip → animation key (+ `flipX` for mirrored facings). `RenderBridgeSystem` plays the key and applies
`timeScale = effectiveFps(...) / authoredFps`; it listens to Phaser's `animationcomplete` to resolve `oneShot`. Entities whose
character has `facing: none` and no bindings but a `Sprite.animation` just play that clip, as `animated` assets do today.

### 10.2 Appearance layers (what is shown when a sprite "changes")

```
base      the entity's authored Sprite (saved in the map file)
 ↓
state     the active event state's `appearance` (`StateAppearance`; a pure function of the flags) — applied when the active state changes
 ↓
override  runtime node (changeSprite / playAnimation / setAnimationSpeed) — kept in `AppearanceOverrides`, see below
```

* Prefer **event-state appearance** for anything derivable from game state (chest open when switch X): it is automatically right after
  loading a save or changing map.
* `changeSprite` keeps today's meaning (lasts until the entity's active event state changes) and gains **`persist`**: *until the event state changes*
  (default) · *until map changes* · *forever* (stored in a new `AppearanceOverrides` store keyed `mapId/entityId`, saved next to the `GameFlagsSnapshot` — it is **not** put in `GameFlags`,
  which stays a pure flag store — and restored on entity spawn). The player's outfit is one `forever` override.
* A **clip swap** (same character, different clip) and a **character swap** (different character) are different commands on
  purpose: opening a chest is `playAnimation`, putting on a bike is `changeSprite`. Swapping character keeps facing, activity and
  mode; if the new character lacks the needed clip the §5.4 fallback applies and the validator has already warned.

### 10.3 Event nodes (catalog commands)

In the event-graph model a command *is* a graph node (`GraphNode { id, type, params, out, x, y }`) and handlers have the signature
`(node, rt) => NodeResult | Promise<NodeResult>`. All nodes below have the single default `next` port and return `void`; none uses `runBranch`.
The table says "command" because that is the catalog's word (`COMMAND_CATALOG`).

| Command | Params (new in **bold**) | Notes |
|---|---|---|
| `changeSprite` (label *Change Character*) | target, `asset` (**Character picker**), `animation` (**Clip picker**, optional), **`persist`** | type name kept for compatibility |
| `playAnimation` | target, `animation` (**Clip picker**), **`speed`** (× multiplier, optional), **`wait`** (wait until a non-looping clip ends), **`then`**: `auto` (return to state-driven, default) · `hold` (stay on last frame) · `loop` | the picker is filled from the target's character when it can be resolved (`self`, or an entity id); otherwise free text with validation |
| **`stopAnimation`** | target | clears `explicitClip`; back to automatic |
| **`setAnimationSpeed`** | target, `value` (×), `clip` (optional: only that clip), `mode`: `scale` (× authored) · `fps` (absolute) | sets `Sprite.animSpeed` / a per-clip fps override on the animator; `0` pauses |
| **`setMoveSpeed`** | target, `speed` (px/s) | with `followSpeed` the walk cycle follows; `moveRoute`'s existing `speed` step does the same |
| **`setMovementMode`** *(phase 5)* | target, `mode` (`normal`, `swim`, …) | selects `mode.activity` bindings |

`validateGraph` (event-graph spec §8) gains the checks below as new issue codes (`unknown-character`, `unknown-clip`, `wait-on-looping-clip`): unknown character → error; unknown clip for a resolvable target → warning; `wait` on a looping clip →
warning ("this would never finish"). `changeSprite`/`playAnimation` node summaries show names, not ids. `playAnimation` with `wait` counts
as a *yielding* node for the `cycle-without-wait` rule, so the catalog's `yields` flag must accept a predicate over `params` (`yields?: boolean | ((params) => boolean)`; a small additive change to the graph catalog).
The parameter forms gain two `FieldDef` kinds, `'character'` (replaces `'sprite'`'s picker) and `'clip'`, next to the `'stage'`/`'stageValue'` kinds the graph work adds.
The Sprite inspector (`SpriteComponentEditor`/`SpritePicker`) switches the free-text animation field to a **clip dropdown** plus an
`animSpeed` field, with an *Open in Database* link.

### 10.4 Loading

Phase 1 keeps today's "load every character in the manifest at boot". The design target (phase 6) is **per-map preload sets**:
collect `Sprite.asset`, event-state `appearance.asset`, `changeSprite.asset` and `persist: forever` overrides reachable from the map
(the same scan that powers where-used, §11), load those, and lazily load a character the first time a command swaps to an
unseen one. (Node params are read through the graph: `states[].graph.nodes[]`.)

---

## 11. Where-used (reference index) and safe edits

### 11.1 The index

One pure module in `shared/` (so tests and Node scripts can use it): 

```ts
type RefTarget =
  | { table: 'character'; id: string; clip?: string }
  | { table: 'graphic';   id: string }
  | { table: 'tileset';   id: string }
  | { table: 'switch' | 'variable'; id: string };

interface Reference {
  target: RefTarget;
  source: { table: 'map'; mapFile: string; mapName: string; entityId: string; entityName: string;
            stateIndex?: number; stateName?: string; nodeId?: string; nodeType?: string }
        | { table: 'character'; id: string; sheet?: string }         // Character → Graphic
        | { table: 'prefab'; id: string };                           // shared/engine/prefabs.ts
  where: 'sprite' | 'state-appearance' | 'node' | 'condition' | 'sheet' | 'tileset-layer' | 'state-binding';
  label: string;                                                      // "Town › Old man › State 2 › Change Sprite"
}
buildReferenceIndex(input: { maps; characters; tilesets; prefabs }): ReferenceIndex   // pure
index.of(target): Reference[]; index.counts(table): Record<id, number>
```

Sources scanned: entity `Sprite.asset` / `Sprite.animation`, event-state `appearance.asset/animation`, every node param of kind
`character`/`clip` (iterating `states[].graph.nodes`; node ids equal the old command ids, so existing refs stay valid), prefab defaults, character → graphic
sheet refs, map layers → tilesets, `bindings`/clips inside a character (for clip-level usage). The event-graph work rewrites `databaseUsage.ts` to scan graphs for flag reads/writes; that scanner becomes one
provider of this index (flags) rather than a parallel one, and the character/graphic/tileset providers sit beside it. Recomputed (debounced) when maps or records
change; the live, unsaved entities of the open map win over the loaded copy (the current `countSpriteUsage` behaviour).

### 11.2 Counts

Every list row and header shows a count from `index.counts`. Clip rows show per-clip usage (`walk · 12`).

### 11.3 The Used-by UI

* **Popover** (header chip): top 8 grouped by map › entity, "See all" → the **Used by** tab.
* **Used by tab**: grouped by map, then entity, then location (`Sprite`, `State 2 appearance`, `Change Sprite node`,
  `Condition`). A filter by clip and a "Group by: map / kind" toggle.
* Each row has **Open**: opens the map editor, selects the entity (`openEventEditor` for event locations), and for graphics/
  tilesets opens the owning character/map.
* Reverse direction as well: a character's **Uses** list (its graphics), so deleting a graphic shows exactly which characters
  break.

### 11.4 Rename / move / delete

* **Rename** a character id, clip, sheet key or graphic path → dialog lists every reference ("12 references in 3 maps, 2
  prefabs") with a diff preview and **Rewrite & rename** (default) or Cancel. Rewriting goes through the same pure functions as
  migration and the map autosave queue so undo history stays sane; unopened maps are rewritten on disk atomically
  (`atomicWrite`).
* **Delete** with references → blocked with the list; **Delete anyway** is available only for unused-after-force cases and
  warns that entities lose their graphic (today's behaviour).
* Sprite inspector shows a red *missing character* state instead of silently drawing nothing.

---

## 12. Pipeline changes (`scripts/lib/assets.mjs`, `sync-assets.mjs`)

* Reads `project/database/characters/**/*.json` + referenced Graphics.
* Emits `game/public/data/characters.json` = `{ version: 2, characters: [{ id, def, files: { <sheetKey>: <url> } }] }` (sorted,
  deterministic) and copies only referenced images to `game/public/graphics/…`. `sprites.json` is emitted too for one release
  (derived v1 view) so a half-migrated checkout still boots; remove afterwards.
* `planSpriteLoads` iterates sheets (per-sheet frame size/margin/spacing) and `buildAnimationRegistrations` iterates clips
  (one registration per facing for directional clips, none for mirrored facings).
* `npm run assets:check` fails on invalid characters, missing graphics, and duplicate keys (extends `assets-validate.mjs`).
* `npm run assets:migrate` performs §6 on disk (moves sheets, writes records, rewrites nothing in maps).

---

## 13. Phasing

Each phase is shippable on its own and keeps `npm test` green; later phases never require rewriting earlier data.

| # | Phase | Delivers | Main files |
|---|---|---|---|
| 1 | **Data model + migration** | `CharacterDef` types, `validateCharacter`, `resolveClip`, `effectiveFps`, v1→v2 migration, parity tests; storage **still** `project/sprites` | new `shared/engine/{characters,characterMigrate}.ts`, additive edits to `sprites.ts`, `constants.ts`, `types.ts` (`animSpeed`), tests |
| 2 | **Runtime** | `AnimatorComponent`, generic `AnimationSystem`, clip registration, `timeScale`, one-shot completion, mirror flip, `animSpeed`; new nodes `stopAnimation`, `setAnimationSpeed`, `setMoveSpeed`; `playAnimation` `wait/then/speed` (needs event-graph Phase 2: `NodeResult` handlers) | `game/src/{sprites,ecs,events}/…` |
| 3 | **Graphics library + pipeline** | `project/graphics`, sheets as references, `characters.json`, `assets:migrate/check` | `scripts/lib/assets*.mjs`, `editor/electron/ipc/*` |
| 4 | **Database shell + Visual tables** | `/database`, table registry, Graphics + Tilesets (read-only), Flags table hosted (event-graph Phase 3 panel), search, deep links | `editor/src/routes`, new `components/editor/database/*` |
| 5 | **Characters editor** | wizard, Animations/Sheets/Setup tabs, frame picking, preview parity, compact fields, info tips | `components/editor/database/characters/*`, `controls.tsx`, `index.css` |
| 6 | **Reference index + safe edits** | where-used UI, rename-with-rewrite, delete guards, Maps (read-only) table, clip/character pickers in inspector & event editor (needs event-graph Phase 4 canvas for node forms) | `shared/references.ts`, `databaseUsage.ts`, inspector/events |
| 7 | **Modes & loading** | `setMovementMode` / `swim`, per-map preload sets, profiles in swap warnings | `game/src/sprites`, `shared/engine/profiles.ts` |

Phases 1–2 can ship before any UI changes (existing characters behave identically — that is the regression test).

**Dependency on the event-graph rollout** ([event-graph-spec §12](event-graph-spec.md)):

| This spec | Needs from event-graph | Can start |
|---|---|---|
| Phase 1 (data model) | nothing (new files only) | once the event branch exists to branch from |
| Phase 2 (runtime) | Phase 2 (`NodeResult` handlers) for the **node** changes; the animator/`AnimationSystem` part is independent | animator immediately; nodes after event Phase 2 |
| Phase 3 (graphics + pipeline) | Phase 5 touches `sync-assets.mjs` (copy `project/common/`) — trivial rebase | any time after Phase 1 |
| Phase 4 (Database shell) | Phase 3 (Flags panel, `database.json` v2) to host the Flags table; shell + Visual tables do not need it | shell first, Flags table after |
| Phase 5 (Characters editor) | nothing | after Phase 4 |
| Phase 6 (index + safe edits) | Phase 3 (flag usage on graphs), Phase 4 (canvas, `ParamForm` kinds) | after both |
| Phase 7 | nothing | last |

Each phase ends with a **rebase check** on the event-graph branch (or `main` once merged) and `npm test` + `npm run maps:check` green;
the integration test "play an event whose node changes a character's sprite, plays a one-shot clip with `wait`, and changes speed"
is added in Phase 2 against the graph interpreter and must pass on the combined branch.

### Testing

* **Golden migration tests**: each current `project/sprites/**/sprite.json` → v2 → the *same* `buildAnimationRegistrations`
  keys/frames/fps as today (a fixture comparison against the v1 output).
* **Parity**: `previewFrame`/`effectiveFps` shared by editor and game (extend `engine-parity.test.ts`).
* **Unit**: `resolveClip` fallback table, mirror/XOR flip, validation matrix (§5.7), reference index (one fixture map with every
  reference kind), rename-rewrite round-trip.
* **Runtime**: `AnimationSystem` + a fake `AnimationFactory` (existing pattern in `spritePlan.test.ts`): idle→walk→run→swim, one-shot
  completion resolves `wait`, `setAnimationSpeed` changes `timeScale`, `followSpeed` follows a `speed` route step.
* **UI**: component tests for clip add/rename/delete, frame picking (click, shift, marquee, row header, mirror), wizard flow, wizard
  suggestion for a 128×192 image, where-used popover, read-only tables expose no mutating controls.
* **Manual checklist** (in the PR): create a flower from scratch in < 1 minute; add `swim` to the player without touching code;
  change a walk speed in an event and watch the feet.

---

## 14. Future-proofing (designed for, not built)

* **8 facings**: `FacingMode: 'eight'` and extra `Facing` values; `byFacing` is already a map, mirror already general.
* **Per-frame durations / hit-boxes / events on frames**: `frames` can become `(number | { index; ms?; … })[]` — the reader
  accepts both.
* **Paper-doll / player-made characters**: a recipe `{ body, hair, outfit, tints }` stored in the save; each part is a
  Character satisfying `actor4`; the renderer layers them playing the same clip in lock-step. Profiles (§5.6) are the contract.
* **Atlas packing** at `assets:sync` (many sheets → one texture) behind the same texture-key contract.
* **GUID ids** if mods/shared content ever matter; today's path ids + rename-with-rewrite are sufficient solo.
* **Pokémon / items / moves tables**: records that *reference* Characters/Graphics by id (front, back, icon…), appearing in the
  same shell, with the same Used-by, search and validation.

---

## 15. Open questions (defaults chosen; say if any is wrong)

1. **Graphics read-only means no rename/delete until the rewrite flow exists.** Default: allow *Import* and *Reveal* now, defer
   the rest to phase 6.
2. **Existing ids are kept** (`characters/player`) even though that nests as `database/characters/characters/…`. Default: keep,
   clean up later via rename-with-rewrite.
3. **One sheet per clip.** A clip can't mix frames from two images. Default: yes (simpler preview, one texture per animation);
   use a bigger combined sheet if needed.
4. **`followSpeed` is on by default for new walk/run clips** but **absent for migrated ones** so existing games don't change feel.
5. **Edge case**: a character swap keeps facing/activity/mode but drops `explicitClip`. Default: yes.

---

## Appendix A — "i" info copy (initial)

| Field | Text |
|---|---|
| Name | "What you'll see in lists and pickers. You can rename it any time; the id (below) is what maps use." |
| Id | "The permanent name maps and events use to refer to this character. Renaming it updates every place it's used (you'll see a preview first)." |
| Tags | "Your own labels, like 'npc' or 'prop', for filtering. They don't affect the game." |
| Facing | "Four directions: the character can look down, left, right or up and animations can differ per direction. None: it looks the same from every side." |
| Pivot | (see §8.9) |
| Image | "The picture file this sheet is cut from. Images live in Graphics; you can pick one that other characters already use." |
| Columns × Rows | (see §8.9) |
| Frame size | "The width and height of one frame in pixels. Calculated from columns and rows; change it only if the image has odd sizes." |
| Margin | "Empty pixels around the whole image before the first frame." |
| Spacing | "Empty pixels between neighbouring frames." |
| Sheet pivot override | "Use a different pivot for animations on this sheet, for example when its frames are bigger than the others." |
| Animation name | "Used by events to play this animation (Play Animation) and in animation bindings. Letters, digits, dashes and underscores." |
| Directional | (see §8.9) |
| Loop | (see §8.9) |
| Playback | "Forward plays frames in order. Reverse plays them backwards. Ping-pong goes forward, then back, which is handy for swaying." |
| FPS | (see §8.9) |
| Follow movement speed | (see §8.9) |
| Reference speed | "The movement speed in pixels per second at which this animation's FPS looks right. A character moving twice as fast plays it twice as fast." |
| Use ▾ (mirror) | (see §8.9, *Mirror*) |
| Preview speed | "Only changes this preview, not the saved animation." |
| Entity speed (preview) | "Pretend the character moves at this speed to see how 'Follow movement speed' behaves." |
| Auto-assign rows | "Gives the first four rows to down, left, right and up in that order. You can change any row afterwards." |
| Animation bindings | (see §8.9) |
| Still frame | (see §8.9) |
| Profile | (see §8.9) |
| Used in N | "Every map, entity, event and prefab that refers to this character. Click an entry to jump there." |
| Read-only badge (Visual) | "Visual resources are shown exactly as stored. To use one, attach it to a character; to change it, edit the image file." |
| Persist (Change Character) | "Until the event state changes: goes back when the entity's active event state changes. Until the map changes: lasts while you stay on this map. Forever: remembered in the save." |
| Play Animation › wait | "Pause this event until the animation finishes. Only works for animations that don't loop." |
| Play Animation › then | "What happens after a one-time animation ends: return to automatic, stay on the last frame, or repeat." |
| Set Animation Speed | "1× is the speed set in the character. 2× is twice as fast, 0 freezes it." |

## Appendix B — Field size tokens

| Token | Width | Use |
|---|---|---|
| `xs` | 56 px | 1–2 digit integers (columns, rows, frame index) |
| `sm` | 72 px | numbers with units (px, fps, ×), decimals |
| `md` | 120 px min, content width | selects, short text (animation names) |
| `lg` | 200 px | paths shown read-only |
| `fill` | 100 % | names, ids, search, command text |

## Appendix C — Validation message style

`<what> — <why it matters> — <how to fix>`, e.g.
*"Animation 'walk' has no frames for → right. It would show nothing when facing right. Pick frames, or set 'Use' to mirror of ← left."*
Errors show red with the field focus link; warnings amber; info grey ("Animation 'wave' is not used anywhere").
