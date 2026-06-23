// User-reported regression invariant (2026-06-23, v1.9.0 feature/sprint-x-vendor-prefix).
//
// User symptom: opening `JWQ3399_EcucValues.arxml` and trying to add a
// `lower=0, upper=infinite` sub-container surfaced `path-not-found` for
// every target. The user could not add any container under this
// project's tree.
//
// Three root causes were fixed in the `v1.9.0` regression sweep:
//   1. `core/arxml/path.ts` `findByPath` walker couldn't bridge a
//      same-name AR-PACKAGE wrapper around the ECUC element.
//   2. `core/arxml/path.ts` `findByPath` couldn't locate an ECUC
//      module by shortName when it was nested under a vendor
//      AR-PACKAGE chain (the renderer fold presents the module at
//      the path root, but the source doc has it nested 2+ levels
//      down).
//   3. `renderer/store/helpers/bswmdLookup.ts` `resolveModuleAndParentContainer`
//      only looked for the module shortName at `segments[1]`
//      (canonical 4-segment) or `segments[0]` (3-segment fallback).
//      Vendor-prefix pre-fold paths place the module shortName at
//      `segments[2]`, so BSWMD lookup returned null even when the
//      path was structurally valid.
//
// This file pins the invariant directly on the user's real
// arxml + bswmd — no mocks, no fixtures, no internal API. If a
// future change to the skeleton, combinedDoc fold, walker, or BSWMD
// lookup regresses the 0..* add path for this project, the test
// fails with the actual path and lookup result so the diagnosis is
// one grep away.

import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { parseArxml } from '../../src/core/arxml/parser';
import { findByPath } from '../../src/core/arxml/path';
import type { BswmdDocument } from '../../src/core/project/bswmd';
import { parseBswmd } from '../../src/core/project/bswmd';
import { resolveModuleAndParentContainer } from '../../src/renderer/store/helpers/bswmdLookup';

const ECUC_PATH = 'C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/ecuc/JWQ3399_EcucValues.arxml';
const BSWMD_PATH = 'C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/bswmd/JWQ3399_bswmd.arxml';

let cached: BswmdDocument | null = null;
function loadBswmd(): BswmdDocument {
  const existing = cached;
  if (existing !== null) return existing;
  const bswmdXml = readFileSync(BSWMD_PATH, 'utf-8');
  const r = parseBswmd(bswmdXml);
  if (!r.ok) throw new Error(`BSWMD parse: ${JSON.stringify(r.error)}`);
  cached = r.value;
  return r.value;
}

describe('user JWQ3399 addContainer path invariant', () => {
  // The Tree renders two path shapes for the same project:
  //   - post-fold: 3-segment `/JWQ3399/<container>` (current renderer)
  //   - pre-fold:  4-segment `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/<container>`
  //     (legacy docs and pre-c46f4a8 skeleton output, also reachable
  //     when the renderer fold hasn't been applied)
  // The walker AND the BSWMD lookup must accept BOTH so legacy user
  // docs and freshly-regenerated ones both work without forcing a
  // re-save.
  const TARGETS: ReadonlyArray<{
    readonly path: string;
    readonly expectedModule: string;
    readonly expectedParent: string;
    readonly expectedKind: 'container' | 'module';
  }> = [
    { path: '/JWQ3399/JWQ3399ConfigSet', expectedModule: 'JWQ3399', expectedParent: 'JWQ3399ConfigSet', expectedKind: 'container' },
    { path: '/JWQ3399/JWQ3399General', expectedModule: 'JWQ3399', expectedParent: 'JWQ3399General', expectedKind: 'container' },
    { path: '/JWQ3399/JWQ3399General/JWQ3399GPIOConfig', expectedModule: 'JWQ3399', expectedParent: 'JWQ3399GPIOConfig', expectedKind: 'container' },
    { path: '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet', expectedModule: 'JWQ3399', expectedParent: 'JWQ3399ConfigSet', expectedKind: 'container' },
    { path: '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399General', expectedModule: 'JWQ3399', expectedParent: 'JWQ3399General', expectedKind: 'container' },
    { path: '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399General/JWQ3399GPIOConfig', expectedModule: 'JWQ3399', expectedParent: 'JWQ3399GPIOConfig', expectedKind: 'container' },
    { path: '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399InitConfig', expectedModule: 'JWQ3399', expectedParent: 'JWQ3399InitConfig', expectedKind: 'container' },
  ];

  for (const t of TARGETS) {
    it(`findByPath resolves ${t.path}`, () => {
      const ecucXml = readFileSync(ECUC_PATH, 'utf-8');
      const r = parseArxml(ecucXml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = findByPath(r.value, t.path);
      expect(found).not.toBeNull();
      if (found === null) return;
      expect(found.element.kind).toBe(t.expectedKind);
      if (found.element.kind !== 'reference' && found.element.kind !== 'unknown') {
        expect(found.element.shortName).toBe(t.expectedParent);
      }
    });

    it(`resolveModuleAndParentContainer finds ${t.path}`, () => {
      const bswmd = loadBswmd();
      const lookup = resolveModuleAndParentContainer([bswmd], t.path);
      expect(lookup).not.toBeNull();
      if (lookup === null) return;
      expect(lookup.moduleDef.shortName).toBe(t.expectedModule);
      expect(lookup.parentContainerDef?.shortName).toBe(t.expectedParent);
    });
  }
});
