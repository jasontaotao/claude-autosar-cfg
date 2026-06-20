// @vitest-environment jsdom
//
// Sprint 17 P1 — `removeBswmdFromDisk` + `undoLastRemoveBswmd`
// store tests.
//
// Pins the contract for the new store actions that wrap the
// `bswmd:delete` IPC channel (P1.3):
//
//   1. `removeBswmdFromDisk` (IPC ok) → bswmdSchemas/bswmdPaths
//      shrink + project sync + lastRemoveSnapshot set + no error toast
//   2. `removeBswmdFromDisk` (IPC not-found) → same as ok (idempotent
//      against a user-deleted file). The snapshot is still pushed so
//      undo is meaningful.
//   3. `removeBswmdFromDisk` (IPC write-failed) → schemas unchanged,
//      error toast set, no snapshot pushed
//   4. `removeBswmdFromDisk` (unknown path) → no-op, no IPC call
//   5. `undoLastRemoveBswmd` round-trip → after remove+undo the schema
//      is back in the store, snapshot is cleared
//   6. `undoLastRemoveBswmd` without a prior remove → no-op
//
// IPC mock strategy: `(globalThis as any).window.autosarApi = api`
// — same pattern as `useScriptStore.test.ts` and
// `useProjectActions.test.ts`. The store reads `window.autosarApi`
// at call time, so per-test stubbing works without any module-level
// mock.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useArxmlStore } from '../useArxmlStore.js';

// Minimal valid BSWMD (autosar-standard ECUC-MODULE-DEF dialect) —
// the parser only needs well-formed XML + an <AUTOSAR> root + an
// <AR-PACKAGES> branch to accept it. Same fixture as
// `useArxmlStore.bswmd.test.ts`.
const MIN_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Adc</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>AdcGeneral</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

type DeleteResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'write-failed'; readonly message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<any>>;
type MockApi = { readonly deleteBswmd: MockFn };

function makeApi(overrides: Partial<MockApi> = {}): MockApi {
  return {
    deleteBswmd: vi.fn(async (): Promise<DeleteResult> => ({ kind: 'ok' })),
    ...overrides,
  };
}

function installApi(api: MockApi): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = api;
}

beforeEach(() => {
  useArxmlStore.getState().clear();
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window.autosarApi;
});

describe('useArxmlStore — removeBswmdFromDisk (Sprint 17 P1)', () => {
  it('IPC ok → schemas shrink + snapshot pushed + no error', async () => {
    // Arrange
    installApi(makeApi({ deleteBswmd: vi.fn(async () => ({ kind: 'ok' as const })) }));
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);
    useArxmlStore.getState().addBswmd('/schemas/Can.bswmd.arxml', MIN_BSWMD);
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(2);

    // Act
    const r = await useArxmlStore.getState().removeBswmdFromDisk('/schemas/Adc.bswmd.arxml');

    // Assert — return shape
    expect(r.kind).toBe('ok');
    // Assert — state: schema dropped, paths synced, snapshot pushed
    const after = useArxmlStore.getState();
    expect(after.bswmdPaths).toEqual(['/schemas/Can.bswmd.arxml']);
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.lastRemoveSnapshot).not.toBeNull();
    expect(after.lastRemoveSnapshot?.path).toBe('/schemas/Adc.bswmd.arxml');
    expect(after.error).toBeNull();
    // Assert — IPC was called exactly once with the right path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).window.autosarApi;
    expect(api.deleteBswmd).toHaveBeenCalledTimes(1);
    expect(api.deleteBswmd).toHaveBeenCalledWith({ filePath: '/schemas/Adc.bswmd.arxml' });
  });

  it('IPC not-found → schemas still shrink (idempotent) + snapshot pushed', async () => {
    // Arrange — user may have already deleted the file on disk; the
    // cascade flow must treat this as success and proceed.
    installApi(makeApi({ deleteBswmd: vi.fn(async () => ({ kind: 'not-found' as const })) }));
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);

    // Act
    const r = await useArxmlStore.getState().removeBswmdFromDisk('/schemas/Adc.bswmd.arxml');

    // Assert — return shape
    expect(r.kind).toBe('ok');
    // Assert — state: still removed (idempotent), snapshot pushed so
    // undo is still meaningful.
    const after = useArxmlStore.getState();
    expect(after.bswmdPaths).toEqual([]);
    expect(after.bswmdSchemas).toHaveLength(0);
    expect(after.lastRemoveSnapshot).not.toBeNull();
    expect(after.error).toBeNull();
  });

  it('IPC write-failed → schemas unchanged + error toast set + no snapshot', async () => {
    // Arrange
    installApi(
      makeApi({
        deleteBswmd: vi.fn(async () => ({
          kind: 'write-failed' as const,
          message: 'EACCES: permission denied',
        })),
      }),
    );
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);
    const before = useArxmlStore.getState();

    // Act
    const r = await useArxmlStore.getState().removeBswmdFromDisk('/schemas/Adc.bswmd.arxml');

    // Assert — return shape carries the error
    expect(r.kind).toBe('write-failed');
    if (r.kind !== 'write-failed') throw new Error('unreachable');
    expect(r.message).toContain('EACCES');
    // Assert — state: schema still there, error toast set, no snapshot
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toBe(before.bswmdSchemas); // reference equality
    expect(after.bswmdPaths).toEqual(['/schemas/Adc.bswmd.arxml']);
    expect(after.error).not.toBeNull();
    expect(after.lastRemoveSnapshot).toBeNull();
  });

  it('unknown path → canceled, no IPC call', async () => {
    // Arrange
    const api = makeApi();
    installApi(api);

    // Act
    const r = await useArxmlStore.getState().removeBswmdFromDisk('/schemas/never-added.arxml');

    // Assert
    expect(r.kind).toBe('canceled');
    expect(api.deleteBswmd).not.toHaveBeenCalled();
  });
});

describe('useArxmlStore — undoLastRemoveBswmd (Sprint 17 P1)', () => {
  it('round-trip: remove + undo → schema is back in the store', async () => {
    // Arrange
    installApi(makeApi({ deleteBswmd: vi.fn(async () => ({ kind: 'ok' as const })) }));
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);
    const originalSchema = useArxmlStore.getState().bswmdSchemas[0]!;
    expect(originalSchema).toBeDefined();

    // Act — remove then undo
    const r1 = await useArxmlStore.getState().removeBswmdFromDisk('/schemas/Adc.bswmd.arxml');
    expect(r1.kind).toBe('ok');
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);

    useArxmlStore.getState().undoLastRemoveBswmd();

    // Assert — schema is back, snapshot is cleared (one level of undo)
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.bswmdSchemas[0]).toBe(originalSchema); // reference equality
    expect(after.bswmdPaths).toEqual(['/schemas/Adc.bswmd.arxml']);
    expect(after.lastRemoveSnapshot).toBeNull();
  });

  it('without a prior remove → no-op (does not throw)', () => {
    // Arrange — no installApi needed; no IPC call should happen
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window.autosarApi;

    // Act + Assert
    expect(() => useArxmlStore.getState().undoLastRemoveBswmd()).not.toThrow();
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
  });

  it('after undo, a second undo is a no-op (one level only)', async () => {
    // Arrange
    installApi(makeApi({ deleteBswmd: vi.fn(async () => ({ kind: 'ok' as const })) }));
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);
    await useArxmlStore.getState().removeBswmdFromDisk('/schemas/Adc.bswmd.arxml');
    useArxmlStore.getState().undoLastRemoveBswmd();
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(1);

    // Act — second undo (no snapshot to pop)
    useArxmlStore.getState().undoLastRemoveBswmd();

    // Assert — state unchanged
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(1);
  });
});
