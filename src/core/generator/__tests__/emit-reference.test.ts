import { describe, it, expect } from 'vitest';

import { DiagnosticSeverity, DiagnosticCode } from '../diagnostics.js';
import {
  validateReferences,
  emitReferenceDecl,
  type ReferenceEdge,
  type NormalizedConfigTree,
} from '../emit/reference.js';

const makeTree = (valuesByModule: Record<string, unknown>): NormalizedConfigTree => ({
  bswmdIndex: new Map(),
  valuesByModule: new Map(Object.entries(valuesByModule)),
  implByModule: new Map(),
  bswmdParamIndex: new Map(),
  references: [
    {
      sourceModule: 'EcuC',
      sourcePath: 'RefToMcuClock',
      targetModule: 'Mcu',
      targetPath: 'ClockConfig_0',
    },
  ] as ReferenceEdge[],
});

describe('validateReferences', () => {
  it('reports no diagnostics when target exists', () => {
    // v1.14.0 MINOR S9 — fixture updated to use containers[] shape.
    // The pre-v1.14.0 flat-key `{ ClockConfig_0: {} }` shape was only
    // valid under the loose `(targetMod as Record<string, unknown>)[
    // ref.targetPath]` lookup; the new instance-level check requires
    // the target path's tail to match a real container shortName in
    // `containers[]`.
    const tree = makeTree({
      EcuC: { containers: [], parameters: [], references: [] },
      Mcu: { containers: [{ shortName: 'ClockConfig_0' }], parameters: [], references: [] },
    });
    const diags = validateReferences(tree);
    const errors = diags.filter((d) => d.severity === DiagnosticSeverity.ERROR);
    expect(errors).toHaveLength(0);
  });

  it('reports ECUC-GEN-010 when target module missing', () => {
    const tree = makeTree({ EcuC: { containers: [], parameters: [], references: [] } });
    const diags = validateReferences(tree);
    const err = diags.find((d) => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED);
    expect(err).toBeDefined();
    expect(err!.moduleShortName).toBe('EcuC');
    expect(err!.ecucPath).toBe('RefToMcuClock');
  });

  it('reports ECUC-GEN-010 when target path missing', () => {
    // v1.14.0 MINOR S9 — fixture uses containers[] shape; the target
    // path tail 'ClockConfig_0' is not in containers[0].shortName.
    const tree = makeTree({
      EcuC: { containers: [], parameters: [], references: [] },
      Mcu: { containers: [{ shortName: 'OtherConfig' }], parameters: [], references: [] },
    });
    const diags = validateReferences(tree);
    const err = diags.find((d) => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED);
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
