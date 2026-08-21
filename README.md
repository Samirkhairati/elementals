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
```bash
npm install --prefix game
npm install --prefix editor
```

### Start Development
Simply run in any workspace or worktree:
```bash
npm run dev
```
* Starts the Phaser Game in your default browser.
* Starts the Electron Editor desktop window.
* **Multi-worktree ready:** Automatically assigns isolated ports (`5175`/`5174` for main, `5275`/`5274` for worktree 1, etc.) and tags window titles with your worktree name.

---

## 📖 Additional Docs

* See [`AGENTS.md`](./AGENTS.md) for multi-worktree guidelines and architecture details.
* See [`editor/README.md`](./editor/README.md) for editor-specific instructions.
