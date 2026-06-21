// v1.8.0 K Stencil Wizard — Task 2 (family schemas) round-trip tests.
//
// Pins the public contract for the four hand-curated family skeletons
// (Com / ComM / PduR / EcuC). Each builder returns a fresh
// `ArxmlDocument` whose top-level package shortName matches the family
// (e.g. 'Com' for the Com family, 'ComM' for ComM, 'PduR' for PduR,
// 'EcuC' for EcuC). The serializers + parser must round-trip cleanly
// so the wizard's `stencil:generate:v1` IPC handler can hand back a
// valid ECUC XML string for save-as.
//
// Deviations vs the plan example:
//   - The plan's `rootPackages[0].shortName` is incorrect for the
//     project's actual `ArxmlDocument` shape (which exposes `packages`,
//     not `rootPackages`). The assertion here reads the package
//     `shortName` from `packages[0].shortName` and the module name
//     from `packages[0].elements[0].shortName` (where `elements[0]` is
//     the `ArxmlModule` with `kind: 'module'`).
//   - The plan's `com.ts` example hard-codes a non-existent
//     `ArxmlContainer` shape — the actual type expects
//     `tagName: 'ECUC-CONTAINER-VALUE'` per the project's value-side
//     convention (see `core/arxml/skeleton.ts:127`).

import { describe, it, expect } from 'vitest';

import { parseArxml } from '../../../core/arxml/parser.js';
import { serializeArxml } from '../../../core/arxml/serializer.js';
import { buildComModule } from '../schemas/com.js';
import { buildCommModule } from '../schemas/comm.js';
import { buildEcucModule } from '../schemas/ecuc.js';
import { buildPdurModule } from '../schemas/pdur.js';

describe('family schemas round-trip', () => {
  const cases = [
    { family: 'com', build: buildComModule, shortName: 'Com' },
    { family: 'comm', build: buildCommModule, shortName: 'ComM' },
    { family: 'pdur', build: buildPdurModule, shortName: 'PduR' },
    { family: 'ecuc', build: buildEcucModule, shortName: 'EcuC' },
  ] as const;

  for (const { family, build, shortName } of cases) {
    it(`${family}: build -> serialize -> parse -> matches`, () => {
      const doc = build();
      const ser = serializeArxml(doc);
      expect(ser.ok).toBe(true);
      if (!ser.ok) return;
      const parsed = parseArxml(ser.value);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      // Top-level package shortName must match the family shortName.
      // (Plan assertion `rootPackages[0].shortName.toLowerCase()` would
      // fail on the project's `packages` shape — see header comment.)
      expect(parsed.value.packages[0]?.shortName).toBe(shortName);
      // Sanity: every family must emit at least one module element so
      // the parser doesn't reject the file as a BSWMD-only document.
      const moduleEl = parsed.value.packages[0]?.elements.find(
        (e): e is Extract<typeof e, { kind: 'module' }> => e.kind === 'module',
      );
      expect(moduleEl).toBeDefined();
      // The module element shortName must also equal the family shortName
      // (the module is the same name as its enclosing package).
      expect(moduleEl?.shortName).toBe(shortName);
      // Family-keyword presence check (plan requirement: the
      // shortName.toLowerCase() must contain the family name). Com and
      // ComM share the 'comm' prefix so this is fine for both.
      expect(shortName.toLowerCase()).toContain(family);
    });
  }
});