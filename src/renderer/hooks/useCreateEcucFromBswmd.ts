// useCreateEcucFromBswmd — Sprint 14 Task 8 orchestration hook.
//
// Orchestrates the BSWMD-to-ECUC creation flow:
//
//   1. Resolve on-disk write targets via `resolveCollisionFilename`
//      (T3, key shape `${bswmdPath}::${moduleShortName}`).
//   2. For each pick, look up the matching BSWMD schema, build an
//      ECUC value-side skeleton, and serialise it via the project's
//      `serializeArxml` (single source of truth — no inline serialiser).
//   3. Call `window.autosarApi.writeArxmlBatch`.
//   4. Switch on the result:
//        - `write-failed` → return `{ kind: 'error', ... }`.
//          Nothing was written, so no rollback is needed.
//        - `partial` → delete every successfully written file via
//          `window.autosarApi.deleteArxml` to undo the partial state,
//          then return `{ kind: 'partial', ... }` so the caller can
//          surface the failed entries.
//        - `ok` → for each pick, build the skeleton again and hand
//          it to `useArxmlStore.addDocumentWithSource(skeleton, bswmdPath)`
//          so the new file becomes a tracked project document with
//          provenance. Return `{ kind: 'ok', ... }`.
//
// Sprint 14 / Task 8 — pure orchestration hook. Returns a single
// `create(input)` action; the host component wires it to the picker
// dialog's "Generate" button (T10 / T11).
//
// Plan drift adaptations vs the brief (see task-8-report.md):
//
//   - **`serializeArxml` from `@core/arxml/serializer` instead of an
//     inline `serialize()`.** The brief's inline serialiser targeted a
//     `{ tagName, attributes, children, text? }` shape that the
//     discriminated-union `ArxmlElement` does not use. The project
//     serializer accepts `packages[]` directly and produces valid
//     round-trippable XML.
//
//   - **No `skeleton.root`.** The project's `generateEcucSkeleton`
//     returns an `ArxmlDocument` whose children live under
//     `packages[].elements[]`. We pass the whole skeleton to
//     `serializeArxml` — no extraction needed.
//
//   - **T3 key shape.** `${bswmdPath}::${moduleShortName}` (not the
//     brief's `${moduleShortName}/${bswmdPath}`). T3 owns this
//     contract; mirroring it keeps `paths.get(...)` symmetric.
//
//   - **No `markPathDirty` call.** The brief asserted that newly added
//     docs are dirty. That's wrong: `addDocument` explicitly drops the
//     path from `dirtyPaths` because freshly written content matches
//     disk. The hook therefore never marks dirty on success; if the
//     caller wants to mark dirty later they mutate via `updateParam`.
//
//   - **Empty-picks guard.** `create({ picks: [], ... })` short-circuits
//     to `{ kind: 'ok', written: [], failed: [] }` without touching IPC
//     or the store. The brief's flow would have queued zero files,
//     called `writeArxmlBatch({ files: [] })`, and surfaced whatever the
//     IPC returned — which is a wasted round-trip and risks confusing
//     the user when a "Generate" click that selected nothing still
//     displays a result.

import { useCallback } from 'react';

import { serializeArxml } from '@core/arxml/serializer.js';
import { generateEcucSkeleton, resolveCollisionFilename } from '@core/arxml/skeleton.js';
import type { PickedModule } from '@core/arxml/skeleton.js';

import { useArxmlStore } from '../store/useArxmlStore.js';

// ---------------------------------------------------------------------------
// window.autosarApi
// ---------------------------------------------------------------------------
//
// The global Window augmentation lives in `src/renderer/env.d.ts`,
// which imports the `AutosarApi` type from `src/preload/index.ts`.
// That gives us static type-safety for every IPC method without
// re-declaring it locally — earlier drafts of this hook shipped a
// local `declare global { interface Window { autosarApi: ... } }`
// block, but TS rejected it with `TS2717` because the global was
// already augmented with the full `AutosarApi` shape.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreateEcucInput {
  readonly picks: readonly PickedModule[];
  readonly projectDir: string;
}

/**
 * Result of `create()`. Three outcomes:
 *   - `ok`     — every picked module was written and registered in the store.
 *   - `partial` — IPC reported partial failure; the already-written files
 *                were rolled back via `deleteArxml`, and the `failed` list
 *                contains the ones we couldn't write.
 *   - `error`  — IPC rejected the whole batch; nothing was written, no
 *                rollback needed.
 *
 * `written` and `failed` are always present (possibly empty) so callers
 * can destructure without per-branch narrowing.
 */
export interface CreateEcucResult {
  readonly kind: 'ok' | 'partial' | 'error';
  readonly written: readonly string[];
  readonly failed: readonly { readonly filePath: string; readonly message: string }[];
  readonly message?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCreateEcucFromBswmd(): {
  readonly create: (input: CreateEcucInput) => Promise<CreateEcucResult>;
} {
  const create = useCallback(async (input: CreateEcucInput): Promise<CreateEcucResult> => {
    // Empty-picks guard — short-circuit before any IPC / serialisation cost.
    if (input.picks.length === 0) {
      return { kind: 'ok', written: [], failed: [] };
    }

    const state = useArxmlStore.getState();
    const paths = resolveCollisionFilename(input.picks, input.projectDir);

    // Build {filePath, content}[] for the IPC batch. We memoize the
    // (filePath → skeleton) mapping so the success branch can hand the
    // skeleton back to `addDocumentWithSource` without regenerating it.
    const files: { readonly filePath: string; readonly content: string }[] = [];
    const skeletonByFilePath = new Map<string, ReturnType<typeof generateEcucSkeleton>>();
    const bswmdPathByFilePath = new Map<string, string>();

    for (const p of input.picks) {
      const schemaIdx = state.bswmdPaths.indexOf(p.bswmdPath);
      if (schemaIdx === -1) continue; // unknown BSWMD path — skip silently
      const schema = state.bswmdSchemas[schemaIdx];
      if (schema === undefined) continue; // defensive: parallel arrays drifted

      const filePath = paths.get(`${p.bswmdPath}::${p.moduleShortName}`);
      if (filePath === undefined) continue; // collision logic skipped this pick

      // T2's `generateEcucSkeleton` throws if the module shortName is
      // not in the schema. We let the throw propagate — it's a
      // programmer error (picker would not surface unknown modules)
      // and surfacing it as a thrown error is more informative than
      // silently dropping the pick.
      const skeleton = generateEcucSkeleton(schema, p.moduleShortName);
      const serialized = serializeArxml(skeleton);
      if (!serialized.ok) {
        return {
          kind: 'error',
          written: [],
          failed: [],
          message: `serialize failed for ${p.moduleShortName}: ${serialized.error.message}`,
        };
      }
      files.push({ filePath, content: serialized.value });
      skeletonByFilePath.set(filePath, skeleton);
      bswmdPathByFilePath.set(filePath, p.bswmdPath);
    }

    // No files to write means every pick's BSWMD path was unknown.
    // Treat that as a successful no-op rather than an error — the user
    // may have picked rows whose BSWMD was removed between picker
    // open and submit.
    if (files.length === 0) {
      return { kind: 'ok', written: [], failed: [] };
    }

    const result = await window.autosarApi.writeArxmlBatch({ files });

    // -- write-failed: nothing was written, no rollback needed. -----
    if (result.kind === 'write-failed') {
      return {
        kind: 'error',
        written: [],
        failed: [],
        message: result.message,
      };
    }

    // v1.15.5 — path-containment rejected the request (renderer-forged
    // path escapes the project dir, or no project is open). Treat as
    // a hard error so the user sees a clear message.
    if (result.kind === 'invalid-path') {
      return {
        kind: 'error',
        written: [],
        failed: [],
        message: result.message,
      };
    }

    // -- partial: roll back every file that did get written, --------
    // -- then surface the failures. ----------------------------------
    if (result.kind === 'partial') {
      for (const fp of result.written) {
        await window.autosarApi.deleteArxml({ filePath: fp });
      }
      return {
        kind: 'partial',
        written: [], // rollback means nothing remains written
        failed: result.failed,
        message: 'partial batch failure — partial writes rolled back',
      };
    }

    // -- ok: register every newly written file in the store. ---------
    for (const fp of result.written) {
      const skeleton = skeletonByFilePath.get(fp);
      const bswmdPath = bswmdPathByFilePath.get(fp);
      if (skeleton === undefined || bswmdPath === undefined) continue;
      // Stamp the on-disk path onto the skeleton so `addDocument` and
      // the rest of the store pipeline see the right `path` field.
      useArxmlStore.getState().addDocumentWithSource({ ...skeleton, path: fp }, bswmdPath);
    }

    return { kind: 'ok', written: result.written, failed: [] };
  }, []);

  return { create };
}
