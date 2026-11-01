# Editor browser harness

The editor normally needs Electron: its preload exposes `window.electronAPI`, which reads and writes the
project files (`project/maps`, `project/tilesets`, `project/graphics`, `project/database/characters`, `project/database.json`). The harness lets
the **same editor UI run in a plain browser** against the **real project files**, so every developer, agent and QA
pass can open it, click through it, and read the console without a desktop app.

```
browser tab ──fetch POST /__api/<channel>──▶ Vite dev server ──▶ electron/ipc/projectApi.ts ──▶ project/…
(window.electronAPI shim)                    (vite-plugin-project-api.ts)   (the same stores Electron uses)
```

* `editor/vite-plugin-project-api.ts` – dev-server middleware. Serves the **same channel table** the Electron main
  process registers (`editor/electron/ipc/projectApi.ts`: maps, tilesets, sprites, database), so the two cannot drift.
* `editor/src/lib/browserElectronApi.ts` – `window.electronAPI` shim, installed by `src/main.tsx` only when
  `import.meta.env.DEV && !window.electronAPI`. Inside Electron the real preload wins, so nothing changes there.

## Run it (against a COPY of the project)

Always point it at a copy when you are going to click around: the editor autosaves, so edits land in the files.

```bash
cp -R project /tmp/project-copy                      # or any scratch location
cd editor
ELEMENTALS_PROJECT_DIR=/tmp/project-copy PORT=5199 npx vite --port 5199 --strictPort
# open http://localhost:5199/#/editor
```

* `ELEMENTALS_PROJECT_DIR` – project directory (default `<repo>/project`). The Electron app honours the same variable.
* Use a port that is not taken by `npm run dev` (5174/5175 + offsets); `--strictPort` makes a clash fail loudly.
* Stop it with Ctrl+C / `kill`, then check nothing is left: `lsof -i :5199`.
* `npm run dev` (Electron) is unaffected.

Against the real project (only when you mean to edit it): `cd editor && npx vite --port 5199 --strictPort`.

## What works differently from Electron

| Electron | Browser harness |
|---|---|
| native file dialogs (`pickTilesetFile`, `pickSpriteFile`) | a file input; the chosen PNG is uploaded to a staging directory (`stage-upload`) and its path returned |
| `exportMap` opens a save dialog | the JSON is returned by the server and downloaded by the page |
| app menu events (`onTogglePanel`, `onResetLayout`) | never fire; the functions return unsubscribe functions |
| `importTileset` / `importSprite` read any absolute path | only files staged through `stage-upload` |

The shim also exposes helpers for automation on `window.__elementalsHarness`:

```js
await window.__elementalsHarness.call('get-sprites')                  // any channel, returns { success, … }
const { sourcePath } = await window.__elementalsHarness.stageUpload('flame.png', pngBytes /* Uint8Array */)
await window.electronAPI.importSprite(sourcePath, { name: 'Flame', kind: 'animated', frameWidth: 16, frameHeight: 16 })
```

## Talking to it with curl

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"args":[]}' http://localhost:5199/__api/get-maps
curl -s -X POST -H 'Content-Type: application/json' -d '{"args":[]}' http://localhost:5199/__api/get-sprites
curl -s -X POST -H 'Content-Type: application/json' -d '{"args":["Town",30,20,null]}' http://localhost:5199/__api/create-map
```

Body: `{ "args": [ …channel arguments… ] }`. Answer: the store's result, `{ success: true, … }` or
`{ success: false, error }` (HTTP 200); protocol problems use 4xx. Channels: see `ElectronAPI` in
`src/types/electron.d.ts`; each method calls the channel of the same name in kebab-case
(`getSprites` → `get-sprites`), plus `stage-upload` and `export-map` described above.

## Guard rails

* **Dev server only** – the plugin has `apply: 'serve'`; `vite build` output contains no `__api` code (checked with
  grep on the built bundle: the shim is behind a build-time `import.meta.env.DEV` check and is tree-shaken out).
* **Loopback only** – the plugin is not mounted when the dev server listens on another host (`--host`), it logs why.
  Requests need a loopback `Host` header, `Content-Type: application/json` (a cross-origin page cannot send that
  without a CORS preflight, which is never answered) and, if an `Origin` is sent, it must equal the `Host`.
* **Same path safety as Electron** – every path goes through the stores' `resolveInside`: `..`, absolute paths, NUL
  bytes and symlinks leaving the project are refused. Writes are atomic (temp file + rename).
* **Imports only from staged files** – the server never reads an arbitrary path on request. Staged uploads live in a
  temp directory (`os.tmpdir()/elementals-harness-*`, ≤ 32 MB each) that is removed when the dev server stops.

## Verifying a UI change with it

1. Start it against a copy as above.
2. Open `http://localhost:5199/#/editor`; the console should show
   `[harness] window.electronAPI is served by the Vite dev server (/__api), project files are real.` and no errors.
3. Check the files the UI wrote: `ls /tmp/project-copy/maps`, `git diff --no-index project /tmp/project-copy`.
4. Stop the server and make sure `lsof -i :5199` is empty.

(Vite's HMR WebSocket may log a failed first connection in some embedded browser panes; it reconnects and is
unrelated to the harness.)
