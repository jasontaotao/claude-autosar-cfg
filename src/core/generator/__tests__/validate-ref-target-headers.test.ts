// src/core/generator/__tests__/validate-ref-target-headers.test.ts
//
// v1.15.0 MINOR (B-2) — unit tests for `validateRefTargetHeaders`.
// Stage-1 validator that pushes BSW-SEC-004 ERROR for every ref
// whose target module is in the BSWMD index but lacks
// `<HEADER>`. Replaces the inline emit-time push in
// EcuCGenerator.emit and McuGenerator.emit (D-rev3 B-2).
//
// The validator is silent when the target module is absent
// from bswmdIndex (out of scope; `validateReferences` covers
// unresolved refs with ECUC-GEN-010).

import { describe, it, expect } from 'vitest';

import { DiagnosticCode, DiagnosticSeverity, type Diagnostic } from '../diagnostics.js';
import { validateRefTargetHeaders } from '../modules/_shared.js';

function firstDiag(diags: readonly Diagnostic[]): Diagnostic {
  const d = diags[0];
  if (!d) throw new Error('expected at least one diagnostic');
  return d;
}

describe('validateRefTargetHeaders (v1.15.0 MINOR B-2)', () => {
  it('pushes BSW-SEC-004 when ref target module has no moduleHeader', () => {
    // Arrange
    const bswmdIndex = new Map([
      ['EcuC', { shortName: 'EcuC' }], // EcuC has no moduleHeader
    ]);
    const ecucValues = new Map([
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
    const diags = validateRefTargetHeaders(bswmdIndex, ecucValues);
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
    const bswmdIndex = new Map([
      ['EcuC', { shortName: 'EcuC', moduleHeader: 'EcuC/EcuC_Cfg.h' }],
    ]);
    const ecucValues = new Map([
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
    const diags = validateRefTargetHeaders(bswmdIndex, ecucValues);
    // Assert
    expect(diags).toHaveLength(0);
  });

  it('is silent when ref target module is NOT in bswmdIndex', () => {
    // Arrange — target module is absent. This case is out of
    // scope for BSW-SEC-004; `validateReferences` covers
    // unresolved refs with ECUC-GEN-010. The validator must
    // not double-report.
    const bswmdIndex = new Map([['Mcu', { shortName: 'Mcu' }]]);
    const ecucValues = new Map([
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
    const diags = validateRefTargetHeaders(bswmdIndex, ecucValues);
    // Assert
    expect(diags).toHaveLength(0);
  });

  it('is silent for a module with no references', () => {
    // Arrange
    const bswmdIndex = new Map([['Mcu', { shortName: 'Mcu' }]]);
    const ecucValues = new Map([['Mcu', { parameters: [] }]]);
    // Act
    const diags = validateRefTargetHeaders(bswmdIndex, ecucValues);
    // Assert
    expect(diags).toHaveLength(0);
  });
});
