// Pre-flight check that each sub-package has its own installed dependencies.
// Worktrees do NOT share node_modules with the main checkout.
import fs from 'node:fs';
import path from 'node:path';

/**
 * Returns a list of { pkg, missing, fix } problems (empty when all is well).
 */
export function checkInstalls(rootDir, { exists = fs.existsSync, readFile = fs.readFileSync } = {}) {
  const problems = [];
  const gameDir = path.join(rootDir, 'game');
  const editorDir = path.join(rootDir, 'editor');

  if (!exists(path.join(gameDir, 'node_modules', 'vite'))) {
    problems.push({
      pkg: 'game',
      missing: 'game/node_modules (vite)',
      fix: 'npm install --prefix game',
    });
  }

  if (!exists(path.join(editorDir, 'node_modules', 'vite'))) {
    problems.push({
      pkg: 'editor',
      missing: 'editor/node_modules (vite)',
      fix: 'npm install --prefix editor',
    });
  } else {
    // The electron package may be present while its binary download failed.
    const electronDir = path.join(editorDir, 'node_modules', 'electron');
    let binaryOk = false;
    try {
      const rel = String(readFile(path.join(electronDir, 'path.txt'), 'utf8')).trim();
      binaryOk = rel !== '' && exists(path.join(electronDir, 'dist', rel));
    } catch {
      binaryOk = false;
    }
    if (!binaryOk) {
      problems.push({
        pkg: 'editor',
        missing: 'Electron binary (editor/node_modules/electron/dist)',
        fix: 'npm install --prefix editor  (or: node editor/node_modules/electron/install.js)',
      });
    }
  }
  return problems;
}

export function formatInstallProblems(problems) {
  const lines = ['Dependencies are missing (each worktree needs its own install):'];
  for (const p of problems) lines.push(`  - ${p.missing}\n      fix: ${p.fix}`);
  return lines.join('\n');
}
