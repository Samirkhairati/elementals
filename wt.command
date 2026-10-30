#!/bin/bash
# Double-click in Finder (or run ./wt.command) to open the Elementals worktree launcher.
cd "$(dirname "$0")" || exit 1
node scripts/wt.mjs "$@"
status=$?
# Keep the Terminal window open if the launcher failed so the message can be read.
if [ $status -ne 0 ]; then echo; read -r -p "Press Enter to close..." _; fi
exit $status
