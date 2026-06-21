#!/usr/bin/env node
// bin/autosarcfg.mjs — entry point for the standalone `autosarcfg` CLI.
//
// Per A+C spec §7.6: standalone Node, no Electron, no daemon. Each
// invocation is a fresh process; the CLI does not consult the
// `experimental.headlessCli` feature flag (the flag only gates the
// future GUI "Run CLI" button per A+C spec Q6 A).
//
// Exit codes (per A+C spec §7.5):
//   0 = success
//   1 = fatal error (parse, IO, internal)
//   2 = partial success (≥1 warning)
//   3 = invalid input (bad flag, bad patch, unsupported version)

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT_INVALID_INPUT, EXIT_FATAL, isValidExitCode } from '../src/cli/exitCodes.js';
import { parseCliArgs } from '../src/cli/commander.js';
import { dispatchCommand } from '../src/cli/command-dispatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve the project root (one level up from bin/, when invoked from
 * the repo). Used to locate `node_modules/commander` when the bin is
 * not symlinked into a global location.
 */
function resolveEntryPoint(): string {
  // src/cli/* — run via tsx/vite-resolve; in published builds the bin
  // is symlinked and Node resolves src/ via the package's exports.
  // For v1.6.0 development, point at the compiled ESM tree if present,
  // otherwise fall back to the source tree (tsx / node --import).
  const compiled = resolve(__dirname, '../dist/cli/index.js');
  if (existsSync(compiled)) return compiled;
  return resolve(__dirname, '../src/cli/index.ts');
}

async function main(): Promise<void> {
  try {
    const parsed = parseCliArgs(process.argv);
    const exitCode = await dispatchCommand(parsed);
    if (!isValidExitCode(exitCode)) {
      process.stderr.write(`[autosarcfg] internal: invalid exit code ${exitCode}\n`);
      process.exit(EXIT_FATAL);
    }
    process.exit(exitCode);
  } catch (err) {
    // Bad CLI usage / unknown sub-command / unhandled validation.
    process.stderr.write(`[autosarcfg] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(EXIT_INVALID_INPUT);
  }
}

void main();