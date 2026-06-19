// @vitest-environment jsdom
//
// useRemoveEcucFiles (Sprint 16 / T5) — set-semantic exclude
// orchestration hook. Companion to useCreateEcucFromBswmd.
//
// Tests pin:
//   1. happy path: clean ECUCs → silent delete + removeDocument
//   2. dirty target → opens ConfirmDialog with excludeEcuc axis
//   3. dirty + user picks 'continue' → returns { kind: 'canceled' }
//   4. dirty + user picks 'discard' → proceeds without saving
//   5. dirty + user picks 'saveAndProceed' → silent-save then remove
//   6. partial delete failure → returns { kind: 'partial' }
//   7. all-delete failure → returns { kind: 'error' }
//   8. no matching docs → returns { kind: 'ok', removed: [] }

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types';
import type { ProjectDeleteArxmlResult } from '@shared/types';

import { useArxmlStore } from '../../store/useArxmlStore';
import { useRemoveEcucFiles } from '../useRemoveEcucFiles';

// ConfirmDialog is module-level; mock the `confirm` function so we
// can drive each choice deterministically.
const { confirmMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
}));

vi.mock('../../components/ConfirmDialog', () => ({
  confirm: confirmMock,
}));

// Mock the autosarApi bridge — we only need deleteArxml + saveArxml
// for these tests.
interface MockAutosarApi {
  deleteArxml: ReturnType<typeof vi.fn>;
  saveArxml: ReturnType<typeof vi.fn>;
}
function installApi(overrides: Partial<MockAutosarApi> = {}): MockAutosarApi {
  const api: MockAutosarApi = {
    deleteArxml: vi.fn(async (): Promise<ProjectDeleteArxmlResult> => ({ kind: 'ok' })),
    saveArxml: vi.fn(async () => ({ ok: true, value: { canceled: false, path: '' } })),
    ...overrides,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = api;
  return api;
}

function makeDoc(opts: { path: string; sourceBswmdPath?: string; moduleShortName?: string }): ArxmlDocument {
  return {
    path: opts.path,
    version: '4.6',
    sourceBswmdPath: opts.sourceBswmdPath,
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: opts.moduleShortName ?? 'Can',
            params: {},
            children: [],
            references: [],
          },
        ],
      },
    ],
  };
}

function pickModule(bswmdPath: string, moduleShortName: string) {
  return { bswmdPath, moduleShortName };
}

async function callRemove(picks: Parameters<ReturnType<typeof useRemoveEcucFiles>['remove']>[0]) {
  const { result } = (await import('@testing-library/react')).renderHook(() =>
    useRemoveEcucFiles(),
  );
  return result.current.remove(picks);
}

beforeEach(() => {
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
  confirmMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRemoveEcucFiles (Sprint 16 / T5)', () => {
  it('removes a clean ECUC silently (no dialog)', async () => {
    const api = installApi();
    const state = useArxmlStore.getState();
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/Can_EcucValues.arxml', sourceBswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }),
      '/BSWMD/Can.arxml',
    );
    // No dirtyPaths entry → not dirty.

    const r = await callRemove([pickModule('/BSWMD/Can.arxml', 'Can')]);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.removed).toEqual(['/proj/ecuc/Can_EcucValues.arxml']);
    expect(api.deleteArxml).toHaveBeenCalledWith({ filePath: '/proj/ecuc/Can_EcucValues.arxml' });
    expect(useArxmlStore.getState().documents).toEqual([]);
    expect(useArxmlStore.getState().documentPaths).toEqual([]);
    // No dirty-guard for clean targets.
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('opens ConfirmDialog when any target is dirty', async () => {
    const api = installApi();
    const state = useArxmlStore.getState();
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/Can_EcucValues.arxml', sourceBswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }),
      '/BSWMD/Can.arxml',
    );
    // Mark dirty
    useArxmlStore.setState({ dirtyPaths: new Set(['/proj/ecuc/Can_EcucValues.arxml']) });
    confirmMock.mockResolvedValueOnce('discard');

    const r = await callRemove([pickModule('/BSWMD/Can.arxml', 'Can')]);
    expect(r.kind).toBe('ok');
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock.mock.calls[0]?.[0]?.message).toContain('Can');
    expect(api.deleteArxml).toHaveBeenCalledTimes(1);
  });

  it('returns canceled when user picks continue at dirty-guard', async () => {
    installApi();
    const state = useArxmlStore.getState();
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/Can_EcucValues.arxml', sourceBswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }),
      '/BSWMD/Can.arxml',
    );
    useArxmlStore.setState({ dirtyPaths: new Set(['/proj/ecuc/Can_EcucValues.arxml']) });
    confirmMock.mockResolvedValueOnce('continue');

    const r = await callRemove([pickModule('/BSWMD/Can.arxml', 'Can')]);
    expect(r.kind).toBe('canceled');
    // The doc must still be in the store.
    expect(useArxmlStore.getState().documents.length).toBe(1);
  });

  it('saveAndProceed silently saves dirty targets via currentPath before deletion', async () => {
    const api = installApi();
    const state = useArxmlStore.getState();
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/Can_EcucValues.arxml', sourceBswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }),
      '/BSWMD/Can.arxml',
    );
    useArxmlStore.setState({ dirtyPaths: new Set(['/proj/ecuc/Can_EcucValues.arxml']) });
    confirmMock.mockResolvedValueOnce('saveAndProceed');

    const r = await callRemove([pickModule('/BSWMD/Can.arxml', 'Can')]);
    expect(r.kind).toBe('ok');
    // Silent save was called with currentPath.
    expect(api.saveArxml).toHaveBeenCalledWith(
      expect.objectContaining({ currentPath: '/proj/ecuc/Can_EcucValues.arxml' }),
    );
    expect(api.deleteArxml).toHaveBeenCalledTimes(1);
    // The dirty flag should be cleared (markSaved was called).
    expect(useArxmlStore.getState().dirtyPaths.has('/proj/ecuc/Can_EcucValues.arxml')).toBe(false);
  });

  it('returns partial when some deletes fail', async () => {
    const api = installApi({
      deleteArxml: vi.fn(async (req): Promise<ProjectDeleteArxmlResult> => {
        // Fail only the exact Can path; CanIf succeeds. Note we must
        // match on the exact basename (Can_EcucValues.arxml) and not
        // `.includes('Can')` because 'CanIf_EcucValues.arxml' also
        // matches that substring.
        if (req.filePath.endsWith('Can_EcucValues.arxml')) {
          return { kind: 'write-failed', message: 'EACCES' };
        }
        return { kind: 'ok' };
      }),
    });
    const state = useArxmlStore.getState();
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/Can_EcucValues.arxml', sourceBswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }),
      '/BSWMD/Can.arxml',
    );
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/CanIf_EcucValues.arxml', sourceBswmdPath: '/BSWMD/CanIf.arxml', moduleShortName: 'CanIf' }),
      '/BSWMD/CanIf.arxml',
    );

    const r = await callRemove([
      pickModule('/BSWMD/Can.arxml', 'Can'),
      pickModule('/BSWMD/CanIf.arxml', 'CanIf'),
    ]);
    expect(r.kind).toBe('partial');
    if (r.kind !== 'partial') return;
    expect(r.removed).toEqual(['/proj/ecuc/CanIf_EcucValues.arxml']);
    expect(r.failed[0]?.message).toBe('EACCES');
    expect(api.deleteArxml).toHaveBeenCalledTimes(2);
  });

  it('returns error when all deletes fail', async () => {
    installApi({
      deleteArxml: vi.fn(async (): Promise<ProjectDeleteArxmlResult> => ({
        kind: 'write-failed',
        message: 'EACCES',
      })),
    });
    const state = useArxmlStore.getState();
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/Can_EcucValues.arxml', sourceBswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }),
      '/BSWMD/Can.arxml',
    );

    const r = await callRemove([pickModule('/BSWMD/Can.arxml', 'Can')]);
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.message).toBe('EACCES');
  });

  it('returns ok with empty removed when no docs match the picks', async () => {
    const api = installApi();
    const r = await callRemove([pickModule('/BSWMD/Missing.arxml', 'Missing')]);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.removed).toEqual([]);
    expect(api.deleteArxml).not.toHaveBeenCalled();
  });

  // Sprint 16c #3 — save-then-delete race fix. When the user picks
  // saveAndProceed and the FIRST save fails, the save loop must
  // break; the failed target must NOT be deleted (its dirty edits
  // are still in memory and would otherwise be silently lost).
  // Targets whose saves DID succeed are still deleted because their
  // state is already committed to disk.
  it('saveAndProceed aborts on first save failure and holds back the failed target', async () => {
    const api = installApi({
      saveArxml: vi.fn(async (req: { currentPath?: string }) => {
        // Can saves successfully; CanIf fails. The mock must inspect
        // `currentPath` to know which target it is handling.
        if (req.currentPath?.endsWith('CanIf_EcucValues.arxml')) {
          return { ok: false, error: { kind: 'write-failed', message: 'EACCES' } };
        }
        return { ok: true, value: { canceled: false, path: req.currentPath ?? '' } };
      }),
    });
    const state = useArxmlStore.getState();
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/Can_EcucValues.arxml', sourceBswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }),
      '/BSWMD/Can.arxml',
    );
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/CanIf_EcucValues.arxml', sourceBswmdPath: '/BSWMD/CanIf.arxml', moduleShortName: 'CanIf' }),
      '/BSWMD/CanIf.arxml',
    );
    useArxmlStore.setState({
      dirtyPaths: new Set([
        '/proj/ecuc/Can_EcucValues.arxml',
        '/proj/ecuc/CanIf_EcucValues.arxml',
      ]),
    });
    confirmMock.mockResolvedValueOnce('saveAndProceed');

    const r = await callRemove([
      pickModule('/BSWMD/Can.arxml', 'Can'),
      pickModule('/BSWMD/CanIf.arxml', 'CanIf'),
    ]);

    expect(r.kind).toBe('partial');
    if (r.kind !== 'partial') return;

    // Can saved successfully → deleted.
    // CanIf save failed → held back, NOT deleted.
    expect(r.removed).toEqual(['/proj/ecuc/Can_EcucValues.arxml']);
    expect(r.failed).toHaveLength(1);
    const entry = r.failed[0];
    expect(entry?.filePath).toBe('/proj/ecuc/CanIf_EcucValues.arxml');
    expect(entry?.moduleShortName).toBe('CanIf');
    expect(entry?.phase).toBe('save');
    expect(entry?.message).toBe('EACCES');

    // Can was markSaved-ed (dirty flag cleared); CanIf stays dirty
    // because its save failed.
    const dirtyAfter = useArxmlStore.getState().dirtyPaths;
    expect(dirtyAfter.has('/proj/ecuc/Can_EcucValues.arxml')).toBe(false);
    expect(dirtyAfter.has('/proj/ecuc/CanIf_EcucValues.arxml')).toBe(true);

    // CanIf's in-memory document is still present (NOT removed).
    const docs = useArxmlStore.getState().documents;
    expect(docs.map((d) => d.path)).toEqual(['/proj/ecuc/CanIf_EcucValues.arxml']);

    // Localised toast was surfaced via setError.
    expect(useArxmlStore.getState().error).toContain('CanIf');
    expect(useArxmlStore.getState().error).toContain('EACCES');

    // Save loop must NOT have attempted CanIf's save twice; break
    // happens immediately after the first failure.
    expect(api.saveArxml).toHaveBeenCalledTimes(2);
    expect(api.deleteArxml).toHaveBeenCalledTimes(1);
    expect(api.deleteArxml).toHaveBeenCalledWith({
      filePath: '/proj/ecuc/Can_EcucValues.arxml',
    });
  });

  // Sprint 16c #3 — edge case: only one dirty target, its save
  // fails. No targets are deleted; result is 'partial' with empty
  // `removed` and a single save-phase failure.
  it('saveAndProceed with a single dirty target that fails to save returns partial with no deletions', async () => {
    const api = installApi({
      saveArxml: vi.fn(async () => ({
        ok: false,
        error: { kind: 'write-failed', message: 'ENOSPC' },
      })),
    });
    const state = useArxmlStore.getState();
    state.addDocumentWithSource(
      makeDoc({ path: '/proj/ecuc/Can_EcucValues.arxml', sourceBswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }),
      '/BSWMD/Can.arxml',
    );
    useArxmlStore.setState({
      dirtyPaths: new Set(['/proj/ecuc/Can_EcucValues.arxml']),
    });
    confirmMock.mockResolvedValueOnce('saveAndProceed');

    const r = await callRemove([pickModule('/BSWMD/Can.arxml', 'Can')]);

    expect(r.kind).toBe('partial');
    if (r.kind !== 'partial') return;
    expect(r.removed).toEqual([]);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]?.phase).toBe('save');
    expect(r.failed[0]?.message).toBe('ENOSPC');

    // Doc must still be in the store (NOT removed).
    expect(useArxmlStore.getState().documents.length).toBe(1);
    // Dirty flag preserved (save failed, markSaved not called).
    expect(useArxmlStore.getState().dirtyPaths.size).toBe(1);
    // No delete was attempted.
    expect(api.deleteArxml).not.toHaveBeenCalled();
  });
});