# Event triggers: review and proposal

Status: **implemented** (issue #38, schemaVersion 5). Decisions taken: the trigger is split into a start kind plus `blocks`; all
the start kinds below were built (`playerLeave`, `playerNear`, `timer`, `eventLeave`, and `mapEnter` / `mapLeave` on top); there is **no
"repeats" switch**: an author repeats by wiring the last node back in the graph (autorun / parallel states keep their old behaviour through a
migrated-only `repeat` flag); priority is built. The text below is the proposal as written; where the build differs: `onActive` runs once
(blocking by default), `interact` has `range` and `mustFace`, `timer` has `interval`, and only `onActive` / `timer` background runs are
cancelled when their state ends. See docs/game-runtime.md and docs/engine-design.md for how it works.

## What exists today

An event is a list of states; each state has conditions and one **trigger**. The last state whose conditions hold is the active one
(`game/src/events/StateSelector.ts`). The trigger decides when its commands start (`game/src/events/TriggerSystem.ts`):

| Trigger | What starts it | Runs |
|---|---|---|
| `action` | the action key (or a tap) with the entity on the player's tile, in front, or on another neighbour (first match wins, live footprint) | blocking |
| `playerTouch` | the player's step *ends* on a tile the entity covers; also walking into a solid one (bump). Standing still never re-fires, arriving on a map does not fire for the spawn tile | blocking |
| `eventTouch` | another walking entity ends a step on the entity's tiles | blocking |
| `autorun` | as soon as the state is active and nothing else blocks, again and again while it stays active | blocking, repeats |
| `parallel` | as soon as the state is active, again and again while it stays active | background, repeats |

These five are RPG Maker XP's five triggers, name for name. The state / condition model and the behaviours around them (live footprints,
the bump, dropping action presses while input is locked) are good and should stay.

## What is weak for a modern engine

1. **One field answers three questions.** *What starts it* (input, contact, becoming active), *how it runs* (blocks the player or
   not) and *how often* (once, or while active) are all packed into the trigger name. `autorun` means "blocking + repeats", `parallel`
   means "background + repeats". You cannot have "start once when this becomes active" or "background, but only once".
2. **Repeat-by-default is a trap.** An `autorun` that forgets to switch itself off locks the game; the runtime already needs a warning after
   300 restarts (`AUTORUN_WARN_AFTER`). A trigger that is safe by default would not need one.
3. **Only arrival is detectable.** `playerTouch` fires on arrival. There is no "the player leaves", no "the player is inside an area", so
   doors that close behind you, zones with ambient music, or a shop counter need workarounds with switches.
4. **No range or awareness.** Everything is tile contact or an adjacent action key. "An NPC notices the player within 4 tiles" or "a sign
   readable from two tiles away" cannot be expressed.
5. **No time.** Periodic behaviour is a `parallel` state with a Wait command in a loop, which is both heavy and hard to read.
6. **No priority.** When several events cover the same tile the first match wins by entity order, which is not visible or editable.
7. **Names describe the engine, not the author's intent.** "Autorun" and "Event touch" say little to someone who never used RPG Maker.

## Proposal

Keep states, conditions and the active-state rule. Replace the single trigger by **a start kind plus two switches**, and give every
start kind a plain-language name in the editor.

**Start** (one of):

| New | Plain wording in the editor | Replaces |
|---|---|---|
| `interact` | "The player presses Action next to it" (+ optional **range**: 1 tile by default, up to N, and **must face it**) | `action` |
| `playerEnter` | "The player steps onto it" (bump included) | `playerTouch` |
| `playerLeave` | "The player steps off it" | new |
| `eventEnter` | "Another character steps onto it" | `eventTouch` |
| `playerNear` | "The player comes within N tiles" (new, optional line of sight) | new |
| `onActive` | "As soon as this state becomes active" | `autorun`, `parallel` |
| `timer` | "Every N seconds while this state is active" | new |

**Run** (two switches that apply to every start kind):

- **Blocks the player**: yes (a cutscene) or no (background). Default: yes for `interact`, `playerEnter`, `eventEnter`; no for `playerNear`,
  `timer`; asked when authoring `onActive`.
- **Repeats**: *once* (default) or *while this state is active*. The author has to opt in to a loop.

**Priority**: an optional number on the state (default 0). When several events could start from the same input, the highest priority wins,
then the one nearest the player, then entity order. The editor shows the order it will use.

## Migration (behaviour-preserving, no surprises)

The map schema moves from 4 to 5; `shared/engine/migrate.ts` converts on load, idempotently, and nothing is written back until the author edits:

| Old | New |
|---|---|
| `action` | `interact` (range 1, must face: off, the current neighbour rule) |
| `playerTouch` | `playerEnter` |
| `eventTouch` | `eventEnter` |
| `autorun` | `onActive`, blocks, repeats while active |
| `parallel` | `onActive`, background, repeats while active |

So every existing map keeps running exactly as before, and only newly authored states get the safer defaults.

## Work needed if approved

1. `shared/engine`: new trigger and run types, constants, labels, migration + tests (`engine.migrate.shared.test.ts`), validation, `docs/event-graph-spec.md`.
2. Game: split `TriggerSystem` per start kind (enter/leave need the previous tile per entity, `playerNear` a cheap distance check per frame,
   `timer` runs off the game clock), honour *blocks* and *repeats* in `EventRuntime`, priority in the start loops; tests with `makeRig()`.
3. Editor: the Trigger field becomes "When" (the table above, grouped *Player / Other characters / Time*) plus the two switches and, where
   they apply, range and priority; the info icon explains each option.
4. Estimated size: about a week with the tests, the migration being the part to review most carefully.

## Decisions needed

1. Split the trigger into *start + blocks + repeats* as above, or keep five triggers and only add the missing ones (`playerLeave`, `timer`, `playerNear`)?
2. Which new start kinds are worth building now: `playerLeave`, `playerNear`, `timer`? (`playerLeave` is the cheapest and unlocks the most.)
3. Is `autorun`'s repeat-by-default worth keeping as the default for *newly authored* states, or should a new `onActive` state run once unless asked?
4. Do you want priority now, or only when two events actually clash on a tile?
