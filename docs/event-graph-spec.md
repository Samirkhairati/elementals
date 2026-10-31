# Event graphs: specification

Status: proposed. Replaces the RPG-Maker "pages + indented command list" event editor with
**states** (what an entity is like right now) whose behaviour is a **node graph**, and reorganises
switches / variables / self switches into a named, grouped, typed flag system.

This is the detailed version of the direction in [`roadmaps/event-editor.md`](../roadmaps/event-editor.md)
(§3 "The Event Graph") and the "a graph view can be added later with no data change" note in
[`engine-design.md` §3](engine-design.md). Where this spec and the roadmap disagree, this spec wins for
the event system; the roadmap stays the long-term wish list.

Contents

1. [Goals and non-goals](#1-goals-and-non-goals)
2. [Vocabulary](#2-vocabulary)
3. [Data model](#3-data-model)
4. [Node catalog changes](#4-node-catalog-changes)
5. [Execution semantics](#5-execution-semantics)
6. [Flags: switches, variables, stages, local flags](#6-flags-switches-variables-stages-local-flags)
7. [Common events](#7-common-events)
8. [Validation](#8-validation)
9. [Migration](#9-migration)
10. [Editor UX](#10-editor-ux)
11. [Code map: what changes where](#11-code-map-what-changes-where)
12. [Rollout phases](#12-rollout-phases)
13. [Testing strategy](#13-testing-strategy)
14. [Open questions](#14-open-questions)

---

## 1. Goals and non-goals

### Goals

* **Author behaviour as a graph**: flow runs left to right through nodes; branches are visible wires.
* **Keep what already works.** Command definitions (`COMMAND_CATALOG`), parameter forms (`ParamForm`),
  summaries, validation, the async interpreter, triggers, page selection and the 465-line interpreter test
  suite carry over. A node *is* a command with a position and wires.
* **Organised state.** Flags are named, grouped in folders, typed (switch / number / stage), and every
  reference is traceable ("where is this read, where is it set").
* **Reuse.** One graph can be called from many events (common events).
* **Lossless migration.** Every existing map loads and behaves identically; no author action required.
* **Keep the data diff-friendly.** Graphs are plain JSON in the map file. IDs are stable, positions are the
  only noisy fields.

### Non-goals (explicitly out of scope for v1)

* Data wires / expression nodes (Blueprint-style typed pins). There is **one wire type: flow**. All
  settings live inside nodes.
* Parallel forks inside one graph (one run = one token). Parallelism stays "one `parallel` state per entity".
* Bytecode compilation. The roadmap sketches `Graph JSON → bytecode → VM`; v1 interprets the JSON directly
  (after building a lookup index). The node model does not prevent adding a compiler later.
* Map-scoped flags, string/enum-valued variables beyond *stages*, array/struct variables.
* Mid-run save/resume. The design leaves room for it (§5.5) but does not build it.
* Runtime debug overlay in Play mode (listed as a later phase).
* A scripting language. `runScript` stays a planned escape hatch.

---

## 2. Vocabulary

| New term | Old term | Meaning |
|---|---|---|
| **Event** | Event (unchanged) | The `Event` component on an entity: a list of states. |
| **State** | Page | One version of the entity plus the rule for when it is active: `conditions`, look, trigger, solidity, and a graph. The **last** state whose `conditions` hold is active. |
| **Graph** | Command list | The behaviour that runs when the state is triggered. |
| **Node** | Command | One step in a graph. `Command` becomes `GraphNode`. |
| **Port** | Branch | A named output of a node. `next` is the default; `then`/`else`, one per choice, etc. |
| **Flag** | Switch / variable / self switch | Umbrella word for any stored game fact. |
| **Switch** | Switch | Global on/off flag. Unchanged. |
| **Variable** | Variable | Global number. Unchanged. |
| **Stage** | (new) | Global flag that holds one of an ordered list of named values, e.g. `none → accepted → found → done`. |
| **Local flag** | Self switch | On/off flag owned by one event. |
| **Common event** | `callCommonEvent` (planned) | A named, shared graph callable from any node graph. |
| **GameFlags** | `EventState` (class) | The runtime store of all flags. Renamed because "State" now means an event state. |

---

## 3. Data model

All types live in `shared/engine/types.ts` and are consumed by both editor and game.

### 3.1 Event, state, graph

```ts
export interface EventProps {
  /** Evaluated last-to-first; the LAST state whose `conditions` hold is active. */
  states: EventState[]
  /** Names for this event's local flags (see §6.4). Optional; undeclared keys still work. */
  locals?: LocalFlagDef[]
}

export interface EventState {
  id: string
  name: string                 // shown on the tab; '' falls back to "State N"
  conditions: Condition[]      // unchanged name: "active when these all hold"
  trigger: EventTrigger
  faceOnInteract: boolean
  solid: boolean | null
  appearance: PageAppearance   // renamed StateAppearance
  graph: EventGraph
}

export interface EventGraph {
  nodes: GraphNode[]
  frames: GraphFrame[]         // visual-only comment boxes
}

export interface GraphNode {
  /** Stable id. For migrated commands this IS the old Command.id (keeps usage refs valid). */
  id: string
  /** Key of COMMAND_CATALOG, or the structural types 'start' | 'end' | 'junction'. */
  type: string
  params: Record<string, unknown>
  /** Output wiring: port id -> target node id. A missing/absent port means "flow ends here". */
  out: Record<string, string>
  x: number
  y: number
}

export interface GraphFrame {
  id: string
  title: string
  color: string                // '#rrggbb'
  x: number; y: number; w: number; h: number
}
```

Rules:

* **Exactly one `start` node** per graph. It has no input, a single `next` output, cannot be deleted or
  duplicated. It is the only entry point; the *trigger* lives on the state, not in the graph.
* Every other node has **one input** (conceptually; any number of wires may arrive at it) and its
  catalog-defined outputs.
* **At most one wire per output port**, by construction (`out` is a map). Fan-in is free, fan-out is
  impossible. This keeps the interpreter a single cursor and the wires readable.
* An output port with no entry in `out` ends the run, exactly like reaching the end of a command list
  today. It is **not** an error and not a warning.
* Cycles are allowed (that is how loops are written), subject to the yield rule in §8.
* `frames` are authoring aids. The game ignores them. Frame membership is geometric (a node whose box
  lies inside the frame), never stored.

### 3.2 Why `out` on the node instead of an edge list

* Single-wire-per-port is enforced by the shape, so there is nothing to validate and the interpreter is
  `node = nodes[node.out[port]]`.
* A node and its wiring change in one object, which keeps the existing immutable-update helpers simple.
* React Flow wants an edge array; the editor derives it (`edgesOf(graph)`) and writes back through
  `connect`/`disconnect` helpers. The derived edge id is `${from}:${port}` which is unique.

### 3.3 Catalog changes (`CommandDef`)

```ts
interface CommandDef {
  // …existing: type, label, category, description, icon, params, defaultParams, status, summarize
  /** Output ports. Default [{ id: 'next', label: '' }]. */
  ports?: PortDef[]
  /** Params-dependent ports (choices, stage switch). Overrides `ports`. */
  portsFor?: (params: Record<string, unknown>) => PortDef[]
  /** No `next` output and no way to continue (end). Shorthand for `ports: []`. */
  terminal?: boolean
}
export interface PortDef { id: string; label: string }
```

`branches` / `branchesFor` / `BranchDef` are replaced by `ports` / `portsFor` / `PortDef` (identical shape).
`getBranchDefs(command)` becomes `getPortDefs(node)`.

### 3.4 Common events

```ts
// project/common/<id>.json
export interface CommonEvent {
  version: 1
  id: string
  name: string
  folder?: string
  graph: EventGraph        // same shape; its `start` is the entry
}
```

### 3.5 Database (`project/database.json`, version 2)

```ts
export interface GameDatabase {
  version: 2
  switches: SwitchDef[]      // { id, name, folder? }
  variables: VariableDef[]   // { id, name, initial, folder? }
  stages: StageDef[]         // new
}
export interface StageDef {
  id: string
  name: string
  folder?: string
  values: { id: string; name: string }[]   // ordered; index is the comparison order
  initial: string                          // a value id; defaults to values[0]
}
export interface LocalFlagDef { key: string; name: string }
```

`folder` is a slash path (`"Quests/Lost cat"`). IDs stay opaque and stable; names and folders are free to
change. (An earlier sketch used dotted ids such as `quest.cat.accepted`. Folders + stable ids are better:
renaming and regrouping never touches a reference.)

### 3.6 Conditions

```ts
export type Condition =
  | { kind: 'switch'; id: string; value: boolean }
  | { kind: 'variable'; id: string; op: ComparisonOp; value: number }
  | { kind: 'stage'; id: string; op: ComparisonOp; value: string }   // new; compares by value order
  | { kind: 'selfSwitch'; key: string; value: boolean }              // key widened from 'A'..'D'
  | { kind: 'hasItem'; item: string; qty: number }
```

`kind: 'selfSwitch'` and the `setSelfSwitch` command keep their data names (no churn in saved maps);
the UI calls them "This event's flag".

---

## 4. Node catalog changes

Everything in `COMMAND_CATALOG` becomes a node type unchanged, except:

| Old | New | Notes |
|---|---|---|
| (list start) | **`start`** | Structural. One per graph, output `next`. |
| `exitEvent` | **`end`** | Terminal node (no outputs). Wiring to nothing also ends the run; `end` exists so authors can make an intentional end visible, and so migrated `exitEvent`s keep their meaning. |
| `loop` | removed | A loop is a cycle: wire a later node back to an earlier one. The migrator uses a `junction` as the loop head. |
| `breakLoop` | removed | A wire that leaves the cycle. |
| (new) | **`junction`** | Pass-through with output `next`. Used as a reroute point and as a loop head. Costs no tick, shows as a small dot. |
| `conditional` | `conditional` | Ports `then`, `else`. **No `next`**: both branches wire onward (to the same node to rejoin). |
| `showChoices` | `showChoices` | Ports: one per option id, plus `cancel` when `cancel === 'branch'`. Like `conditional`, no `next`. |
| (new) | **`branchStage`** | Ports: one per value of the chosen stage, plus `default`. Replaces a ladder of `conditional`s. |
| (new) | **`setStage`** | `{ id, op: 'set' \| 'advance', value }`. `advance` moves to the next value (clamped), so "progress the quest" needs no hard-coded value. |
| `callCommonEvent` | `callCommonEvent` | Goes from `planned` to `implemented` (§7). Single `next` port. |
| all others | unchanged | Same params, same `next` port. |

Planned-but-unimplemented commands (`startBattle`, `openShop`, etc.) stay `status: 'planned'`; the
interpreter keeps warning once and following `next`.

Structural types `start`, `end`, `junction` are handled directly by the interpreter and are **not** in
`COMMAND_HANDLERS`; they appear in the catalog (category `'flow'`) so the palette, summaries and
validation treat them uniformly. `start` is hidden from the palette.

---

## 5. Execution semantics

### 5.1 Contract change in `game/src/events/types.ts`

```ts
// before
export type Flow = 'next' | 'break' | 'exit'
export type CommandHandler = (command: Command, rt: CommandRuntime) => Flow | void | Promise<Flow | void>
// CommandRuntime has runBranch() and loopDepth

// after
export type NodeResult = void | { port: string } | 'end'
export type CommandHandler = (node: GraphNode, rt: CommandRuntime) => NodeResult | Promise<NodeResult>
// CommandRuntime loses runBranch() and loopDepth
```

* `void` = follow `next`.
* `{ port }` = follow that port (`conditional` returns `{ port: holds ? 'then' : 'else' }`, `showChoices`
  returns `{ port: option.id }`).
* `'end'` = stop the run successfully.

Only three handlers use `runBranch` today (`conditional`, `loop`, `showChoices`); all other handlers are
untouched apart from the parameter type.

### 5.2 Interpreter loop

```
index = Map<nodeId, GraphNode>            // built once per run
cursor = graph.start.out.next
while cursor:
  if aborted: throw Cancelled
  node = index[cursor]                      // missing -> warn once, stop (graph validated, so rare)
  tick()                                    // yield a frame after YIELD_EVERY_COMMANDS without a real wait
  result = structural(node) ?? await handler(node, rt)   // errors logged and treated as void, as today
  port = result is 'end' ? stop : result?.port ?? 'next'
  cursor = node.out[port]
completed
```

Unchanged: cancellation via `AbortController`, `guard()`, `CancelledError`, the `completed | cancelled |
error` outcome, warn-once for planned/unknown commands, handler exceptions logged and skipped. The
2000-command yield guard stays as a runtime backstop even though validation (§8) rejects cycles with no
waiting node.

### 5.3 Observability

`EventInterpreter` gains a read-only `currentNodeId: string | null`, set before each node, exposed on
`RunningEvent`. Nothing consumes it in v1; it is the hook for the later Play-mode overlay and for tests.

### 5.4 What does not change

State selection (`PageSelector` → `StateSelector`), triggers (`TriggerSystem`), blocking/parallel rules,
input locking, map-switch cancellation and the per-entity "one interpreter at a time" rule in
`EventRuntime` are unchanged apart from renames.

### 5.5 Future save/resume

A run's whole position is `{ stateId, nodeId, callStack: nodeId[] }`. Because the interpreter keeps no
other control state (no recursion over lists), this is serialisable. v1 does not persist it.

---

## 6. Flags: switches, variables, stages, local flags

### 6.1 What each kind is for

| Kind | Type | Scope | Use when |
|---|---|---|---|
| Switch | boolean | global | A one-off fact: `intro_done`, `gate_opened`. |
| Variable | number | global | Counting or measuring: `badges`, `steps_taken`. |
| **Stage** | ordered named values | global | Progress through a sequence: a quest, a story act, a door that is locked → unlocked → open. **Prefer a stage over several switches that must be set in order.** |
| Local flag | boolean | one event | "This chest is open", "I already said hello". Never needs a database entry. |

### 6.2 The rule of thumb in the UI

The "new flag" menu asks the question, not the type: *Is it yes/no? → Switch. Is it a count? → Variable.
Is it progress through steps? → Stage. Does only this event care? → Local flag.*

### 6.3 Organisation

* **Folders** on switches, variables and stages (`folder` path). The Database panel shows a collapsible
  tree, with search across names, ids and folders.
* **Usage tracking** extends the existing `editor/src/lib/databaseUsage.ts` scanner:
  * scan `states[].conditions` and every graph node (instead of `pages[].conditions` / command trees);
  * record `access: 'read' | 'write'` per reference (conditions and `conditional`/`branchStage` are reads;
    `setSwitch`/`setVariable`/`setStage` are writes);
  * `UsageRef` replaces `pageIndex`/`pageName`/`commandId` with `stateIndex`/`stateName`/`nodeId`, so
    "go to usage" can open the event and select the node;
  * the Database panel shows `read in 3 · set in 1` per flag and flags the two bugs that matter:
    **read but never set** (can never become true) and **set but never read** (dead write).
* **Stages in conditions and nodes** read like sentences: `Lost cat is at least "Found"`.

### 6.4 Local flags (generalised self switches)

* Stored exactly as today: `GameFlags` key `<mapId>/<entityId>/<key>`, boolean, absent = false, survive
  map changes, cleared by `reset()`.
* `<key>` widens from `A | B | C | D` to any non-empty string. `A`–`D` remain valid keys, so existing
  saves and maps work unchanged.
* An event may *name* its keys in `EventProps.locals` (`{ key: 'opened', name: 'Chest opened' }`). The
  editor offers declared names first; typing a new name creates the declaration. Undeclared keys still run
  (and get a validation *warning*).
* Migration declares `A`–`D` (named "Local flag A"…) only for keys the event actually uses.

### 6.5 Runtime: `GameFlags`

`game/src/events/EventState.ts` → `GameFlags.ts`:

```ts
export type FlagChange =
  | { kind: 'switch';    id: string; value: boolean }
  | { kind: 'variable';  id: string; value: number }
  | { kind: 'stage';     id: string; value: string }     // value id
  | { kind: 'selfSwitch'; id: string; value: boolean }   // id = '<mapId>/<entityId>/<key>'
  | { kind: 'reset';     id: '' }

export interface GameFlagsSnapshot {
  switches: Record<string, boolean>
  variables: Record<string, number>
  stages: Record<string, string>           // new; absent in old snapshots -> initial values
  selfSwitches: Record<string, boolean>
}
```

* `getStage(id)`, `setStage(id, valueId)`, `stageIndex(id)`, `advanceStage(id)`.
* Unknown stage id or value id: warn once, ignore the write; reads return the first value (or `''` when
  the stage is unknown, which compares false).
* Same notify-on-change behaviour; bus event `EVENT_STATE_CHANGED` → `FLAGS_CHANGED`.
* `load()` keeps tolerating missing fields, so old snapshots load.

---

## 7. Common events

* Stored as `project/common/<id>.json` (§3.4); copied to `game/public/data/common/` by the same data
  sync that already handles maps and `database.json` (`scripts/export-maps.mjs` / `sync-assets.mjs`,
  and the Electron `databaseStore` for editor-side reads/writes).
* Node `callCommonEvent { id }`: the interpreter pushes the caller's `nodeId` on a call stack, runs the
  common graph with the **same `EventContext`** (so `self` is still the calling entity and local flags
  are the caller's), then continues from the caller node's `next` when it ends.
* `end` inside a common event returns to the caller; `end` in a state graph stops the run. (There is no
  "return value" in v1.)
* Limits: call depth 16 (warn and stop the run beyond it).
* Validation: unknown id → error; a cycle among common events (A → B → A) → error, reported on every
  member of the cycle.
* The Database panel gets a **Common events** list. Opening one uses the same canvas with no state settings.
* No parameters in v1; common events read and write global flags and act on `self`.

---

## 8. Validation

Pure functions in `shared/engine/graph.ts`, returning `GraphIssue[]` (replaces `CommandIssue`):

```ts
export interface GraphIssue {
  nodeId: string
  port?: string
  severity: 'error' | 'warning'
  code: string          // stable, machine-readable
  message: string
}
```

| Code | Severity | Rule |
|---|---|---|
| `no-start` / `multiple-start` | error | Exactly one `start`. |
| `dangling-edge` | error | `out[port]` points at a node that does not exist. |
| `unknown-port` | error | `out` has a key the node's `getPortDefs` does not offer. |
| `unknown-command` | error | Existing check. |
| `unreachable` | warning | Not reachable from `start`. |
| `cycle-without-wait` | error | A cycle contains no node that waits. "Waits" = a catalog flag `yields: true` on `wait`, `showText`, `showChoices`, `moveRoute`, `fadeScreen`, `shakeScreen`, `warp`, `startBattle`, etc. Replaces the old silent frame-yield. |
| `dangling-switch` / `-variable` / `-stage` / `-stage-value` / `-entity` / `-common` | error | Existing reference checks, plus stages and common events. |
| `missing-param`, `bad-param`, `out-of-range` | warn/error | Existing field validation, unchanged. |
| `undeclared-local` | warning | Local flag key not in `EventProps.locals`. |
| `empty-choice-port` | none | An unwired port is legal. |

Entity-level validation (`validateEntity`) keeps producing `EntityIssue`, with
`path: components.Event.states[i].graph.nodes[<id>]` and `nodeId` (replaces `commandId`).

---

## 9. Migration

Migration runs where `migrateMap`/`migrateEntity` already run (`shared/engine/migrate.ts`), is **pure**,
idempotent, and stamps `schemaVersion: 3` (`SCHEMA_VERSION` 2 → 3). Database: `version: 1 → 2` (add
`stages: []`, nothing else changes). Old snapshots load unchanged.

### 9.1 Event component

1. `pages` → `states`; everything else copies (`conditions` keeps its name).
2. `commands` (tree) → `graph` via `commandsToGraph` (below).
3. `locals`: declare `A`–`D` for keys found in `conditions` and in `setSelfSwitch` params.

### 9.2 `commandsToGraph(commands, idFn)`

Lower the tree right-to-left so every list knows what follows it.

```
lower(list, after, breakTarget) -> first node id of the list (or `after` when empty)
  next = after
  for command in reversed(list):
    node = { id: command.id, type, params, out: {} }
    switch type:
      conditional:  out.then = lower(branches.then, next, breakTarget)
                    out.else = lower(branches.else, next, breakTarget)
      showChoices:  for each port: out[port] = lower(branches[port], next, breakTarget)
      loop:         head = junction node
                    head.out.next = lower(branches.body, head.id, next)   // tail loops back; break leaves to `next`
                    node = head
      breakLoop:    next = breakTarget; discard remaining (dead) commands before it; continue
                    (outside a loop: dropped, migration warning, same as the old runtime's "ignored")
      exitEvent:    node = new `end` node; discard remaining commands before it
      default:      out.next = next
    next = node.id
  return next
start.out.next = lower(commands, null, null)
```

* **Node ids are the old command ids**, so `databaseUsage` refs, selected-command memory and any external
  references survive.
* An empty branch lowers to `after` (the rejoin point), not to a dangling port, so wires stay short.
* Dead commands (anything after `breakLoop`/`exitEvent` in the same list) are not wired, so they would be
  `unreachable`; the migrator keeps them as unwired nodes placed below, with a warning, instead of
  silently deleting author content.

### 9.3 Layout

`shared/engine/graphLayout.ts` — dependency-free layered layout (longest-path layering, x = layer × 260,
rows assigned per layer to avoid overlaps, branch ports ordered top to bottom). Used by migration (so
every migrated graph opens readable) **and** by the editor's *Auto layout* button. Layout never runs
implicitly after an edit.

### 9.4 Compatibility window

`commandsToGraph` and the legacy `Command` type stay in `shared/engine/` permanently (the migrator needs
them). The tree helpers (`insertCommand`, `moveCommand`, `walkCommands`, …) and `Flow`/`runBranch` are
deleted in the final cleanup phase once nothing imports them.

Also migrate: `shared/engine/prefabs.ts` and `components.ts` default factories
(`createDefaultEventPage` → `createDefaultEventState`, which produces a graph containing only `start`).

---

## 10. Editor UX

Library: **`@xyflow/react` (React Flow) v12**, pinned to an exact version at install time. No layout
dependency (own layout, §9.3).

### 10.1 Layout

```
┌──────────────┬───────────────────────────────────────────┬──────────────────┐
│ States       │  State settings (collapsible strip)       │ Inspector        │
│  ① Not given │  Active when … · Look · Trigger · Solid   │  (selected node: │
│  ② Accepted  ├───────────────────────────────────────────┤   ParamForm)     │
│  ③ Done      │                                           │  or Problems     │
│  + State     │           graph canvas                    │                  │
│              │                                           │                  │
└──────────────┴───────────────────────────────────────────┴──────────────────┘
```

* Same three-column shape as today's `EventEditor`; the command list in the middle becomes the canvas.
* `PageTabs` → `StateTabs` (vertical list). Each row: number, name, a one-line "Active when…" summary,
  a marker on the state that is active in a brand-new game (`defaultActivePageIndex` →
  `defaultActiveStateIndex`).
* `PageSettings` → `StateSettings`: conditions (`ConditionsEditor` gains the *stage* kind), appearance,
  trigger, solid, faceOnInteract.
* The right column is unchanged in spirit: `ParamForm` for the selected node, Problems tab.

### 10.2 Nodes

* Custom React Flow node: category-coloured header with icon + label (`commandStyle.tsx`), body = the
  catalog `summarize(params, ctx)` text, `planned` badge, issue badge (error/warning count).
* One input handle on the left; output handles on the right, **labelled** for multi-port nodes
  (`Then`/`Else`, each choice label, each stage value).
* `showText` renders its first ~3 lines so a conversation reads at a glance. `junction` renders as a
  small dot; `start`/`end` as pills.
* Snap to a 16 px grid. Single-wire output ports: dragging a new wire from an occupied port replaces the
  old wire.

### 10.3 Interactions

| Action | Behaviour |
|---|---|
| Add node | Space / Tab / right-click on canvas → searchable palette grouped by category (reuses `COMMAND_CATEGORIES`). |
| Add + connect | Drag from an output handle and release on empty canvas → palette opens pre-filtered; the chosen node is created at the drop point and wired. |
| Connect | Drag handle → node body or input handle. Self-loops and wiring into `start` rejected. |
| Delete | `Delete`/`Backspace`: removes selected nodes and their wires. `Ctrl+Delete`: **dissolve** — removes the node and reconnects its input sources to its `next` target (when it has exactly one). |
| Copy / paste / duplicate | `Ctrl+C/V/D`: copies the selected subgraph (nodes + wires between them) with fresh ids. Clipboard format `elementals/graph-fragment` v1, pasteable across events and maps. `start` is never copied. |
| Frames | Select nodes → `Ctrl+G` wraps them in a titled, coloured frame. Moving a frame moves nodes inside it. |
| Navigation | Mouse wheel zoom, space+drag pan, `F` fit view, minimap, "Auto layout" button (with undo). |
| Undo / redo | Reuse the existing history mechanism of `EventEditor`: whole-graph snapshots (cheap thanks to immutable updates). A drag is **one** entry, recorded on drag end. |
| Jump to problem | Clicking a row in Problems selects the node and pans to it. |
| Jump to usage | From the Database panel, "open usage" opens the event, selects the state and the node. |

### 10.4 Things that stay

Templates (`applyTemplate`) now insert a small subgraph. The Problems list, `EventComponentEditor` (entity
inspector summary), and the dialog host `EventEditorDialog` stay; they just switch types.

---

## 11. Code map: what changes where

| Area | Files | Change |
|---|---|---|
| **Types** | `shared/engine/types.ts` | `EventProps`, `EventState`, `EventGraph`, `GraphNode`, `GraphFrame`, `PortDef`, `StageDef`, `LocalFlagDef`, `CommonEvent`, `GraphIssue`; widen `SelfSwitchKey`; new `stage` condition; `SCHEMA_VERSION = 3`; `GameDatabase.version = 2`. |
| **Graph helpers (new)** | `shared/engine/graph.ts`, `graphLayout.ts` | Pure, immutable: `createGraph`, `createNode`, `addNode`, `removeNode`, `dissolveNode`, `connect`, `disconnect`, `moveNode`, `updateParams` (re-syncs ports), `cloneFragment`, `pasteFragment`, `edgesOf`, `reachable`, `findCycles`, `validateGraph`, `commandsToGraph`, `layoutGraph`. |
| **Catalog** | `shared/engine/commands.ts` | `ports`/`portsFor`/`terminal`/`yields`; drop `loop`, `breakLoop`; `exitEvent` → `end`; add `junction`, `start`, `setStage`, `branchStage`; `callCommonEvent` → implemented; stage fields in `FieldDef` (`kind: 'stage'`, `'stageValue'`); `getPortDefs`. Tree helpers removed in the last phase. |
| **Defaults/prefabs** | `shared/engine/components.ts`, `prefabs.ts` | `createDefaultEventState`, templates. |
| **Validation** | `shared/engine/validate.ts`, `commands.ts` | `validateGraph`, stage/common checks; `EntityIssue.nodeId`. |
| **Migration** | `shared/engine/migrate.ts` | v2 → v3 as in §9; database v1 → v2. |
| **Database** | `shared/engine/database.ts`, `editor/electron/ipc/databaseStore.ts`, `editor/src/hooks/useDatabase.ts`, `game/src/data/gameData.ts` | Stages, folders; common-event load/save. |
| **Runtime state** | `game/src/events/EventState.ts` → `GameFlags.ts` (+ test) | Rename, add stages, `FLAGS_CHANGED`. |
| **Interpreter** | `game/src/events/EventInterpreter.ts`, `types.ts`, `commands/flow.ts`, `commands/dialogue.ts`, `commands/state.ts` | Cursor loop, `NodeResult`, remove `runBranch`/`loopDepth`; `conditional`/`showChoices` return ports; new `setStage`/`branchStage`; `callCommonEvent`. |
| **Runtime** | `game/src/events/EventRuntime.ts`, `PageSelector.ts` → `StateSelector.ts`, `conditions.ts`, `TriggerSystem.ts`, `ecs/components/EventComponent.ts` | Renames (`pages`→`states`, `activePage`→`activeState`, `state`→`flags`), stage conditions, `currentNodeId`. |
| **Editor events** | `editor/src/components/editor/events/*` | New `GraphCanvas`, `GraphNodeView`, `NodePalette`; `StateTabs`, `StateSettings`; `eventModel.ts` rewritten on graph helpers; `CommandList.tsx` retired. |
| **Editor misc** | `editor/src/lib/databaseUsage.ts`, `entityVisuals.ts`, `panels/DatabasePanel.tsx`, `inspector/customEditors.tsx` | Usage scan on graphs with read/write; folders, stages, common-events list. |
| **Data/scripts** | `scripts/export-maps.mjs`, `sync-assets.mjs` | Copy `project/common/`. |
| **Docs** | `docs/engine-design.md` §3, `docs/game-runtime.md` | Update to states/graphs; link this spec. |

---

## 12. Rollout phases

Each phase leaves the game and editor working and tests green; each is a reviewable change. Phases 1–3
need no UI, so correctness is locked in before the canvas exists.

**Phase 0: Vocabulary rename** (mechanical, no behaviour change).
`EventState` → `GameFlags`, `pages` → `states`, `PageSelector` → `StateSelector`,
editor labels "Page" → "State". Data migration for the key rename (schema 3 stage 1). Done when the
whole suite passes and a map round-trips.

**Phase 1: Graph model + migration** (`shared/engine`, no UI, no runtime change yet).
Types, `graph.ts`, `graphLayout.ts`, `commandsToGraph`, `validateGraph`, port-aware catalog, migration
v2 → v3. Done when every map under `project/maps` migrates, validates clean, and the tree→graph→tree
property tests hold (§13).

**Phase 2: Graph interpreter.**
Cursor-based `EventInterpreter`, `NodeResult` handlers, `currentNodeId`. Done when the existing
interpreter suite passes unchanged against `commandsToGraph(fixture)` (§13).

**Phase 3: Flags.**
`GameFlags` stages, `stage` condition, `setStage`/`branchStage`, widened local-flag keys, database v2,
`ConditionsEditor` + Database panel (folders, stages, usage read/write). Can run in parallel with 4.

**Phase 4: Canvas editor.**
React Flow canvas, node view, palette, wiring interactions, copy/paste, frames, auto layout, undo, problems
integration. Retire `CommandList`. Done when an author can build and run the Elder quest (§13.3) without
touching JSON.

**Phase 5: Common events.**
`project/common/`, registry, `callCommonEvent` runtime, Database list, validation, sync scripts.

**Phase 6: Cleanup and docs.**
Delete tree helpers, `Flow`, `runBranch`, dead tests; update `engine-design.md`, `game-runtime.md`, the
roadmap (mark §3 delivered / adjust).

**Later (not specced here):** Play-mode node highlighting from `currentNodeId`; save/resume; parameters
for common events; map-scoped flags; a multi-line dialogue node; fork/parallel branches.

Dependency order: 0 → 1 → 2 → {3, 4} → 5 → 6.

---

## 13. Testing strategy

### 13.1 Migration (Phase 1)

* **Golden fixtures**: hand-written command trees covering every shape (nested `conditional`, `showChoices`
  with cancel, loop with `breakLoop` inside nested `conditional`, `exitEvent` mid-list, empty branches,
  dead code after break) with expected graphs.
* **Corpus test**: migrate every map in `project/maps` and `game/public/data/maps`; assert
  `validateGraph` returns no errors.
* **Idempotence**: migrating a v3 map returns it unchanged (deep-equal).
* **Property test**: random trees → graph → a reference "unfold" (walk the graph, recording the node-type
  sequence for a fixed set of port choices) equals the tree's execution order for the same choices.

### 13.2 Interpreter (Phase 2)

`EventInterpreter.test.ts` (465 lines) is parameterised: each case already builds a command tree; run the
same assertions after `commandsToGraph`. Both interpreters pass the same suite during the transition.
New cases: cycle with `wait` runs and cancels; cycle without waiting is rejected by validation and yields
at runtime as a backstop; `callCommonEvent` depth limit; unknown node id aborts with one warning;
`currentNodeId` tracks the run.

### 13.3 End-to-end scenario

The Elder example as a fixture and as a Playwright/Vitest rig test (`game/src/test/rig.ts`):
three states, a `quest.cat` stage, `showChoices` accept/decline, state switches after `setStage`, and the
usage index reports `quest.cat` as read in 2 and set in 2 places.

### 13.4 Editor

Existing component-test style (`EventEditor.test.tsx`, `eventTestUtils.tsx`): connect/disconnect,
single-wire replacement, dissolve, paste with fresh ids, undo coalescing for drags, Problems → select
node, palette filtering. Pure helpers in `graph.ts` are unit-tested exhaustively (they carry the logic).

### 13.5 Flags

`GameFlags.test.ts` (renamed from `EventState.test.ts`): stage set/advance/clamp, unknown ids, snapshot
round-trip with and without `stages`, change notifications only on real changes.

---

## 14. Open questions

1. **Rename the stored key?** Phase 0 renames `pages`/`conditions` in the saved data so code and UI share
   one vocabulary. The alternative is to rename only the UI and keep `pages` in JSON, which is less
   churn but leaves a permanent mismatch. This spec assumes the rename.
2. **`start` as a visible node vs. an implicit entry.** Chosen: visible `start`, so the entry is obvious
   and a freshly created state shows one node on an otherwise empty canvas.
3. **One `showText` node or multi-line?** v1 keeps one dialogue box per node. A multi-line / multi-speaker
   dialogue node (many boxes, one node) would cut canvas clutter for long conversations. Worth adding
   after Phase 4 once real conversations exist.
4. **Common event parameters.** v1 has none. If authors start duplicating near-identical common events
   (only an item or a map id differs), add typed parameters.
5. **Map-scoped flags.** Not included. Revisit if per-map resets ("chests respawn on re-entry") become
   common; local flags cover most cases today.
6. **Where do the two data copies live?** `project/` is the source and `game/public/data` a synced copy
   (the working tree currently shows untracked synced files). Confirm the sync script is the only writer
   before adding `project/common/`.
