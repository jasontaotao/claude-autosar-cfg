// Commander wiring tests (v1.6.0 A+C-1).
//
// Per A+C spec §7.1-§7.4: 16 CLI flags across 4 sub-commands plus
// global flags. Pin the flag catalog so a refactor that drops or
// renames a flag fails this test (silent CLI regressions are worse
// than loud ones).

import { describe, it, expect } from 'vitest';

import {
  parseCliArgs,
  GLOBAL_FLAG_NAMES,
  READ_FLAG_NAMES,
  MUTATE_FLAG_NAMES,
  VALIDATE_FLAG_NAMES,
  GENERATE_FLAG_NAMES,
} from '../commander.js';

describe('commander — global flag catalog', () => {
  it('exposes all 7 global flag names', () => {
    expect(GLOBAL_FLAG_NAMES).toEqual([
      '--project',
      '--locale',
      '--format',
      '--verbose',
      '--quiet',
      '--no-color',
      '--platform',
    ]);
  });
});

describe('commander — read sub-command flags', () => {
  it('exposes --paths and --summary-only', () => {
    expect(READ_FLAG_NAMES).toContain('--paths');
    expect(READ_FLAG_NAMES).toContain('--summary-only');
  });

  it('parses --project and --format for read', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'read',
      '--project',
      '/tmp/p.json',
      '--format',
      'json',
    ]);
    expect(parsed.kind).toBe('read');
    if (parsed.kind === 'read') {
      expect(parsed.input.projectPath).toBe('/tmp/p.json');
      expect(parsed.input.format).toBe('json');
    }
  });

  it('defaults read format to summary', () => {
    const parsed = parseCliArgs(['node', 'autosarcfg', 'read', '--project', '/tmp/p.json']);
    if (parsed.kind === 'read') {
      expect(parsed.input.format).toBe('summary');
    }
  });

  it('captures --paths as repeatable string[]', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'read',
      '--project',
      '/tmp/p.json',
      '--paths',
      '/foo',
      '--paths',
      '/bar',
    ]);
    if (parsed.kind === 'read') {
      expect(parsed.input.paths).toEqual(['/foo', '/bar']);
    }
  });
});

describe('commander — mutate sub-command flags', () => {
  it('exposes --patch, --dry-run, --strict, --backup', () => {
    expect(MUTATE_FLAG_NAMES).toContain('--patch');
    expect(MUTATE_FLAG_NAMES).toContain('--dry-run');
    expect(MUTATE_FLAG_NAMES).toContain('--strict');
    expect(MUTATE_FLAG_NAMES).toContain('--backup');
  });

  it('parses required --patch and optional --dry-run --strict', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'mutate',
      '--project',
      '/tmp/p.json',
      '--patch',
      './fix.yaml',
      '--dry-run',
      '--strict',
    ]);
    expect(parsed.kind).toBe('mutate');
    if (parsed.kind === 'mutate') {
      expect(parsed.input.patch).toBe('./fix.yaml');
      expect(parsed.input.dryRun).toBe(true);
      expect(parsed.input.strict).toBe(true);
    }
  });

  it('defaults dryRun to false', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'mutate',
      '--project',
      '/tmp/p.json',
      '--patch',
      './fix.yaml',
    ]);
    if (parsed.kind === 'mutate') {
      expect(parsed.input.dryRun).toBe(false);
    }
  });

  it('defaults backup to true (atomic-rename safety per A+C Q2)', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'mutate',
      '--project',
      '/tmp/p.json',
      '--patch',
      './fix.yaml',
    ]);
    if (parsed.kind === 'mutate') {
      expect(parsed.input.backup).toBe(true);
    }
  });
});

describe('commander — validate sub-command flags', () => {
  it('exposes --rules and --severity', () => {
    expect(VALIDATE_FLAG_NAMES).toContain('--rules');
    expect(VALIDATE_FLAG_NAMES).toContain('--severity');
  });

  it('parses --project for validate', () => {
    const parsed = parseCliArgs(['node', 'autosarcfg', 'validate', '--project', '/tmp/p.json']);
    expect(parsed.kind).toBe('validate');
    if (parsed.kind === 'validate') {
      expect(parsed.input.projectPath).toBe('/tmp/p.json');
      expect(parsed.input.stub).toBe(true); // v1 stub flag
    }
  });
});

describe('commander — generate sub-command flags', () => {
  it('exposes --variant, --out-dir, --modules, --strict', () => {
    expect(GENERATE_FLAG_NAMES).toEqual([
      '--variant',
      '--out-dir',
      '--modules',
      '--strict',
    ]);
  });

  it('parses --project and defaults variant to PreCompile', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      '/tmp/p.autosarcfg.json',
    ]);
    expect(parsed.kind).toBe('generate');
    if (parsed.kind === 'generate') {
      expect(parsed.input.projectPath).toBe('/tmp/p.autosarcfg.json');
      expect(parsed.input.variant).toBe('PreCompile');
      expect(parsed.input.command).toBe('generate');
      expect(parsed.input.strict).toBe(false);
    }
  });

  it('parses explicit --variant values', () => {
    for (const v of ['PreCompile', 'Link', 'PostBuild']) {
      const parsed = parseCliArgs([
        'node',
        'autosarcfg',
        'generate',
        '--project',
        '/tmp/p.json',
        '--variant',
        v,
      ]);
      if (parsed.kind === 'generate') {
        expect(parsed.input.variant).toBe(v);
      }
    }
  });

  it('rejects unknown --variant values', () => {
    expect(() =>
      parseCliArgs([
        'node',
        'autosarcfg',
        'generate',
        '--project',
        '/tmp/p.json',
        '--variant',
        'Runtime',
      ]),
    ).toThrow(/Invalid --variant/);
  });

  it('captures --out-dir verbatim', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      '/tmp/p.json',
      '--out-dir',
      '/tmp/out',
    ]);
    if (parsed.kind === 'generate') {
      expect(parsed.input.outDir).toBe('/tmp/out');
    }
  });

  it('omits outDir and modules when not provided (handler applies defaults)', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      '/tmp/p.json',
    ]);
    if (parsed.kind === 'generate') {
      expect(parsed.input.outDir).toBeUndefined();
      expect(parsed.input.modules).toBeUndefined();
    }
  });

  it('collects --modules as repeatable string[]', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      '/tmp/p.json',
      '--modules',
      'EcuC',
      '--modules',
      'Wdg',
    ]);
    if (parsed.kind === 'generate') {
      expect(parsed.input.modules).toEqual(['EcuC', 'Wdg']);
    }
  });

  it('captures --strict as true when present', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      '/tmp/p.json',
      '--strict',
    ]);
    if (parsed.kind === 'generate') {
      expect(parsed.input.strict).toBe(true);
    }
  });

  it('defaults generate format to human and accepts --format json', () => {
    const human = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      '/tmp/p.json',
    ]);
    const json = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      '/tmp/p.json',
      '--format',
      'json',
    ]);
    if (human.kind === 'generate') expect(human.input.format).toBe('human');
    if (json.kind === 'generate') expect(json.input.format).toBe('json');
  });

  it('no longer throws "Unhandled sub-command: generate" (regression for missing wiring)', () => {
    expect(() =>
      parseCliArgs(['node', 'autosarcfg', 'generate', '--project', '/tmp/p.json']),
    ).not.toThrow();
  });
});

describe('commander — global flags', () => {
  it('captures --verbose / --quiet / --no-color', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'read',
      '--project',
      '/tmp/p.json',
      '--verbose',
      '--quiet',
      '--no-color',
    ]);
    expect(parsed.global.verbose).toBe(true);
    expect(parsed.global.quiet).toBe(true);
    expect(parsed.global.noColor).toBe(true);
  });

  it('captures --platform override', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'read',
      '--project',
      '/tmp/p.json',
      '--platform',
      'linux',
    ]);
    expect(parsed.global.platform).toBe('linux');
  });

  it('captures --locale override (en | zh)', () => {
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'read',
      '--project',
      '/tmp/p.json',
      '--locale',
      'zh',
    ]);
    expect(parsed.global.locale).toBe('zh');
  });

  it('rejects unknown sub-command', () => {
    expect(() =>
      parseCliArgs(['node', 'autosarcfg', 'frobnicate', '--project', '/tmp/p.json']),
    ).toThrow();
  });
});

describe('commander — flag count gate (18 unique)', () => {
  it('exposes exactly 18 unique flags across catalogs (deduplicates --strict shared between mutate + generate)', () => {
    // Global: --project --locale --format --verbose --quiet --no-color --platform (7)
    // Read: --paths --summary-only (2)
    // Mutate: --patch --dry-run --strict --backup (4)
    // Validate: --rules --severity (2)
    // Generate: --variant --out-dir --modules --strict (4)
    // Catalog total: 7 + 2 + 4 + 2 + 4 = 19.
    // Shared flag: --strict appears in MUTATE_FLAG_NAMES and GENERATE_FLAG_NAMES
    // (commander scopes per-sub-command options, so no runtime collision; but
    // the catalog count counts it twice). Unique flags: 19 - 1 = 18.
    // --format is a global flag only (not in any sub-command catalog), so it
    // is not double-counted.
    const total =
      GLOBAL_FLAG_NAMES.length +
      READ_FLAG_NAMES.length +
      MUTATE_FLAG_NAMES.length +
      VALIDATE_FLAG_NAMES.length +
      GENERATE_FLAG_NAMES.length;
    // --strict is shared between mutate and generate; subtract once.
    expect(total - 1).toBe(18);
  });
});
