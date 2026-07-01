// v1.20.0 T1 C2.4 — scriptMutationToPatchStep mapper.
//
// Pure function: map a script-shaped `ScriptMutation` (3 kinds) to
// the wire-shape `PatchStep` (7 kinds). The script engine uses
// looser type names + a smaller kind set; the CLI patch engine
// uses stricter types + more kinds. The mapper is a thin field-
// rename + a cascade-default flip.
//
//   - `set-param`   → `set-param`                  (1:1, newValue → value)
//   - `add-child`   → `add-child`                  (1:1, containerPath/newShortName → parentPath/shortName)
//   - `remove-child`→ `remove-with-cascade { cascade: true }`
//                     (script commits cannot present the cascade
//                     confirmation dialog mid-script, so cascade
//                     MUST be true; refs cause applyPatchSteps to
//                     emit an error rather than a silent no-op)
//
// Returns a `PatchStep` (the canonical wire shape consumed by
// `applyPatchSteps` in `src/core/mutation/applyPatchSteps.ts`).
// The mapper is pure: no I/O, no store imports, no state.

import type { ScriptMutation } from '@shared/script/types';

import type { PatchStep } from '../../../core/mutation/applyPatchSteps.js';

export function scriptMutationToPatchStep(m: ScriptMutation): PatchStep {
  switch (m.kind) {
    case 'set-param':
      return {
        op: 'set-param',
        containerPath: m.containerPath,
        paramName: m.paramName,
        value: m.newValue as string | number | boolean | null,
      };
    case 'add-child':
      return {
        op: 'add-child',
        parentPath: m.containerPath,
        shortName: m.newShortName,
      };
    case 'remove-child':
      return {
        op: 'remove-with-cascade',
        containerPath: m.containerPath,
        cascade: true,
      };
  }
}
