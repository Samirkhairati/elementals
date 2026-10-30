#!/usr/bin/env node
// Unified dev runner: game (Vite) + editor (Vite + Electron), worktree-aware.
// See AGENTS.md ("Multi-worktree") for the port/offset rules.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatInstallProblems } from './lib/installs.mjs';
import { HELP, buildPlan, describeSource, formatDryRun, formatList } from './lib/plan.mjs';
import { createSupervisor } from './lib/supervisor.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;

async function main() {
  let plan;
  try {
    plan = await buildPlan({ rootDir: ROOT_DIR, argv: process.argv.slice(2) });
  } catch (err) {
    console.error(`${c(31, 'error')}: ${err.message}\n\n${HELP}`);
    return 2;
  }
  const { args, runtime } = plan;

  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args.list || args.dryRun) {
    if (args.json) {
      console.log(JSON.stringify({
        name: plan.worktreeName,
        isWorktree: plan.worktree.isWorktree,
        inGit: plan.worktree.inGit,
        root: plan.worktree.root,
        offset: runtime.offset,
        source: runtime.source,
        preferredOffset: runtime.preferredOffset,
        probed: runtime.probed,
        gamePort: runtime.gamePort,
        editorPort: runtime.editorPort,
        busy: runtime.busy,
        installProblems: plan.installProblems,
        ...(args.dryRun ? { commands: plan.commands } : {}),
      }, null, 2));
    } else {
      console.log(args.dryRun ? formatDryRun(plan) : formatList(plan));
    }
    return 0;
  }

  if (plan.installProblems.length) {
    console.error(`${c(31, 'error')}: ${formatInstallProblems(plan.installProblems)}`);
    return 1;
  }
  if (runtime.busy.length) {
    const what = runtime.busy.map((b) => `${b.name} port ${b.port}`).join(', ');
    console.error(
      `${c(31, 'error')}: ${what} already in use (offset ${runtime.offset}, ${describeSource(runtime)}).\n` +
        '       Is another dev server running for this checkout? Stop it, or choose another\n' +
        '       offset with --offset N / PORT_OFFSET=N (or GAME_PORT / PORT).'
    );
    return 1;
  }

  console.log('\n======================================================');
  console.log(`🚀  ${c('1;32', 'Elementals Unified Dev Server')} — ${c(36, `[${plan.worktreeName}]`)}`);
  console.log('======================================================');
  console.log(`🎮  ${c(1, 'Game Web App:')}      ${c(34, plan.urls.game)}`);
  console.log(`🎨  ${c(1, 'Electron Editor:')}   ${c(35, plan.urls.editor)} (Vite dev server)`);
  console.log(`⚡  ${c(33, `Port offset ${runtime.offset} (${describeSource(runtime)})`)}`);
  console.log('======================================================\n');

  const sup = createSupervisor({ log: (m) => console.log(`${c(33, '[dev]')} ${m}`) });
  sup.installSignalHandlers();
  for (const cmd of plan.commands) {
    sup.start(cmd.name, cmd.command, cmd.args, {
      cwd: cmd.cwd,
      shell: cmd.shell,
      env: { ...process.env, ...cmd.env },
    });
  }
  const code = await sup.done;
  console.log(`${c(33, '[dev]')} all processes stopped (exit ${code})`);
  return code;
}

main().then((code) => process.exit(code));
