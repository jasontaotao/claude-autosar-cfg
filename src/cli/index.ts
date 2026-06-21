// src/cli/index.ts — public entry point for the headless CLI module.
//
// Per A+C spec §3 module map: this file re-exports the stable API used
// by both the `bin/autosarcfg.mjs` entry and the integration tests.
// Callers can `import { dispatchCommand, parseCliArgs } from 'src/cli/index.js'`
// without touching the internal sub-paths.

export { parseCliArgs, buildCommand, GLOBAL_FLAG_NAMES, READ_FLAG_NAMES, MUTATE_FLAG_NAMES, VALIDATE_FLAG_NAMES } from './commander.js';
export type { ParsedArgs, GlobalFlags } from './commander.js';
export {
  EXIT_SUCCESS,
  EXIT_FATAL,
  EXIT_WARNING,
  EXIT_INVALID_INPUT,
  ALL_EXIT_CODES,
  isValidExitCode,
  exitCodeToString,
} from './exitCodes.js';
export type { HeadlessExitCode } from './exitCodes.js';
export { dispatchCommand } from './command-dispatcher.js';
export { parsePatchDocument, parsePatchJson, parsePatchYaml } from './patch-parser.js';
export { readHeadlessProject } from './handlers/read.js';
export { mutateHeadlessProject } from './handlers/mutate.js';
export { validateHeadlessProject } from './handlers/validate.js';