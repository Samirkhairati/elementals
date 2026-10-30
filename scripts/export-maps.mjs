#!/usr/bin/env node
// Converts editor maps (project/maps) to the Tiled JSON the game loads and reports drift.
// See docs/maps.md. All logic lives in scripts/lib/maps.mjs.
import { runCli } from './lib/maps.mjs'

process.exitCode = runCli(process.argv.slice(2))
