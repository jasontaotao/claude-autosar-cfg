// core/arxml/mutation/types.ts
// Pure types + interfaces for the ECUC mutation engine. Split from
// `src/core/arxml/mutation.ts` as part of v1.41.x PATCH T2 (file-size
// backlog). Zero runtime code in this file — only `type` and `interface`
// declarations.
//
// Public surface re-exported by `./index.ts` and by the shim at
// `../mutation.ts`. Consumers in `core/arxml/`, `core/mutation/`, and
// `renderer/store/` import the types from this file or the barrel.
//
// Re-export of `ParamKind` from `../project/bswmd/index.js` is preserved
// here so the `MutationError` union's `expected: ParamDef['kind']`
// reference still resolves through the new barrel path.

import type { ParamDef, ParamKind } from '../../project/bswmd/index.js';

export type { ParamKind };

/**
 * Error envelope for the mutation functions. The 6 kinds cover the failure
 * modes the picker / delete flow can hit; the store action maps each to
 * a localized `setError()` message.
 */
export type MutationError =
  | { readonly kind: 'path-not-found'; readonly path: string }
  | { readonly kind: 'name-conflict'; readonly shortName: string }
  | {
      readonly kind: 'multiplicity-exceeded';
      readonly path: string;
      readonly upper: number;
      readonly current: number;
    }
  | {
      readonly kind: 'multiplicity-floor';
      readonly path: string;
      readonly lower: number;
      readonly current: number;
    }
  | { readonly kind: 'no-bswmd-for-module'; readonly modulePath: string }
  | {
      readonly kind: 'invalid-param-type';
      readonly key: string;
      readonly expected: ParamDef['kind'];
    };

/**
 * A single entry in the add-element picker. Combines the kind (container /
 * parameter / reference) with the multiplicity context so the renderer can
 * disable rows that would violate the schema without re-querying.
 */
export interface AllowedSubElement {
  readonly kind: 'container' | 'parameter' | 'reference';
  readonly shortName: string;
  readonly displayLabel: string;
  readonly multiplicity: {
    readonly lower: number;
    readonly upper: number | 'infinite';
    readonly current: number;
  };
  readonly disabled: boolean;
  readonly disabledReason?: 'at-max' | 'already-added';
}

/**
 * A reference to a path that points at a specific container / param.
 * Returned by `findReferencesTo` so the cascade-delete flow can
 * enumerate the dangling references a "Only delete" choice leaves behind.
 */
export interface ReferenceHit {
  readonly filePath: string;
  readonly containerPath: string;
  readonly paramKey: string;
}
