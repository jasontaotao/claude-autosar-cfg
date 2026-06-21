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
//   2 = partial success (>=1 warning)
//   3 = invalid input (bad flag, bad patch, unsupported version)
//
// For v1.6.0 the bin invokes Node's experimental TS strip-types via
// `--import` + register() (more reliable than --loader on Windows).
// The published npm package will bundle the CLI into a single ESM file
// via esbuild (out of scope for v1.6.0 PR(A+C-5)).

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Register the .js → .ts loader at the repo root before any user code
// runs. This MUST happen before the dynamic import of src/cli/index.ts.
register(
  pathToFileURL(resolve(__dirname, 'ts-loader.mjs')).href,
  pathToFileURL(resolve(__dirname, '..')),
);

const { dispatchCommand, parseCliArgs } = await import(
  pathToFileURL(resolve(__dirname, '../src/cli/index.ts')).href
);

async function main() {
  try {
    const parsed = parseCliArgs(process.argv);
    const code = await dispatchCommand(parsed);
    process.exit(code);
  } catch (err) {
    process.stderr.write(`[autosarcfg] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(3);
  }
}

void main();