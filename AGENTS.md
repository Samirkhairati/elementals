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

When multiple agents or worktrees are running simultaneously:

### 1. Dynamic Port Support & Auto-Detection
* `scripts/dev.mjs` automatically inspects whether the current working directory is a git worktree or main branch:
  * **Main / Workspace 0**: Game on `http://localhost:5175`, Editor on `http://localhost:5174`.
  * **Worktree 1 (Offset 1)**: Game on `http://localhost:5275`, Editor on `http://localhost:5274`.
  * **Worktree 2 (Offset 2)**: Game on `http://localhost:5375`, Editor on `http://localhost:5374`.
* `game/vite.config.ts` accepts `PORT` env var (fallback `5175`).
* `editor/vite.config.ts` and `editor/electron/main.ts` accept `PORT` env var (fallback `5174`).

### 2. Window & Tab Titles
* **Game**: Browser tab title dynamically displays `Elementals — [<worktree_name>] (Port: <port>)`.
* **Editor**: Electron window title dynamically displays `Elementals Editor — [<worktree_name>] (Port: <port>)`.

### 3. Unified Dev Commands
* `npm run dev`: Automatically detects worktree & offset, launches Game + Electron Editor with zero configuration.
* `npm run dev:wt`: Force offset 1 (Game: 5275, Editor: 5274).
* `npm run dev:wt2`: Force offset 2 (Game: 5375, Editor: 5374).
* `node scripts/dev.mjs --offset <N>`: Run with any custom offset integer.
