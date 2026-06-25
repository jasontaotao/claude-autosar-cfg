// Commander.js wiring for `autosarcfg` CLI (v1.6.0 A+C-1).
//
// Per A+C spec §7.1-§7.4 + v1.11.0 BSW generator: 18 unique CLI flags
// across 4 sub-commands plus global flags. Pure parsing — the dispatcher
// in `command-dispatcher.ts` does the actual work. This module is a thin
// adapter over commander.js that:
//   - returns a tagged union (`ParsedArgs`) so callers don't reparse
//   - exports flag-name catalogs for test pinning (silent drops = test fail)
//   - exits 3 on unknown sub-command (per A+C spec §7.5)

import { Command } from 'commander';

import type {
  HeadlessCommand,
  ReadArgs,
  MutateArgs,
  ValidateArgs,
  GenerateArgs,
} from '../shared/headless/ipc-contract.js';

/** Flag catalog — exported so commander.test.ts pins the surface. */
export const GLOBAL_FLAG_NAMES = [
  '--project',
  '--locale',
  '--format',
  '--verbose',
  '--quiet',
  '--no-color',
  '--platform',
] as const;

export const READ_FLAG_NAMES = ['--paths', '--summary-only'] as const;
export const MUTATE_FLAG_NAMES = ['--patch', '--dry-run', '--strict', '--backup'] as const;
export const VALIDATE_FLAG_NAMES = ['--rules', '--severity'] as const;
export const GENERATE_FLAG_NAMES = [
  '--variant',
  '--out-dir',
  '--modules',
  '--strict',
] as const;

/** Parsed global flags (apply to every sub-command). */
export interface GlobalFlags {
  readonly projectPath: string;
  readonly locale?: 'en' | 'zh';
  readonly verbose: boolean;
  readonly quiet: boolean;
  readonly noColor: boolean;
  readonly streaming?: boolean;
  readonly cache?: boolean;
  readonly platform?: string;
}

/** Discriminated union of all 4 sub-command inputs + global flags. */
export type ParsedArgs =
  | { readonly kind: 'read'; readonly global: GlobalFlags; readonly input: ReadArgs }
  | {
      readonly kind: 'mutate';
      readonly global: GlobalFlags;
      readonly input: MutateArgs & { strict: boolean; backup: boolean };
    }
  | { readonly kind: 'validate'; readonly global: GlobalFlags; readonly input: ValidateArgs }
  | {
      readonly kind: 'generate';
      readonly global: GlobalFlags;
      readonly input: GenerateArgs & { strict: boolean };
    };

/**
 * Build a commander.js `Command` tree with all 4 sub-commands + global
 * flags. Exported for the bin entry; tests use `parseCliArgs` directly.
 */
export function buildCommand(): Command {
  const root = new Command();
  root
    .name('autosarcfg')
    .description('Standalone CLI for AUTOSAR BSW configuration (v1.6.0 A+C)')
    .version('1.6.0');

  // --- Global flags (apply to every sub-command) ---
  root
    .option('--project <path>', 'Path to .autosarcfg.json manifest or a single .arxml')
    .option('--locale <en|zh>', 'Error message locale', 'en')
    .option('--format <fmt>', 'Output format: json | summary | arxml-dump', 'summary')
    .option('--verbose', 'Emit structured debug logs to stderr', false)
    .option('--quiet', 'Suppress the human-readable summary on success', false)
    .option('--no-color', 'Disable ANSI color codes in summary output')
    .option('--streaming', 'Override experimental.streaming (--no-streaming forces DOM)', true)
    .option('--no-cache', 'Disable experimental.indexedDb cache for this invocation')
    .option('--platform <p>', 'Override detected platform (darwin | win32 | linux)');

  // --- read sub-command ---
  root
    .command('read')
    .description('Dump project as JSON / arxml summary')
    .option(
      '--paths <glob>',
      'Restrict to specific paths (POSIX extended-glob; repeatable)',
      collectPaths,
      [] as string[],
    )
    .option('--summary-only', 'Emit only the summary object, not the full document', false)
    .action(function (this: Command) {
      // Action is a no-op; the dispatcher reads opts via .opts().
    });

  // --- mutate sub-command ---
  root
    .command('mutate')
    .description('Apply a JSON/YAML patch file')
    .requiredOption('--patch <path>', "Path to patch file, or '-' for stdin")
    .option('--dry-run', 'Compute without writing', false)
    .option('--strict', 'Treat any warning as exit 1', false)
    .option('--no-backup', 'Skip <file>.bak-<timestamp> before atomic rename')
    .action(function (this: Command) {
      // No-op action; dispatcher handles execution.
    });

  // --- validate sub-command ---
  root
    .command('validate')
    .description('Run validators against the project (stub in v1.6.0)')
    .option(
      '--rules <id>',
      'Restrict to specific rule IDs (reserved for G cluster)',
      collectPaths,
      [] as string[],
    )
    .option('--severity <s>', 'Filter output by severity: error | warning | info', 'all')
    .action(function (this: Command) {
      // No-op action; dispatcher handles execution.
    });

  // --- generate sub-command (v1.11.0 BSW code generator) ---
  root
    .command('generate')
    .description(
      'Run BSW code generator pipeline (PreCompile | Link | PostBuild) and emit files to <outDir>',
    )
    .option(
      '--variant <v>',
      'Generation variant: PreCompile | Link | PostBuild (default: PreCompile)',
      'PreCompile',
    )
    .option(
      '--out-dir <path>',
      'Output directory for generated files (default: <projectPath>/generated)',
    )
    .option(
      '--modules <shortName>',
      'Restrict generation to specific module short names (repeatable)',
      collectPaths,
      [] as string[],
    )
    .option('--strict', 'Promote any WARNING to exit 1', false)
    .action(function (this: Command) {
      // No-op action; dispatcher handles execution.
    });

  // Reject unknown commands before commander exits silently.
  root.exitOverride();

  return root;
}

/** Helper: collect repeatable flag values into a `string[]`. */
function collectPaths(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/**
 * Parse `argv` (process.argv-style) into a `ParsedArgs` discriminated
 * union. Throws on validation errors — caller maps to exit 3.
 */
export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  // Commander expects argv[0] = node, argv[1] = script.
  const cmd = buildCommand();
  // Parse into cmd tree; suppress commander's own exit by catching.
  cmd.parse([...argv]);

  // The sub-command (if any) is attached to `cmd` as `args` after parse.
  const subArgs = cmd.args;
  if (subArgs.length === 0) {
    throw new Error('Missing sub-command. Use `autosarcfg read|mutate|validate|generate`.');
  }

  const subName = subArgs[0];
  const subCmd = cmd.commands.find((c) => c.name() === subName);
  if (subCmd === undefined) {
    throw new Error(`Unknown sub-command: ${subName}`);
  }

  // Pull global options from root + sub-command-specific options.
  const rootOpts = cmd.opts<Record<string, unknown>>();
  const subOpts = subCmd.opts<Record<string, unknown>>();

  const global = readGlobalFlags(rootOpts);
  const format = pickFormat(rootOpts['format']);

  switch (subName) {
    case 'read':
      return {
        kind: 'read',
        global,
        input: {
          projectPath: global.projectPath,
          paths: (subOpts['paths'] as string[] | undefined) ?? [],
          format: (subOpts['summaryOnly'] as boolean | undefined) === true ? 'summary' : format,
        },
      };
    case 'mutate':
      return {
        kind: 'mutate',
        global,
        input: {
          projectPath: global.projectPath,
          patch: subOpts['patch'] as string,
          format,
          dryRun: (subOpts['dryRun'] as boolean | undefined) === true,
          strict: (subOpts['strict'] as boolean | undefined) === true,
          backup: (subOpts['backup'] as boolean | undefined) !== false, // --no-backup sets this to false
        },
      };
    case 'validate':
      return {
        kind: 'validate',
        global,
        input: {
          projectPath: global.projectPath,
          format,
          stub: true,
        },
      };
    case 'generate':
      return {
        kind: 'generate',
        global,
        input: {
          command: 'generate',
          projectPath: global.projectPath,
          variant: pickVariant(subOpts['variant']),
          ...(typeof subOpts['outDir'] === 'string' ? { outDir: subOpts['outDir'] } : {}),
          ...(Array.isArray(subOpts['modules']) && subOpts['modules'].length > 0
            ? { modules: subOpts['modules'] as string[] }
            : {}),
          strict: (subOpts['strict'] as boolean | undefined) === true,
          // `generate` inherits --format from root (not registered as its own
          // option). `pickGenerateFormat` normalises the wider global domain
          // ('json' | 'summary' | 'arxml-dump') down to the generate domain
          // ('human' | 'json'); values other than 'json' silently fall back
          // to 'human' per pickGenerateFormat's contract.
          format: pickGenerateFormat(rootOpts['format']),
        },
      };
    default:
      throw new Error(`Unhandled sub-command: ${String(subName)}`);
  }
}

function readGlobalFlags(opts: Record<string, unknown>): GlobalFlags {
  const localeRaw = opts['locale'];
  const locale: 'en' | 'zh' | undefined =
    localeRaw === 'en' || localeRaw === 'zh' ? localeRaw : undefined;

  const streamingRaw = opts['streaming'];
  const cacheRaw = opts['cache'];
  const platformRaw = opts['platform'];

  return {
    projectPath: (opts['project'] as string | undefined) ?? '',
    ...(locale !== undefined ? { locale } : {}),
    verbose: opts['verbose'] === true,
    quiet: opts['quiet'] === true,
    noColor: opts['color'] === false, // --no-color sets color=false
    ...(typeof streamingRaw === 'boolean' ? { streaming: streamingRaw } : {}),
    ...(typeof cacheRaw === 'boolean' ? { cache: cacheRaw } : {}),
    ...(typeof platformRaw === 'string' ? { platform: platformRaw } : {}),
  };
}

function pickFormat(raw: unknown): 'json' | 'summary' {
  return raw === 'json' ? 'json' : 'summary';
}

function pickVariant(raw: unknown): 'PreCompile' | 'Link' | 'PostBuild' {
  if (raw === 'PreCompile' || raw === 'Link' || raw === 'PostBuild') return raw;
  throw new Error(
    `Invalid --variant '${String(raw)}': expected PreCompile | Link | PostBuild`,
  );
}

function pickGenerateFormat(raw: unknown): 'human' | 'json' {
  return raw === 'json' ? 'json' : 'human';
}

// Re-export HeadlessCommand for callers that want the wire type.
export type { HeadlessCommand };
