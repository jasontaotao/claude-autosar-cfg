import { describe, it, expect } from 'vitest';
import {
  validateReferences,
  emitReferenceDecl,
  type ReferenceEdge,
  type NormalizedConfigTree,
} from '../emit/reference.js';
import { DiagnosticSeverity, DiagnosticCode } from '../diagnostics.js';

const makeTree = (valuesByModule: Record<string, unknown>): NormalizedConfigTree => ({
  bswmdIndex: new Map(),
  valuesByModule: new Map(Object.entries(valuesByModule)),
  implByModule: new Map(),
  references: [
    { sourceModule: 'EcuC', sourcePath: 'RefToMcuClock', targetModule: 'Mcu', targetPath: 'ClockConfig_0' },
  ] as ReferenceEdge[],
});

describe('validateReferences', () => {
  it('reports no diagnostics when target exists', () => {
    const tree = makeTree({
      EcuC: { RefToMcuClock: {} },
      Mcu: { ClockConfig_0: {} },
    });
    const diags = validateReferences(tree);
    const errors = diags.filter(d => d.severity === DiagnosticSeverity.ERROR);
    expect(errors).toHaveLength(0);
  });

  it('reports ECUC-GEN-010 when target module missing', () => {
    const tree = makeTree({ EcuC: { RefToMcuClock: {} } });
    const diags = validateReferences(tree);
    const err = diags.find(d => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED);
    expect(err).toBeDefined();
    expect(err!.moduleShortName).toBe('EcuC');
    expect(err!.ecucPath).toBe('RefToMcuClock');
  });

  it('reports ECUC-GEN-010 when target path missing', () => {
    const tree = makeTree({
      EcuC: { RefToMcuClock: {} },
      Mcu: { OtherConfig: {} },
    });
    const diags = validateReferences(tree);
    const err = diags.find(d => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED);
    expect(err).toBeDefined();
  });
});

describe('emitReferenceDecl', () => {
  it('emits pointer-to-const-target decl', () => {
    const s = emitReferenceDecl({
      ident: 'EcuC_RefToMcuClock',
      targetIdent: 'Mcu_ClockConfig_0',
      targetType: 'Mcu_ClockConfigType',
    });
    expect(s).toBe(
      'CONST(Mcu_ClockConfigType * const, AUTOMATIC) EcuC_RefToMcuClock = &Mcu_ClockConfig_0;',
    );
  });
});