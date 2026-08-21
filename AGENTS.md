# Antigravity Agent Guidelines & Worktree Workflow

This document provides conventions and architectural guidelines for AI agents working across multiple git branches and worktrees in the `elementals` project.

---

## 🏗️ Architecture & Packages

* **/game**: Phaser 3 + TypeScript + Vite web game (Default port: `5175`).
* **/editor**: React + Dockview + Vite + Electron map editor (Default port: `5174`).
* **/project**: Shared game data, maps, tilesets, and JSON assets.
* **/scripts**: Utility scripts and launchers.

---

## ⚡ Multi-Worktree & Parallel Agent Guidelines

When multiple agents or worktrees are running simultaneously:
1. **Dynamic Port Support**:
   - `game/vite.config.ts` accepts `PORT` env var (fallback `5175`).
   - `editor/vite.config.ts` and `editor/electron/main.ts` accept `PORT` env var (fallback `5174`).
2. **Standard Port Assignments**:
   - **Main / Workspace 1**:
     - Game: `http://localhost:5175`
     - Editor: `http://localhost:5174`
   - **Worktree 1 (Offset 1)**:
     - Game: `http://localhost:5275`
     - Editor: `http://localhost:5274`
   - **Worktree 2 (Offset 2)**:
     - Game: `http://localhost:5375`
     - Editor: `http://localhost:5374`
3. **Unified Dev Commands**:
   - `npm run dev` or `npm run dev:main`: Launches Main Game (5175) + Editor (5174)
   - `npm run dev:wt`: Launches Worktree Game (5275) + Editor (5274)
   - `node scripts/dev.mjs --offset <N>`: Runs Game + Editor with customized offset.
