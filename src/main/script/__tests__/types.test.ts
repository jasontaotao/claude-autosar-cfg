import { describe, it, expect } from 'vitest';

import {
  classScriptError,
  RESERVED_SHORTNAMES,
  SHORTNAME_RE,
  SHORTNAME_MIN,
  SHORTNAME_MAX,
  validateShortName,
  ScriptError,
} from '../errors.js';
import type { ScriptEntry, ScriptKind } from '../types.js';

// ---------------------------------------------------------------------------
// ScriptEntry round-trip with manifest
// ---------------------------------------------------------------------------

describe('ScriptEntry + manifest.scripts[]', () => {
  const SCRIPT: ScriptEntry = {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'PduId Uniqueness',
    shortName: 'pduid-uniqueness',
    kind: 'validator',
    source: '// user source',
    imports: [{ from: 'path-utils', names: ['joinPath'] }],
    updatedAt: '2026-06-18T00:00:00.000Z',
  };

  it('round-trips a manifest with a single script through save+load', async () => {
    const { loadManifest, saveManifest } = await import('../../../core/project/manifest.js');
    const m = {
      schemaVersion: '1' as const,
      id: 'aaaa',
      name: 't',
      valueArxmlPaths: [],
      bswmdPaths: [],
      scripts: [SCRIPT],
    };
    const json = saveManifest(m);
    const loaded = loadManifest(json);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.scripts).toHaveLength(1);
      expect(loaded.value.scripts?.[0]?.shortName).toBe('pduid-uniqueness');
      expect(loaded.value.scripts?.[0]?.kind).toBe('validator');
    }
  });

  it('normalises legacy manifest (no scripts field) to scripts=[]', async () => {
    const { loadManifest, saveManifest } = await import('../../../core/project/manifest.js');
    // Build JSON manually so we can OMIT `scripts` (legacy shape).
    const legacy = {
      schemaVersion: '1',
      id: 'bbbb',
      name: 'legacy',
      valueArxmlPaths: [],
      bswmdPaths: [],
    };
    const json = JSON.stringify(legacy);
    const loaded = loadManifest(json);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      // Backward-compat: scripts field is normalised to [] not undefined
      expect(loaded.value.scripts).toEqual([]);
    }
    // Save→load round-trip also yields []
    const resaved = saveManifest(loaded.ok ? (loaded.value as never) : (legacy as never));
    const reloaded = loadManifest(resaved);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value.scripts).toEqual([]);
    }
  });

  it('ScriptKind union has all 4 spec values', () => {
    const kinds: ScriptKind[] = ['validator', 'transformer', 'report', 'free'];
    expect(kinds).toHaveLength(4);
  });

  it('createEmptyManifest seeds scripts=[]', async () => {
    const { createEmptyManifest } = await import('../../../core/project/manifest.js');
    const m = createEmptyManifest('Fresh');
    expect(m.scripts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ScriptErrorKind + factory
// ---------------------------------------------------------------------------

describe('ScriptError factory', () => {
  it('classScriptError produces an Error with payload', () => {
    const e = classScriptError('unknown-module', "module './x' not found", { from: 'x' });
    expect(e).toBeInstanceOf(ScriptError);
    expect(e).toBeInstanceOf(Error);
    expect(e.payload.kind).toBe('unknown-module');
    expect(e.payload.message).toMatch(/not found/);
    expect(e.payload.meta).toEqual({ from: 'x' });
    // Error message is forwarded for stack-trace consumers
    expect(e.message).toBe(e.payload.message);
    expect(e.name).toBe('ScriptError');
  });
});

// ---------------------------------------------------------------------------
// validateShortName
// ---------------------------------------------------------------------------

describe('validateShortName', () => {
  it('accepts a valid kebab-case identifier', () => {
    expect(validateShortName('pduid-uniqueness')).toBeNull();
    expect(validateShortName('a-b-c-1')).toBeNull();
    expect(validateShortName('com-pdu-id-checker')).toBeNull();
  });

  it('rejects too-short shortName', () => {
    const e = validateShortName('ab');
    expect(e).not.toBeNull();
    expect(e?.payload.kind).toBe('shortname-length');
  });

  it('rejects too-long shortName', () => {
    const long = 'a'.repeat(SHORTNAME_MAX + 1);
    const e = validateShortName(long);
    expect(e).not.toBeNull();
    expect(e?.payload.kind).toBe('shortname-length');
  });

  it('rejects upper-case / underscore / leading-digit', () => {
    expect(validateShortName('PduidCheck')?.payload.kind).toBe('shortname-format');
    expect(validateShortName('pdu_id')?.payload.kind).toBe('shortname-format');
    expect(validateShortName('1pduid')?.payload.kind).toBe('shortname-format');
  });

  it('rejects reserved shortName (ctx API collision)', () => {
    for (const reserved of ['ctx', 'project', 'log', 'utils', 'validator', 'manifest']) {
      const e = validateShortName(reserved);
      expect(e, `expected "${reserved}" to be reserved`).not.toBeNull();
      expect(e?.payload.kind).toBe('reserved-shortname');
    }
  });

  it('rejects reserved prototype-pollution names', () => {
    // Note: 'constructor' / 'prototype' are valid kebab-case format but
    // are reserved (prototype-chain guard). '__proto__' and
    // 'hasOwnProperty' contain `_` and fail the format check FIRST.
    for (const reserved of ['constructor', 'prototype']) {
      const e = validateShortName(reserved);
      expect(e, `expected "${reserved}" to be reserved`).not.toBeNull();
      expect(e?.payload.kind).toBe('reserved-shortname');
    }
    // __proto__ + hasOwnProperty are also rejected — kind may be either
    // 'shortname-format' (underscore) or 'reserved-shortname' (matched
    // by the blacklist) depending on which check fires first.
    for (const reserved of ['__proto__', 'hasOwnProperty']) {
      const e = validateShortName(reserved);
      expect(e, `expected "${reserved}" to be rejected`).not.toBeNull();
      expect(['shortname-format', 'reserved-shortname']).toContain(e?.payload.kind);
    }
  });

  it('SHORTNAME_RE matches the spec pattern (^[a-z][a-z0-9-]*$)', () => {
    expect(SHORTNAME_RE.test('a')).toBe(true);
    expect(SHORTNAME_RE.test('a-b')).toBe(true);
    expect(SHORTNAME_RE.test('a1')).toBe(true);
    expect(SHORTNAME_RE.test('A')).toBe(false);
    expect(SHORTNAME_RE.test('1a')).toBe(false);
    expect(SHORTNAME_RE.test('-a')).toBe(false);
  });

  it('SHORTNAME_MIN / SHORTNAME_MAX are 3 and 40 per spec', () => {
    expect(SHORTNAME_MIN).toBe(3);
    expect(SHORTNAME_MAX).toBe(40);
  });

  it('RESERVED_SHORTNAMES includes the spec § 5.4 list', () => {
    const expected = [
      'ctx',
      'project',
      'document',
      'documents',
      'container',
      'param',
      'validator',
      'schema',
      'log',
      'utils',
      'core',
      'script',
      'scripts',
      'manifest',
      'arxml',
      '__proto__',
      'constructor',
      'prototype',
      'hasOwnProperty',
    ];
    for (const k of expected) {
      expect(RESERVED_SHORTNAMES.has(k), `missing reserved: ${k}`).toBe(true);
    }
  });
});
