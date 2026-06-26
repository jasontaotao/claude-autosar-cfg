// src/core/generator/__tests__/validate-ref-target-headers.test.ts
//
// v1.15.0 MINOR (B-2) + v1.15.1 PATCH (M1.1) — unit tests for
// `validateRefTargetHeaders`. v1.15.0 took (bswmdIndex,
// ecucValues); v1.15.1 migrates to (tree: NormalizedConfigTree)
// for symmetry with the rest of the Stage-1 validator surface
// (D-rev3 B-2 review M1 advisory).
//
// The test intent (push + no-push for EcuC + Mcu) is preserved;
// only the call-site shape changes from two map args to a
// single `tree` arg built via `normalizeToTree` (the same path
// the pipeline uses).

import { describe, it, expect } from 'vitest';

import { DiagnosticCode, DiagnosticSeverity, type Diagnostic } from '../diagnostics.js';
import {
  normalizeToTree,
  type BswmdModuleDefLite,
  type EcucModuleConfigurationValuesInput,
} from '../normalize.js';
import { validateRefTargetHeaders } from '../modules/_shared.js';

function firstDiag(diags: readonly Diagnostic[]): Diagnostic {
  const d = diags[0];
  if (!d) throw new Error('expected at least one diagnostic');
  return d;
}

function buildTree(
  bswmdIndex: ReadonlyMap<string, BswmdModuleDefLite>,
  ecucValues: ReadonlyMap<string, EcucModuleConfigurationValuesInput>,
) {
  return normalizeToTree(bswmdIndex, ecucValues);
}

describe('validateRefTargetHeaders (v1.15.0 MINOR B-2 + v1.15.1 PATCH M1)', () => {
  it('pushes BSW-SEC-004 when ref target module has no moduleHeader', () => {
    // Arrange
    const bswmdIndex = new Map<string, BswmdModuleDefLite>([
      ['EcuC', { shortName: 'EcuC' }], // EcuC has no moduleHeader
    ]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      [
        'Mcu',
        {
          references: [
            { path: 'Mcu/OsRef', targetModule: 'EcuC', targetPath: 'EcuC/Config' },
          ],
        },
      ],
    ]);
    // Act
    const tree = buildTree(bswmdIndex, ecucValues);
    const diags = validateRefTargetHeaders(tree);
    // Assert
    expect(diags).toHaveLength(1);
    const d = firstDiag(diags);
    expect(d.code).toBe(DiagnosticCode.BSW_SEC_MISSING_TARGET_HEADER);
    expect(d.severity).toBe(DiagnosticSeverity.ERROR);
    expect(d.moduleShortName).toBe('Mcu');
    expect(d.ecucPath).toBe('Mcu/OsRef');
  });

  it('is silent when ref target module has moduleHeader', () => {
    // Arrange
    const bswmdIndex = new Map<string, BswmdModuleDefLite>([
      ['EcuC', { shortName: 'EcuC', moduleHeader: 'EcuC/EcuC_Cfg.h' }],
    ]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      [
        'Mcu',
        {
          references: [
            { path: 'Mcu/OsRef', targetModule: 'EcuC', targetPath: 'EcuC/Config' },
          ],
        },
      ],
    ]);
    // Act
    const tree = buildTree(bswmdIndex, ecucValues);
    const diags = validateRefTargetHeaders(tree);
    // Assert
    expect(diags).toHaveLength(0);
  });

  it('is silent when ref target module is NOT in bswmdIndex', () => {
    // Arrange — target module is absent. This case is out of
    // scope for BSW-SEC-004; `validateReferences` covers
    // unresolved refs with ECUC-GEN-010. The validator must
    // not double-report.
    const bswmdIndex = new Map<string, BswmdModuleDefLite>([['Mcu', { shortName: 'Mcu' }]]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      [
        'Mcu',
        {
          references: [
            { path: 'Mcu/OsRef', targetModule: 'Os', targetPath: 'Os/OsCore' },
          ],
        },
      ],
    ]);
    // Act
    const tree = buildTree(bswmdIndex, ecucValues);
    const diags = validateRefTargetHeaders(tree);
    // Assert
    expect(diags).toHaveLength(0);
  });

  it('is silent for a module with no references', () => {
    // Arrange
    const bswmdIndex = new Map<string, BswmdModuleDefLite>([['Mcu', { shortName: 'Mcu' }]]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      ['Mcu', { parameters: [] }],
    ]);
    // Act
    const tree = buildTree(bswmdIndex, ecucValues);
    const diags = validateRefTargetHeaders(tree);
    // Assert
    expect(diags).toHaveLength(0);
  });
});
