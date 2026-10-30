# Antigravity Agent Guidelines & Worktree Workflow

This document provides conventions, guidelines, and dev tooling details for AI agents and developers working across multiple git branches and worktrees in the `elementals` project.

---

## 🏗️ Architecture & Packages

* **/game**: Phaser 3 + TypeScript + Vite web game (Default base port: `5175`).
* **/editor**: React + Dockview + Vite + Electron map editor (Default base port: `5174`).
* **/project**: Shared game data, maps, tilesets, and JSON assets.
* **/scripts**: Utility scripts and dev runners (e.g. `scripts/dev.mjs`).

---

## ⚡ Multi-Worktree & Parallel Agent Guidelines

Several checkouts (the main one plus `git worktree`s) can run their dev servers at the same time without colliding.

### 1. Setup: every worktree needs its own install
Worktrees do **not** share `node_modules`. In each new worktree run once:
```bash
npm install --prefix game
npm install --prefix editor
```
`npm run dev` checks this up front (including the Electron binary) and exits non-zero with the exact command to run if something is missing.

### 2. Ports & stable offsets
Ports are `base + offset * 100` (game base `5175`, editor Vite base `5174`):

| Checkout | Offset | Game | Editor |
|---|---|---|---|
| main checkout | `0` | `5175` | `5174` |
| linked worktree | stable hash of its path, `1..99` | `5175 + offset*100` | `5174 + offset*100` |
| `npm run dev:wt` | `1` | `5275` | `5274` |
| `npm run dev:wt2` | `2` | `5375` | `5374` |

* **Detection** (`scripts/lib/worktree.mjs`) uses git plumbing only: `git rev-parse --show-toplevel`, `--git-dir` vs `--git-common-dir` (they differ in a linked worktree) and `--abbrev-ref HEAD` (detached HEAD is shown as `detached@<shortsha>`). Without git the name falls back to the directory name and the offset to `0`.
* **Offset** for a linked worktree = `1 + sha256(realpath of its root) % 99`. The real path never changes during a worktree's life, so removing or adding *other* worktrees never moves your servers (the old "index in `git worktree list`" scheme did). Branch names are not used because they change on checkout.
* **Probing**: before starting, both derived ports are test-bound (IPv4, IPv6 loopback and wildcard). If either is busy (e.g. a hash collision with another running worktree) the next free offset is used, wrapping within `1..99`, and the banner says so. Main (`0`) and explicit overrides are never probed: if their ports are busy the runner exits with an error instead of moving.
* **Vite uses `strictPort: true`** in both configs, so a collision can never silently land on another port while the banner shows the wrong URL.

### 3. Overrides (highest precedence first)
* `--offset N` (CLI) > `PORT_OFFSET=N` (env) > auto-detected offset.
* `GAME_PORT` overrides the game port, `PORT` overrides the editor port (each independently of the offset).
* `WORKTREE_NAME` overrides the displayed name.
* `game/vite.config.ts` reads `GAME_PORT`, then `PORT`, then `5175`; `editor/vite.config.ts` and `editor/electron/main.ts` read `PORT` (fallback `5174`). `npm run dev --prefix game` / `npm run dev:editor` standalone therefore keep the default ports.

`scripts/dev.mjs` always exports this contract to its children: `WORKTREE_NAME`, `VITE_WORKTREE_NAME`, `GAME_PORT` (both), `PORT` (= game port for the game process, editor port for the editor process).

### 4. Window & Tab Titles
* **Game**: Browser tab title shows `Elementals — [<worktree_name>] (Port: <port>)`.
* **Editor**: Electron window title shows `Elementals Editor — [<worktree_name>] (Port: <port>)`.

### 5. Commands
* `npm run dev`: auto-detects the worktree/offset, launches Game + Electron Editor.
* `npm run dev:wt` / `npm run dev:wt2`: force offset 1 / 2 (no probing; fails if busy).
* `node scripts/dev.mjs --offset <N>`: any custom offset.
* `node scripts/dev.mjs --list`: print worktree, offset and ports (with `[BUSY]` markers), start nothing. Add `--json` for machine-readable output.
* `node scripts/dev.mjs --dry-run`: print the exact commands and env that would be spawned.
* `npm run test:scripts`: unit + integration tests for the runner (temp git repo with real worktrees).

### 6. Shutdown behaviour
Children run in their own process groups (`taskkill /T` on Windows) with no shell wrapper. `Ctrl+C`/`SIGTERM` (or terminal close) stops the entire process tree (SIGTERM, then SIGKILL after 4s; a second `Ctrl+C` force-kills). If **either** the game or the editor exits (Vite crash, Electron window closed or quit) the other is stopped too and the runner exits with the failing code. In dev the editor also quits on macOS when its last window closes, so closing the window stops the whole runner.

### 7. Worktree launcher
`npm run wt` (`scripts/wt.mjs`, helpers in `scripts/lib/wt.mjs`) lists, starts, creates, installs and removes worktrees; it starts a worktree by running *that worktree's own* `scripts/dev.mjs` with its directory as cwd and without leaking `PORT`/`WORKTREE_NAME` from the calling shell. Commands: `list [--json]`, `run <wt> [-- dev.mjs args]`, `new <branch> [--from base] [--no-install]`, `install <wt>`, `rm <wt> [--force] [--yes]`. Tests: `scripts/wt.test.mjs`.
