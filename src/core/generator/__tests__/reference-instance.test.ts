// core/generator/__tests__/reference-instance.test.ts
//
// v1.14.0 MINOR S9 — instance-level reference target validation
// (D-rev2 Senior S9). Replaces the loose `mod[targetPath]` lookup
// in validateReferences that silently accepted any string match.

import { describe, it, expect } from 'vitest';

import { DiagnosticCode, DiagnosticSeverity } from '../diagnostics.js';
import { validateReferences } from '../emit/reference.js';
import { normalizeToTree, type EcucModuleConfigurationValuesInput } from '../normalize.js';

describe('validateReferences — instance-level (D-rev2 S9)', () => {
  it('errors when target path does not resolve to a known container instance', () => {
    // Target module 'Os' has a container 'OsCore_0' but the reference
    // points at 'Os/OsCore/OsCore_0/Nonexistent' — no such instance.
    // v1.13.x silently accepted this because the lookup was a loose
    // string match. S9 rejects it.
    const tree = normalizeToTree(
      new Map(),
      new Map<string, EcucModuleConfigurationValuesInput>([
        [
          'EcuC',
          {
            definitionRef: '/AUTOSAR/EcucDefs/EcuC',
            parameters: [],
            references: [
              {
                path: 'EcuC/EcuCGeneral/PartitionRef',
                targetModule: 'Os',
                targetPath: 'Os/OsCore/OsCore_0/Nonexistent',
              },
            ],
          },
        ],
        [
          'Os',
          {
            definitionRef: '/AUTOSAR/EcucDefs/Os',
            parameters: [],
            references: [],
            containers: [{ shortName: 'OsCore_0' }],
          },
        ],
      ]),
    );
    const diags = validateReferences(tree);
    const refUnresolved = diags.filter((d) => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED);
    expect(refUnresolved).toHaveLength(1);
    const first = refUnresolved[0]!;
    expect(first.severity).toBe(DiagnosticSeverity.ERROR);
    expect(first.moduleShortName).toBe('EcuC');
    expect(first.ecucPath).toBe('EcuC/EcuCGeneral/PartitionRef');
  });

  it('accepts a reference whose target matches a known container instance', () => {
    // Target path tail 'OsCore_0' matches the container instance
    // declared in 'Os'. Must NOT push an instance-level diagnostic.
    const tree = normalizeToTree(
      new Map(),
      new Map<string, EcucModuleConfigurationValuesInput>([
        [
          'EcuC',
          {
            definitionRef: '/AUTOSAR/EcucDefs/EcuC',
            parameters: [],
            references: [
              {
                path: 'EcuC/EcuCGeneral/PartitionRef',
                targetModule: 'Os',
                targetPath: 'Os/OsCore/OsCore_0',
              },
            ],
          },
        ],
        [
          'Os',
          {
            definitionRef: '/AUTOSAR/EcucDefs/Os',
            parameters: [],
            references: [],
            containers: [{ shortName: 'OsCore_0' }],
          },
        ],
      ]),
    );
    const diags = validateReferences(tree);
    // No REF_UNRESOLVED from instance check; target module is loaded
    // and the path tail matches a real container shortName.
    expect(diags.filter((d) => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED)).toHaveLength(0);
  });

  it('still errors when target module itself is not loaded (regression guard)', () => {
    // The instance check is in addition to the existing module-loaded
    // check; both must hold for a reference to be valid.
    const tree = normalizeToTree(
      new Map(),
      new Map<string, EcucModuleConfigurationValuesInput>([
        [
          'EcuC',
          {
            definitionRef: '/AUTOSAR/EcucDefs/EcuC',
            parameters: [],
            references: [
              {
                path: 'EcuC/EcuCGeneral/PartitionRef',
                targetModule: 'MissingMod',
                targetPath: 'MissingMod/Whatever',
              },
            ],
          },
        ],
      ]),
    );
    const diags = validateReferences(tree);
    expect(diags.some((d) => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED)).toBe(true);
  });
});
