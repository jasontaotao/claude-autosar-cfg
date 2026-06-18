// @vitest-environment jsdom
//
// useCreateEcucFromBswmd — Sprint 14 Task 8 hook tests.
//
// Plan drift adaptations (recorded for the implementation report):
//
//   1. **Skeleton key shape.** The brief used
//      `${moduleShortName}/${bswmdPath}`. T3's `resolveCollisionFilename`
//      keys by `${bswmdPath}::${moduleShortName}` (see
//      `core/arxml/skeleton.ts` § Key shape). These tests mirror the
//      T3 convention.
//
//   2. **Serialized content via project serializer.** The brief wrote
//      an inline `serialize()` for the skeleton. The project has
//      `serializeArxml` from `@core/arxml/serializer`, which accepts
//      the packages-based `ArxmlDocument`. We call that here so the
//      `writeArxmlBatch` payload contains real, round-tripable XML.
//
//   3. **`skeleton.root` does not exist.** The brief's serialize call
//      reached for `skeleton.root`. The project's skeleton returns an
//      `ArxmlDocument` with `packages[]` (no `root`). The hook passes
//      `skeleton` (the whole document) to `serializeArxml`.
//
//   4. **No `markPathDirty` action.** The brief asserted that
//      `dirtyPaths.has(filePath)` is `true` after a successful create.
//      That is **semantically wrong**: `addDocument` (which
//      `addDocumentWithSource` delegates to) explicitly calls
//      `dropFromDirty` for the freshly added path because the on-disk
//      content matches what's now in memory. Newly added docs are NOT
//      dirty — they were just written by us. The third test below
//      replaces the brief's "marks dirty" assertion with a positive
//      assertion that the new doc is active and `dirtyPaths` does NOT
//      contain it (the correct semantic).
//
//   5. **`BswModuleDef` fixture cast.** Test fixtures cast a hand-built
//      `BswModuleDef` via `as unknown as BswModuleDef` to satisfy
//      `exactOptionalPropertyTypes` strictness (the brief's inline
//      fixture omitted optional `moduleId` etc.; same T4/T7 pattern).
//
// Test scope:
//   - Test 1: happy path — single pick → write + addDocument, doc
//     registered, activeDocumentPath set, file content is valid XML.
//   - Test 2: batch partial failure → rollback deletes the written
//     file, no docs are added.
//   - Test 3: after success, `activeDocumentPath === filePath` AND
//     `dirtyPaths` does NOT contain the new file (replaces brief's
//     "marks dirty" assertion).
//   - Test 4: empty picks → no IPC, no docs added, returns ok.

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ProjectDeleteArxmlResult,
  ProjectWriteArxmlBatchResult,
} from '../../../shared/types.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useCreateEcucFromBswmd } from '../useCreateEcucFromBswmd.js';

// ---------------------------------------------------------------------------
// AutosarApi stub shape
// ---------------------------------------------------------------------------

interface AutosarApiStub {
  writeArxmlBatch: (
    req: { readonly files: readonly { readonly filePath: string; readonly content: string }[] },
  ) => Promise<ProjectWriteArxmlBatchResult>;
  deleteArxml: (req: { readonly filePath: string }) => Promise<ProjectDeleteArxmlResult>;
}

let originalAutosarApi: unknown;

beforeEach(() => {
  originalAutosarApi = (window as { autosarApi?: unknown }).autosarApi;
  useArxmlStore.getState().clear();
  // Seed a minimal BSWMD schema set + corresponding path so the hook's
  // schema lookup (state.bswmdPaths.indexOf(p.bswmdPath)) finds a match.
  useArxmlStore.setState({
    bswmdSchemas: [
      {
        version: '4.0',
        modules: [
          {
            shortName: 'Can',
            path: '/Can',
            dialect: 'ecuc-module-def',
            moduleId: null,
            containers: [],
            providedEntries: [],
            lowerMultiplicity: 0,
            upperMultiplicity: 'infinite',
          },
          {
            shortName: 'CanIf',
            path: '/CanIf',
            dialect: 'ecuc-module-def',
            moduleId: null,
            containers: [],
            providedEntries: [],
            lowerMultiplicity: 0,
            upperMultiplicity: 'infinite',
          },
        ],
        warnings: [],
      },
    ],
    bswmdPaths: ['D:/bswmd/Can.arxml'],
  });
});

afterEach(() => {
  if (originalAutosarApi === undefined) {
    delete (window as { autosarApi?: unknown }).autosarApi;
  } else {
    (window as { autosarApi?: unknown }).autosarApi = originalAutosarApi;
  }
  cleanup();
  vi.restoreAllMocks();
});

function installApiStub(overrides: Partial<AutosarApiStub> = {}): AutosarApiStub {
  const stub: AutosarApiStub = {
    writeArxmlBatch:
      overrides.writeArxmlBatch ??
      (async () => ({ kind: 'write-failed' as const, message: 'unconfigured stub' })),
    deleteArxml:
      overrides.deleteArxml ?? (async () => ({ kind: 'ok' as const })),
  };
  (window as { autosarApi?: unknown }).autosarApi = stub;
  return stub;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCreateEcucFromBswmd — Sprint 14 Task 8 hook', () => {
  it('generates, writes, and adds documents for picked modules (happy path)', async () => {
    // Arrange
    const writeSpy = vi.fn(
      async (
        _req: { readonly files: readonly { readonly filePath: string; readonly content: string }[] },
      ): Promise<ProjectWriteArxmlBatchResult> => ({
        kind: 'ok' as const,
        written: ['D:/proj/Can_Cfg.arxml'],
      }),
    );
    installApiStub({ writeArxmlBatch: writeSpy });

    // Act
    const { result } = renderHook(() => useCreateEcucFromBswmd());
    let response: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      response = await result.current.create({
        picks: [{ bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' }],
        projectDir: 'D:/proj',
      });
    });

    // Assert: write was invoked once with one file
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const writeArg = writeSpy.mock.calls[0]![0];
    expect(writeArg.files).toHaveLength(1);
    expect(writeArg.files[0]!.filePath).toBe('D:/proj/Can_Cfg.arxml');
    // File content is valid XML (serializeArxml output).
    expect(writeArg.files[0]!.content).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(writeArg.files[0]!.content).toMatch(/<ECUC-MODULE-CONFIGURATION-VALUES>/);

    // Result kind is ok and the doc is registered.
    expect(response).toEqual({
      kind: 'ok',
      written: ['D:/proj/Can_Cfg.arxml'],
      failed: [],
    });
    const after = useArxmlStore.getState();
    expect(after.documentPaths).toContain('D:/proj/Can_Cfg.arxml');
    expect(after.documents).toHaveLength(1);
    // The generated doc carries provenance back to the BSWMD path.
    expect(after.documents[0]!.sourceBswmdPath).toBe('D:/bswmd/Can.arxml');
  });

  it('rolls back partial writes on batch failure', async () => {
    // Arrange
    const writeSpy = vi.fn(
      async (
        _req: { readonly files: readonly { readonly filePath: string; readonly content: string }[] },
      ): Promise<ProjectWriteArxmlBatchResult> => ({
        kind: 'partial' as const,
        written: ['D:/proj/Can_Cfg.arxml'],
        failed: [{ filePath: 'D:/proj/CanIf_Cfg.arxml', message: 'EACCES' }],
      }),
    );
    const deleteSpy = vi.fn(
      async (_req: { readonly filePath: string }): Promise<ProjectDeleteArxmlResult> => ({
        kind: 'ok' as const,
      }),
    );
    installApiStub({ writeArxmlBatch: writeSpy, deleteArxml: deleteSpy });

    // Act — pick two modules from the same BSWMD so both files get queued
    const { result } = renderHook(() => useCreateEcucFromBswmd());
    let response: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      response = await result.current.create({
        picks: [
          { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' },
          { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'CanIf' },
        ],
        projectDir: 'D:/proj',
      });
    });

    // Assert: rollback deleted the written file (and only the written one).
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith({ filePath: 'D:/proj/Can_Cfg.arxml' });
    // No docs added (roll back means store remains empty).
    expect(useArxmlStore.getState().documents).toHaveLength(0);
    expect(useArxmlStore.getState().documentPaths).toEqual([]);
    // Result is 'partial' with the failed entry surfaced.
    expect(response?.kind).toBe('partial');
    expect(response?.failed).toEqual([
      { filePath: 'D:/proj/CanIf_Cfg.arxml', message: 'EACCES' },
    ]);
  });

  it('correctly identifies active document after successful create', async () => {
    // Arrange — single pick, single write
    installApiStub({
      writeArxmlBatch: async (_req) => ({
        kind: 'ok' as const,
        written: ['D:/proj/Can_Cfg.arxml'],
      }),
    });

    // Act
    const { result } = renderHook(() => useCreateEcucFromBswmd());
    await act(async () => {
      await result.current.create({
        picks: [{ bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' }],
        projectDir: 'D:/proj',
      });
    });

    // Assert — REPLACES the brief's wrong "marks dirty" assertion.
    // The newly added doc IS the active doc (addDocument sets activeDocumentPath).
    const after = useArxmlStore.getState();
    expect(after.activeDocumentPath).toBe('D:/proj/Can_Cfg.arxml');
    // The newly added doc is NOT marked dirty — it was just written by us,
    // so the on-disk content matches what's in memory. addDocument
    // explicitly drops the path from `dirtyPaths` (see store comment in
    // `addDocument`). The brief's "dirtyPaths.has(filePath) === true"
    // assertion was semantically wrong.
    expect(after.dirtyPaths.has('D:/proj/Can_Cfg.arxml')).toBe(false);
  });

  it('handles empty picks gracefully — no IPC, no docs added, returns ok', async () => {
    // Arrange — install spies that should never be called
    const writeSpy = vi.fn(
      async (): Promise<ProjectWriteArxmlBatchResult> => ({
        kind: 'ok' as const,
        written: [],
      }),
    );
    installApiStub({ writeArxmlBatch: writeSpy });

    // Act
    const { result } = renderHook(() => useCreateEcucFromBswmd());
    let response: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      response = await result.current.create({
        picks: [],
        projectDir: 'D:/proj',
      });
    });

    // Assert — write never called, no docs added, result is ok with empty written
    expect(writeSpy).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().documents).toHaveLength(0);
    expect(response?.kind).toBe('ok');
    expect(response?.written).toEqual([]);
  });
});