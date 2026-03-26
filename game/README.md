# Phaser + TypeScript + Vite Game

This project is a boilerplate for a Phaser 3 game using TypeScript and Vite.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run in Development:**
    ```bash
    npm run dev
    ```

3.  **Build for Production:**
    ```bash
    npm run build
    ```

## Project Structure

- `src/main.ts`: Entry point and game configuration.
- `src/scenes/`: Contains all Phaser scenes.
- `src/style.css`: Global styles.
- `public/assets/`: Static assets (images, audio, etc.).

## Scenes

- **Boot**: Initial asset loading for preloader.
- **Preloader**: Progress bar and main asset loading.
- **MainMenu**: Game start screen.
- **Game**: Core gameplay scene.
- **GameOver**: End screen.
