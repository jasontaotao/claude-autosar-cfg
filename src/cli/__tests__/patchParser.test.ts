// Patch parser tests (v1.6.0 A+C-3).
//
// Pin the JSON Patch RFC 6902 subset + 3 AUTOSAR extension parsing
// per A+C spec §8. Strict version enforcement per Q11.

import { describe, it, expect } from 'vitest';

import { parsePatchJson, parsePatchDocument } from '../patch-parser.js';

describe('parsePatchJson — happy path', () => {
  it('accepts an empty patch (no-op)', () => {
    const out = parsePatchJson('{"autosarcfgPatchVersion":"1","steps":[]}');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.doc.steps).toHaveLength(0);
      expect(out.doc.autosarcfgPatchVersion).toBe('1');
    }
  });

  it('parses all 6 step variants', () => {
    const raw = JSON.stringify({
      autosarcfgPatchVersion: '1',
      steps: [
        { op: 'add', path: '/foo', value: 1 },
        { op: 'remove', path: '/foo' },
        { op: 'replace', path: '/foo', value: 2 },
        { op: 'set-param', containerPath: '/AUTOSAR/EcucDefs/Com/ComConfigSet', paramName: 'ComBusWakeupTimeout', value: 200 },
        { op: 'add-child', parentPath: '/AUTOSAR/EcucDefs/Com/ComConfigSet', shortName: 'ComIPdu_0' },
        { op: 'remove-with-cascade', containerPath: '/AUTOSAR/EcucDefs/Com/ComConfigSet/ComIPdu_0', cascade: true },
      ],
    });
    const out = parsePatchJson(raw);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.doc.steps).toHaveLength(6);
      expect(out.doc.steps[0]?.op).toBe('add');
      expect(out.doc.steps[3]?.op).toBe('set-param');
      expect(out.doc.steps[5]?.op).toBe('remove-with-cascade');
    }
  });

  it('preserves metadata round-trip', () => {
    const raw = JSON.stringify({
      autosarcfgPatchVersion: '1',
      metadata: { author: 'ci-bot', ticket: 'JIRA-1234' },
      steps: [],
    });
    const out = parsePatchJson(raw);
    if (out.ok) {
      expect(out.doc.metadata?.['author']).toBe('ci-bot');
    }
  });
});

describe('parsePatchJson — error paths', () => {
  it('rejects missing autosarcfgPatchVersion', () => {
    const out = parsePatchJson('{"steps":[]}');
    expect(out.ok).toBe(false);
    if (!out.ok && out.kind === 'invalid') {
      expect(out.reason).toContain('autosarcfgPatchVersion');
    }
  });

  it('rejects unsupported version (strict per Q11)', () => {
    const out = parsePatchJson('{"autosarcfgPatchVersion":"999","steps":[]}');
    expect(out.ok).toBe(false);
    if (!out.ok && out.kind === 'unsupported-version') {
      expect(out.version).toBe('999');
    }
  });

  it('rejects malformed JSON', () => {
    const out = parsePatchJson('{ not valid json');
    expect(out.ok).toBe(false);
  });

  it('rejects step missing required field', () => {
    const out = parsePatchJson('{"autosarcfgPatchVersion":"1","steps":[{"op":"add"}]}');
    expect(out.ok).toBe(false);
    if (!out.ok && out.kind === 'invalid') {
      expect(out.reason).toContain('path');
    }
  });

  it('rejects unknown op', () => {
    const out = parsePatchJson('{"autosarcfgPatchVersion":"1","steps":[{"op":"frobnicate","path":"/foo"}]}');
    expect(out.ok).toBe(false);
    if (!out.ok && out.kind === 'invalid') {
      expect(out.reason).toContain('frobnicate');
    }
  });

  it('rejects set-param with wrong value type', () => {
    const out = parsePatchJson(
      '{"autosarcfgPatchVersion":"1","steps":[{"op":"set-param","containerPath":"/x","paramName":"p","value":{"nested":"object"}}]}',
    );
    expect(out.ok).toBe(false);
  });
});

describe('parsePatchDocument — format detection', () => {
  it('routes JSON content to parsePatchJson', () => {
    const out = parsePatchDocument('{"autosarcfgPatchVersion":"1","steps":[]}');
    expect(out.ok).toBe(true);
  });

  it('rejects YAML in v1 with a clear message', () => {
    const out = parsePatchDocument('autosarcfgPatchVersion: "1"\nsteps: []');
    expect(out.ok).toBe(false);
    if (!out.ok && out.kind === 'invalid') {
      expect(out.reason).toContain('YAML');
    }
  });
});