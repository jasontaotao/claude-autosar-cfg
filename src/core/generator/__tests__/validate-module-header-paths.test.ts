// core/generator/__tests__/validate-module-header-paths.test.ts
//
// v1.14.1 PATCH-G (G4) — unit tests for `validateModuleHeaderPaths`
// (D-rev2 SEC3 wire-up). Closes the deferred "validateHeaderPath
// exported but defensive-only" finding from the v1.14.0 ship note.
//
// The validator iterates a BSWMD index and pushes
// `BSW-SEC-002` ERROR for every module whose `moduleHeader` or
// `includes[]` entry fails the SEC3 whitelist
// (`^[A-Za-z0-9_./-]+$` + no leading `/` + no `..`).

import { describe, it, expect } from 'vitest';

import { DiagnosticCode, DiagnosticSeverity, type Diagnostic } from '../diagnostics.js';
import { validateModuleHeaderPaths } from '../modules/_shared.js';

interface FakeModuleDef {
  readonly shortName: string;
  readonly moduleHeader?: string;
  readonly includes?: readonly string[];
}

function firstDiag(diags: readonly Diagnostic[]): Diagnostic {
  const d = diags[0];
  if (!d) throw new Error('expected at least one diagnostic');
  return d;
}

describe('validateModuleHeaderPaths (v1.14.1 PATCH-G G4)', () => {
  it('errors on `..` in moduleHeader', () => {
    const diags = validateModuleHeaderPaths(
      new Map<FakeModuleDef['shortName'], FakeModuleDef>([
        ['Bad', { shortName: 'Bad', moduleHeader: '../etc/passwd' }],
      ]),
    );
    expect(diags).toHaveLength(1);
    const d = firstDiag(diags);
    expect(d.code).toBe(DiagnosticCode.BSW_SEC_INVALID_HEADER_PATH);
    expect(d.severity).toBe(DiagnosticSeverity.ERROR);
    expect(d.moduleShortName).toBe('Bad');
  });

  it('errors on absolute path moduleHeader', () => {
    const diags = validateModuleHeaderPaths(
      new Map([['Abs', { shortName: 'Abs', moduleHeader: '/usr/include/stdio.h' }]]),
    );
    expect(diags).toHaveLength(1);
    expect(firstDiag(diags).code).toBe(DiagnosticCode.BSW_SEC_INVALID_HEADER_PATH);
  });

  it('errors on invalid include path inside includes[]', () => {
    const diags = validateModuleHeaderPaths(
      new Map([['M', { shortName: 'M', includes: ['ok.h', 'bad$(rm).h'] }]]),
    );
    expect(diags).toHaveLength(1);
    const d = firstDiag(diags);
    expect(d.code).toBe(DiagnosticCode.BSW_SEC_INVALID_HEADER_PATH);
    expect(d.message).toContain('bad$(rm).h');
  });

  it('returns empty diagnostics for valid paths', () => {
    const diags = validateModuleHeaderPaths(
      new Map([
        [
          'M',
          {
            shortName: 'M',
            moduleHeader: 'M/M_Cfg.h',
            includes: ['Os/Os_Cfg.h', 'Dem/Dem_Cfg.h'],
          },
        ],
      ]),
    );
    expect(diags).toHaveLength(0);
  });
});
