# Elementals Editor

This is an Electron + React project built with Vite and TypeScript.

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
    *Note: If you encounter network errors during Electron download, try running it again.*

2.  **Run in Development**:
    ```bash
    npm run electron:dev
    ```
    This will start the Vite dev server and then launch Electron.

3.  **Build for Production**:
    ```bash
    npm run electron:build
    ```

## Project Structure

- `src/`: React source code (rendered in the browser/Electron window).
- `electron/`: Electron main process and preload scripts.
- `vite.config.ts`: Vite configuration.
- `tsconfig.json`: TypeScript configuration.
