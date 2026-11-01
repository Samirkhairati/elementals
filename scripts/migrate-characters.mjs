#!/usr/bin/env node
// Moves the v1 sprite assets to Characters v2 + the graphics library. See scripts/lib/migrate-characters.mjs.
import { runCli } from './lib/migrate-characters.mjs'

process.exitCode = runCli(process.argv.slice(2))
