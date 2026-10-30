# Elementals

A 2D tile-based game and desktop map editor engine.

---

## 📦 Project Structure

* **`game/`**: Web-based Phaser 3 + TypeScript game.
* **`editor/`**: React + Dockview + Electron desktop map editor.
* **`project/`**: Shared maps, tilesets, and JSON data.
* **`scripts/`**: Development runners and utilities.

---

## 🚀 Quick Start

### Install Dependencies
Each checkout (and every `git worktree`) needs its own install; `node_modules` is not shared:
```bash
npm install --prefix game
npm install --prefix editor
```

### Start Development
Simply run in any workspace or worktree:
```bash
npm run dev
```
* Starts the Phaser Game dev server (`http://localhost:5175` in the main checkout).
* Starts the Electron Editor (Vite on `http://localhost:5174` in the main checkout).
* If either process exits, or on `Ctrl+C`, everything is shut down together.
* Missing installs or busy ports stop the runner with an actionable message instead of failing halfway.

### Multi-worktree
Ports are `base + offset * 100`. The main checkout uses offset `0`; each linked worktree gets a **stable offset `1..99` hashed from its path** (so removing other worktrees never moves your servers), and is moved to the next free offset if its ports are busy. Window/tab titles show the worktree name.

| | Game | Editor |
|---|---|---|
| main | `5175` | `5174` |
| `npm run dev:wt` (offset 1) | `5275` | `5274` |
| `npm run dev:wt2` (offset 2) | `5375` | `5374` |

Useful flags: `node scripts/dev.mjs --list` (show worktree, offset and ports), `--dry-run` (show commands/env), `--offset N`. Env overrides: `PORT_OFFSET`, `GAME_PORT`, `PORT`, `WORKTREE_NAME`. See [`AGENTS.md`](./AGENTS.md) for the full rules.

---

## 📖 Additional Docs

* See [`AGENTS.md`](./AGENTS.md) for multi-worktree guidelines and architecture details.
* See [`editor/README.md`](./editor/README.md) for editor-specific instructions.
