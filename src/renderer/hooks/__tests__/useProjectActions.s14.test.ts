// @vitest-environment jsdom
//
// `useProjectActions.removeBswmdWithCascade` — Sprint 14 Task 12 hook
// tests.
//
// Plan drift adaptations (recorded for the implementation report):
//
//   1. **Dialog API.** The brief mocks `confirm` from
//      `../../components/ConfirmDialog`. That module's `confirm()`
//      only accepts the dirty-guard shape (`'continue' | 'discard' |
//      'saveAndProceed'`) and does NOT accept a custom `options: [{id,
//      label}]` payload. Sprint 15 Phase 3.3 already shipped a
//      dedicated `CascadeConfirmDialog` (with `confirmCascade()`) that
//      implements the 3-option cascade semantics (cancel / only /
//      cascade) the brief wants. Reusing it is cleaner than
//      shoehorning a custom-options API into the existing
//      ConfirmDialog. The tests below mock `confirmCascade` from
//      `CascadeConfirmDialog` instead.
//
//   2. **i18n keys.** The brief asks for the 4 new
//      `ecuc.removeBswmd.*` keys. Those are added to i18n.ts for spec
//      parity (§14.4) but the active dialog (CascadeConfirmDialog)
//      still reads `confirm.cascade.*`. The keys are reserved for a
//      future dedicated dialog; the current implementation does not
//      call `t(locale, 'ecuc.removeBswmd.*')` at runtime — those
//      strings would be dead code if consumed, and the active dialog
//      already localizes correctly via the existing keys.
//
//   3. **Test fixture shape.** The brief wrote the doc as
//      `{ path, root: { tagName, attributes, children } }`. The
//      project's actual `ArxmlDocument` shape (post-Sprint-12 #1) is
//      `{ path, version, packages, sourceBswmdPath? }`. Tests use the
//      real shape; BSWMD schema entry mirrors `useArxmlStore.s14.test.ts`
//      (T7 fixtures).
//
//   4. **Cast BSWMD modules.** Hand-built `BswModuleDef` fixtures cast
//      via `as unknown as BswModuleDef` to satisfy
//      `exactOptionalPropertyTypes` strictness — same pattern as T4
//      and T7.
//
//   5. **`deleteArxml` IPC stub.** The brief mocks `window.autosarApi`
//      with a single `deleteArxml: vi.fn()`. We expose the stub on
//      the same shape (projectDeleteArxmlHandler returns
//      `{ kind: 'ok' | 'not-found' | 'write-failed' }`) and assert
//      call args + call count to verify the cascade path was
//      exercised.
//
// Test scope:
//   - Test 1: cascade path — `confirmCascade` returns 'cascade' →
//     `deleteArxml` IPC fires for each dependent + `removeDocument`
//     removes from store + BSWMD itself is removed.
//   - Test 2: only path — `confirmCascade` returns 'only' → BSWMD
//     removed but dependents stay in the store.
//   - Test 3: cancel path — `confirmCascade` returns 'cancel' → no
//     mutations at all.
//   - Test 4: no dependents — dialog never shown; BSWMD removed
//     directly (no IPC, no store writes beyond `removeBswmd`).

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BswModuleDef, BswmdDocument } from '@core/project/bswmd.js';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectDeleteArxmlResult } from '../../../shared/types.js';
import * as CascadeConfirmDialogModule from '../../components/CascadeConfirmDialog.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useProjectActions } from '../useProjectActions.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * Hand-built `BswModuleDef` cast via `unknown` — the store only
 * inspects `shortName` here (for `findDependentsOfBswmd`'s caller),
 * so other mandatory fields stay empty. Same pattern T4/T7 use.
 */
function makeBswModuleDef(shortName: string): BswModuleDef {
  return {
    shortName,
    path: `/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
  } as unknown as BswModuleDef;
}

function makeBswmd(modules: readonly BswModuleDef[]): BswmdDocument {
  return { version: '4.0', modules, warnings: [] };
}

// ---------------------------------------------------------------------------
// IPC stub
// ---------------------------------------------------------------------------

interface AutosarApiStub {
  deleteArxml: (req: { readonly filePath: string }) => Promise<ProjectDeleteArxmlResult>;
}

let originalAutosarApi: unknown;

beforeEach(() => {
  originalAutosarApi = (window as { autosarApi?: unknown }).autosarApi;
  // Reset the store to a known multi-doc + BSWMD state: 1 BSWMD loaded
  // with 1 dependent ECUC value-side doc (so the cascade path has a
  // real dependent to find).
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('zh-CN');
  useArxmlStore.setState({
    bswmdSchemas: [makeBswmd([makeBswModuleDef('Can')])],
    bswmdPaths: ['D:/bswmd/Can.arxml'],
    documents: [
      {
        path: 'D:/proj/A_Cfg.arxml',
        version: '4.6',
        packages: [],
        sourceBswmdPath: 'D:/bswmd/Can.arxml',
      },
    ],
    documentPaths: ['D:/proj/A_Cfg.arxml'],
    project: {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Project',
      valueArxmlPaths: ['D:/proj/A_Cfg.arxml'],
      bswmdPaths: ['D:/bswmd/Can.arxml'],
    },
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

function installApiStub(): AutosarApiStub {
  const stub: AutosarApiStub = {
    deleteArxml: vi.fn(async () => ({ kind: 'ok' as const })),
  };
  (window as { autosarApi?: unknown }).autosarApi = stub;
  return stub;
}

// ===========================================================================
// Section 1 — removeBswmdWithCascade
// ===========================================================================

describe('useProjectActions — removeBswmdWithCascade (Sprint 14 Task 12)', () => {
  it('removes BSWMD + dependents when user picks cascade', async () => {
    // Arrange — install IPC stub, mock confirmCascade → 'cascade'
    const stub = installApiStub();
    const confirmCascadeSpy = vi
      .spyOn(CascadeConfirmDialogModule, 'confirmCascade')
      .mockResolvedValue('cascade' as never);

    // Act
    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithCascade('D:/bswmd/Can.arxml');
    });

    // Assert — dialog shown, IPC fired for the dependent, store
    // cleared of both BSWMD and doc.
    expect(confirmCascadeSpy).toHaveBeenCalledTimes(1);
    expect(confirmCascadeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        targetShortName: 'Can.arxml',
        references: expect.arrayContaining([
          expect.objectContaining({ filePath: 'D:/proj/A_Cfg.arxml' }),
        ]),
      }),
    );
    expect(stub.deleteArxml).toHaveBeenCalledTimes(1);
    expect(stub.deleteArxml).toHaveBeenCalledWith({ filePath: 'D:/proj/A_Cfg.arxml' });
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    expect(useArxmlStore.getState().documentPaths).toEqual([]);
  });

  it('removes only BSWMD when user picks "only"', async () => {
    // Arrange — mock confirmCascade → 'only' (== "仅移除 BSWMD")
    installApiStub();
    const stub = (window as unknown as { autosarApi: AutosarApiStub }).autosarApi;
    const confirmCascadeSpy = vi
      .spyOn(CascadeConfirmDialogModule, 'confirmCascade')
      .mockResolvedValue('only' as never);

    // Act
    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithCascade('D:/bswmd/Can.arxml');
    });

    // Assert — dialog shown, NO deleteArxml call, BSWMD removed but
    // dependent doc kept.
    expect(confirmCascadeSpy).toHaveBeenCalledTimes(1);
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
    expect(useArxmlStore.getState().documentPaths).toEqual(['D:/proj/A_Cfg.arxml']);
  });

  it('does nothing when user cancels', async () => {
    // Arrange — mock confirmCascade → 'cancel'
    installApiStub();
    const stub = (window as unknown as { autosarApi: AutosarApiStub }).autosarApi;
    const confirmCascadeSpy = vi
      .spyOn(CascadeConfirmDialogModule, 'confirmCascade')
      .mockResolvedValue('cancel' as never);

    // Act
    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithCascade('D:/bswmd/Can.arxml');
    });

    // Assert — dialog shown but no store mutations; BSWMD + doc stay.
    expect(confirmCascadeSpy).toHaveBeenCalledTimes(1);
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['D:/bswmd/Can.arxml']);
    expect(useArxmlStore.getState().documentPaths).toEqual(['D:/proj/A_Cfg.arxml']);
  });

  it('skips confirm dialog entirely when BSWMD has no dependents', async () => {
    // Arrange — drop the dependent doc so dependents is empty.
    useArxmlStore.setState({
      documents: [],
      documentPaths: [],
      project: {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Test Project',
        valueArxmlPaths: [],
        bswmdPaths: ['D:/bswmd/Can.arxml'],
      },
    });
    installApiStub();
    const stub = (window as unknown as { autosarApi: AutosarApiStub }).autosarApi;
    const confirmCascadeSpy = vi.spyOn(CascadeConfirmDialogModule, 'confirmCascade');

    // Act
    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithCascade('D:/bswmd/Can.arxml');
    });

    // Assert — no dialog, no IPC, BSWMD removed.
    expect(confirmCascadeSpy).not.toHaveBeenCalled();
    expect(stub.deleteArxml).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdPaths).toEqual([]);
  });

  it('localizes the cascade dialog via confirm.cascade keys (zh-CN)', async () => {
    // The active dialog reads confirm.cascade.* at render time. We
    // assert via a direct t() call that the keys exist and render the
    // expected localized strings. This pins the i18n contract that
    // CascadeConfirmDialog relies on.
    const { t, MessagesZhCN } = await import('../../../shared/i18n.js');
    expect(t('zh-CN', 'confirm.cascade.title', { name: 'Can.arxml' })).toBe(
      "删除 'Can.arxml'?",
    );
    expect(MessagesZhCN['confirm.cascade.only']).toBe('仅删容器');
    expect(MessagesZhCN['confirm.cascade.cascade']).toBe('一并删引用');
  });
});