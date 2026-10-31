#!/usr/bin/env node
// Generates the game's sprite / database / tileset inputs from project/ and reports drift.
// See docs/engine-design.md (section 2). All logic lives in scripts/lib/assets.mjs.
import { runCli } from './lib/assets.mjs'

process.exitCode = runCli(process.argv.slice(2))
