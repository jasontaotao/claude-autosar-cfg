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
});