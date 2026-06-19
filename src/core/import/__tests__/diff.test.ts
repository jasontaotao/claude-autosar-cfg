// Sprint 14 ECUC ARXML Import — buildModuleDiff tests.
// Spec §8.2 diff.test.ts — ≥8 cases.

import { describe, it, expect } from 'vitest';

import type { ArxmlModule, ArxmlContainer } from '../../arxml/types.js';
import { buildModuleDiff } from '../diff.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const MOD_TAG = 'ECUC-MODULE-CONFIGURATION-VALUES';
const CONT_TAG = 'ECUC-CONTAINER-VALUE';

function makeModule(shortName: string, children: ArxmlContainer[] = []): ArxmlModule {
  return {
    kind: 'module',
    tagName: MOD_TAG,
    shortName,
    params: {},
    children,
    references: [],
  };
}

function makeContainer(
  shortName: string,
  _path: string,
  params: Record<string, { type: 'string'; value: string }> = {},
  subContainers: ArxmlContainer[] = [],
): ArxmlContainer {
  return {
    kind: 'container',
    tagName: CONT_TAG,
    shortName,
    params,
    children: subContainers,
  };
}

function makeParamValue(v: string) {
  return { type: 'string' as const, value: v };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sprint 14 — diff: buildModuleDiff', () => {
  it('case 1: two empty modules yield empty containers / references / paramOverrides', () => {
    // Arrange
    const existing = makeModule('Can');
    const incoming = makeModule('Can');

    // Act
    const r = buildModuleDiff(existing, incoming);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.moduleShortName).toBe('Can');
    expect(r.value.containers).toEqual([]);
    expect(r.value.references).toEqual([]);
    expect(r.value.paramOverrides).toEqual([]);
  });

  it('case 2: identical modules default to "keep-existing" with no overwrite ops implied', () => {
    // Arrange — same container with same param
    const existing = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('A') }),
    ]);
    const incoming = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('A') }),
    ]);

    // Act
    const r = buildModuleDiff(existing, incoming);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.containers).toHaveLength(1);
    expect(r.value.containers[0]?.resolution).toBe('keep-existing');
    expect(r.value.paramOverrides).toEqual([]);
  });

  it('case 3: incoming has a container target lacks — defaults to overwrite', () => {
    // Arrange
    const existing = makeModule('Can');
    const incoming = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('A') }),
    ]);

    // Act
    const r = buildModuleDiff(existing, incoming);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.containers).toHaveLength(1);
    expect(r.value.containers[0]?.existing).toBeNull();
    expect(r.value.containers[0]?.incoming?.shortName).toBe('Cfg');
    expect(r.value.containers[0]?.resolution).toBe('overwrite');
  });

  it('case 4: existing has a container incoming lacks — defaults to keep-existing', () => {
    // Arrange
    const existing = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('A') }),
    ]);
    const incoming = makeModule('Can');

    // Act
    const r = buildModuleDiff(existing, incoming);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.containers).toHaveLength(1);
    expect(r.value.containers[0]?.existing?.shortName).toBe('Cfg');
    expect(r.value.containers[0]?.incoming).toBeNull();
    expect(r.value.containers[0]?.resolution).toBe('keep-existing');
  });

  it('case 5: same container path, different param values — emits paramOverride', () => {
    // Arrange
    const existing = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('A') }),
    ]);
    const incoming = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('B') }),
    ]);

    // Act
    const r = buildModuleDiff(existing, incoming);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.paramOverrides).toHaveLength(1);
    expect(r.value.paramOverrides[0]).toMatchObject({
      path: '/Can/Cfg',
      param: 'P',
      existingValue: 'A',
      incomingValue: 'B',
    });
  });

  it('case 6: same container path, different param counts — list both new + missing', () => {
    // Arrange — existing has P, Q; incoming has P, R
    const existing = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', {
        P: makeParamValue('A'),
        Q: makeParamValue('B'),
      }),
    ]);
    const incoming = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', {
        P: makeParamValue('A'),
        R: makeParamValue('C'),
      }),
    ]);

    // Act
    const r = buildModuleDiff(existing, incoming);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 1 paramOverride for missing Q, 1 for new R (or the diff surfaces them)
    const overrideParams = r.value.paramOverrides.map((p) => p.param).sort();
    expect(overrideParams).toEqual(['Q', 'R']);
    // The Q override's incomingValue is null (missing on incoming)
    const q = r.value.paramOverrides.find((p) => p.param === 'Q');
    expect(q?.incomingValue).toBeNull();
    // The R override's existingValue is null (missing on existing)
    const rn = r.value.paramOverrides.find((p) => p.param === 'R');
    expect(rn?.existingValue).toBeNull();
  });

  it('case 7: nested container collision 3 levels deep — full path preserved', () => {
    // Arrange
    const leafExisting = makeContainer('Leaf', '/Can/A/B/Leaf', {
      V: makeParamValue('old'),
    });
    const leafIncoming = makeContainer('Leaf', '/Can/A/B/Leaf', {
      V: makeParamValue('new'),
    });
    const existing = makeModule('Can', [
      makeContainer('A', '/Can/A', {}, [
        makeContainer('B', '/Can/A/B', {}, [leafExisting]),
      ]),
    ]);
    const incoming = makeModule('Can', [
      makeContainer('A', '/Can/A', {}, [
        makeContainer('B', '/Can/A/B', {}, [leafIncoming]),
      ]),
    ]);

    // Act
    const r = buildModuleDiff(existing, incoming);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const paths = r.value.containers.map((c) => c.path);
    // The leaf override must be present with the deepest path
    expect(paths).toContain('/Can/A/B/Leaf');
    // The leaf's param override should be visible
    const override = r.value.paramOverrides.find((p) => p.path === '/Can/A/B/Leaf');
    expect(override).toBeDefined();
    expect(override?.existingValue).toBe('old');
    expect(override?.incomingValue).toBe('new');
  });

  it('case 8: multiplicity exceeded — returns multiplicity-exceeded ImportError', () => {
    // Arrange — incoming has 3 instances of the same-named container
    // (Cfg) landing at the same path /Can/Cfg. Default cap is 1
    // instance per path; the caller's multiplicityLimits=1 confirms.
    const existing = makeModule('Can');
    const incoming = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { V: makeParamValue('1') }),
      makeContainer('Cfg', '/Can/Cfg', { V: makeParamValue('2') }),
      makeContainer('Cfg', '/Can/Cfg', { V: makeParamValue('3') }),
    ]);

    // Act
    const r = buildModuleDiff(existing, incoming, {
      multiplicityLimits: new Map<string, number>([['/Can/Cfg', 1]]),
    });

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('multiplicity-exceeded');
    if (r.error.kind === 'multiplicity-exceeded') {
      expect(r.error.containerPath).toBe('/Can/Cfg');
      expect(r.error.limit).toBe(1);
    }
  });

  it('does not mutate inputs (immutability invariant)', () => {
    // Arrange
    const existing = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('A') }),
    ]);
    const incoming = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('B') }),
    ]);
    const origExistingJson = JSON.stringify(existing);
    const origIncomingJson = JSON.stringify(incoming);

    // Act
    buildModuleDiff(existing, incoming);

    // Assert
    expect(JSON.stringify(existing)).toBe(origExistingJson);
    expect(JSON.stringify(incoming)).toBe(origIncomingJson);
  });

  it('treats target=null as a pure "add incoming" diff', () => {
    // Arrange — spec §6.1 Step 3 mentions incoming modules can collide
    // with target. When target is null (no collision case), buildModuleDiff
    // is called with existing=null and incoming=<new module>.
    const incoming = makeModule('Can', [
      makeContainer('Cfg', '/Can/Cfg', { P: makeParamValue('A') }),
    ]);

    // Act
    const r = buildModuleDiff(null, incoming);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.containers).toHaveLength(1);
    expect(r.value.containers[0]?.existing).toBeNull();
    expect(r.value.containers[0]?.incoming?.shortName).toBe('Cfg');
    expect(r.value.containers[0]?.resolution).toBe('overwrite');
  });
});
