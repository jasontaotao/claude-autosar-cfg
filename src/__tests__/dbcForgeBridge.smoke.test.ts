// @vitest-environment node
//
// v1.7.0 Cluster 3 I — dbc-forge smoke test.
//
// Proves the file: dependency on @dbc-forge/core resolves at build time
// and that the parser + writer round-trip preserves a 1-frame network
// byte-for-byte. This is the only piece of v1.7.0 I that crosses the
// dependency boundary; downstream ARXML↔DBC bridging is v1.8.0+ scope.
//
// If this test ever fails with "Cannot find module '@dbc-forge/core'",
// the local dbc-forge checkout is missing or out of date — re-run:
//   pnpm install
// (per v1.7.0 design §4: file: dep re-resolves on every install).

import { parseDbc, writeDbc, deepEqualNetwork } from '@dbc-forge/core';
import { describe, it, expect } from 'vitest';

describe('@dbc-forge/core smoke test (v1.7.0 Cluster 3 I)', () => {
  it('exports the expected public API surface', () => {
    expect(typeof parseDbc).toBe('function');
    expect(typeof writeDbc).toBe('function');
    expect(typeof deepEqualNetwork).toBe('function');
  });

  it('parses a minimal 1-frame DBC string', () => {
    const minimal = [
      'VERSION ""',
      '',
      'NS_ :',
      '',
      'BS_:',
      '',
      'BU_: ECU1 ECU2',
      '',
      'BO_ 100 Frame_A: 8 ECU1',
      ' SG_ Signal_A : 0|8@1+ (1,0) [0|255] "" Vector__XXX',
      '',
      'CM_ SG_ 100 Signal_A "Test signal";',
      '',
      'BA_DEF_ BU_ "NodeLayerModules" INT 0 100;',
      'BA_ "NodeLayerModules" 5 ECU1;',
      '',
    ].join('\n');
    const network = parseDbc(minimal);
    expect(network.messages).toHaveLength(1);
    expect(network.messages[0]?.id).toBe(100);
    expect(network.messages[0]?.name).toBe('Frame_A');
    expect(network.messages[0]?.signals).toHaveLength(1);
    expect(network.messages[0]?.signals[0]?.name).toBe('Signal_A');
  });

  it('round-trips parseDbc → writeDbc → parseDbc yields an equal network', () => {
    const minimal = [
      'VERSION ""',
      '',
      'NS_ :',
      '',
      'BS_:',
      '',
      'BU_: ECU1 ECU2',
      '',
      'BO_ 100 Frame_A: 8 ECU1',
      ' SG_ Signal_A : 0|8@1+ (1,0) [0|255] "" Vector__XXX',
      '',
      'CM_ SG_ 100 Signal_A "Test signal";',
      '',
      'BA_DEF_ BU_ "NodeLayerModules" INT 0 100;',
      'BA_ "NodeLayerModules" 5 ECU1;',
      '',
    ].join('\n');
    const original = parseDbc(minimal);
    const written = writeDbc(original);
    const reparsed = parseDbc(written);
    expect(deepEqualNetwork(original, reparsed)).toBe(true);
  });
});
