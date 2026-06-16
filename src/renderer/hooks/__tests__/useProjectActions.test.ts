// @vitest-environment jsdom
//
// Sprint 12 #2 — `useProjectActions.addBswmdFromDialog` hook tests.
//
// Pins the contract for the renderer-driven "Load BSWMD" flow:
//
//   1. Loose mode (no project open) → returns `{ kind: 'error', message:
//      needProject }` WITHOUT calling IPC or mutating store state. The
//      user-confirmed design decision #3 says "loose mode is not allowed
//      at all" — the hook short-circuits before any I/O.
//   2. Project open + file picker canceled → returns `{ kind: 'canceled' }`.
//   3. Project open + file picked + IPC read-failed → returns
//      `{ kind: 'error', message: <readBswmdFailed localized> }`.
//   4. Project open + file picked + parse-failed → returns
//      `{ kind: 'error', message: <parseBswmdFailed localized> }`.
//   5. Project open + file picked + parse ok + duplicate path → returns
//      `{ kind: 'error', message: <duplicateBswmd localized> }`.
//   6. Project open + file picked + parse ok (new path) → returns
//      `{ kind: 'ok' }`, store.bswmdSchemas.length === 1.
//
// The hook uses `useCallback` so it must run inside a React render —
// we use `renderHook` from `@testing-library/react` and invoke the
// returned function from `result.current` (not by direct call).
//
// IPC mock strategy: assign a stub object onto `window.autosarApi` that
// exposes `openBswmdDialog` + `readBswmd`. The hook reads these via the
// already-typed `window.autosarApi` shape; no `vi.mock` plumbing
// needed. Each test sets the stub before calling the hook and restores
// it in afterEach to avoid bleed-over.

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectManifest } from '../../../shared/project.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useProjectActions } from '../useProjectActions.js';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

/** Minimal valid BSWMD (autosar-standard ECUC-MODULE-DEF dialect). */
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
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>AdcDevErrorDetect</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>1</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/** Malformed BSWMD: triggers `parseBswmd` to return `{ kind: 'xml-malformed' }`. */
const MALFORMED_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Adc
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

function sampleManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IPC stub — typed against the AutosarApi surface but only the
// `openBswmdDialog` + `readBswmd` methods are exercised here. We save /
// restore `window.autosarApi` so the rest of the preload surface is not
// disturbed (other tests may set their own stubs).
// ---------------------------------------------------------------------------

type DialogResult =
  | { readonly kind: 'ok'; readonly path: string }
  | { readonly kind: 'canceled' };
type ReadResult =
  | { readonly kind: 'ok'; readonly content: string }
  | { readonly kind: 'read-failed'; readonly message: string };

interface AutosarApiStub {
  openBswmdDialog: () => Promise<DialogResult>;
  readBswmd: (req: { readonly path: string }) => Promise<ReadResult>;
}

let originalAutosarApi: unknown;

beforeEach(() => {
  // Snapshot whatever the renderer-test setup has installed so we can
  // restore it; restore happens in afterEach.
  originalAutosarApi = (window as { autosarApi?: unknown }).autosarApi;
  useArxmlStore.getState().clear();
  // `clear()` preserves the locale (per the store design — locale is a
  // user preference that survives a project reset). Some tests below
  // flip to `en`; reset to the default `zh-CN` so the assumption holds.
  useArxmlStore.getState().setLocale('zh-CN');
});

afterEach(() => {
  if (originalAutosarApi === undefined) {
    delete (window as { autosarApi?: unknown }).autosarApi;
  } else {
    (window as { autosarApi?: unknown }).autosarApi = originalAutosarApi;
  }
});

function installApiStub(stub: Partial<AutosarApiStub>): AutosarApiStub {
  const merged: AutosarApiStub = {
    openBswmdDialog: stub.openBswmdDialog ?? (async () => ({ kind: 'canceled' })),
    readBswmd:
      stub.readBswmd ?? (async () => ({ kind: 'read-failed', message: 'unconfigured stub' })),
  };
  (window as { autosarApi?: unknown }).autosarApi = merged;
  return merged;
}

// ---------------------------------------------------------------------------
// 1. Loose-mode gate (user-confirmed design decision #3)
// ---------------------------------------------------------------------------

describe('useProjectActions — addBswmdFromDialog loose-mode gate (Sprint 12 #2)', () => {
  it('returns error + does NOT call IPC or mutate store when no project is open (zh-CN)', async () => {
    // Arrange — loose mode (no openProject)
    expect(useArxmlStore.getState().project).toBeNull();
    const openSpy = vi.fn(async () => ({ kind: 'ok' as const, path: '/tmp/x.arxml' }));
    const readSpy = vi.fn(async () => ({ kind: 'ok' as const, content: MIN_BSWMD }));
    installApiStub({ openBswmdDialog: openSpy, readBswmd: readSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const action = result.current.addBswmdFromDialog;
    const response = await action();

    // Assert — error kind, localized zh-CN message, no IPC calls
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toBe('需要先打开或创建项目');
    expect(openSpy).not.toHaveBeenCalled();
    expect(readSpy).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
    expect(useArxmlStore.getState().bswmdPaths).toHaveLength(0);
  });

  it('returns the same localized message in en', async () => {
    // Arrange — switch locale, install no-op stubs
    useArxmlStore.getState().setLocale('en');
    installApiStub({});

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toBe('Please open or create a project first');
  });
});

// ---------------------------------------------------------------------------
// 2. File picker canceled
// ---------------------------------------------------------------------------

describe('useProjectActions — addBswmdFromDialog canceled (Sprint 12 #2)', () => {
  it('returns canceled when user dismisses the open dialog (no readBswmd call)', async () => {
    // Arrange — open project, stub dialog → canceled
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });
    const openStub = vi.fn(async () => ({ kind: 'canceled' as const }));
    const readSpy = vi.fn(async () => ({ kind: 'ok' as const, content: MIN_BSWMD }));
    installApiStub({ openBswmdDialog: openStub, readBswmd: readSpy });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert
    expect(response.kind).toBe('canceled');
    expect(openStub).toHaveBeenCalledTimes(1);
    expect(readSpy).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. IPC read failure
// ---------------------------------------------------------------------------

describe('useProjectActions — addBswmdFromDialog read failure (Sprint 12 #2)', () => {
  it('returns error with readBswmdFailed message when readBswmd fails (zh-CN)', async () => {
    // Arrange — open project, dialog → ok path, read → read-failed
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/bad.arxml' }),
      readBswmd: async () => ({ kind: 'read-failed', message: 'ENOENT' }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert — zh-CN template: `读取 BSWMD 失败: {message}`
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('读取 BSWMD 失败');
    expect(response.message).toContain('ENOENT');
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
  });

  it('returns error with localized read message in en', async () => {
    // Arrange
    useArxmlStore.getState().setLocale('en');
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/bad.arxml' }),
      readBswmd: async () => ({ kind: 'read-failed', message: 'No such file' }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert — en template: `Failed to read BSWMD: {message}`
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('Failed to read BSWMD');
    expect(response.message).toContain('No such file');
  });
});

// ---------------------------------------------------------------------------
// 4. Parse failure
// ---------------------------------------------------------------------------

describe('useProjectActions — addBswmdFromDialog parse failure (Sprint 12 #2)', () => {
  it('returns error with parseBswmdFailed message when content is malformed', async () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/bad.arxml' }),
      readBswmd: async () => ({ kind: 'ok', content: MALFORMED_BSWMD }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert — zh-CN template: `BSWMD 解析失败: {message}`
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('解析失败');
    // store.addBswmd failed → bswmdSchemas untouched
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(0);
    expect(useArxmlStore.getState().bswmdPaths).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Duplicate path
// ---------------------------------------------------------------------------

describe('useProjectActions — addBswmdFromDialog duplicate path (Sprint 12 #2)', () => {
  it('returns error with duplicateBswmd message when path already loaded', async () => {
    // Arrange — open project, preload store with the same path
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });
    useArxmlStore.getState().addBswmd('/tmp/dup.arxml', MIN_BSWMD);
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(1);

    // Stub dialog picks the same path, read returns valid content
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/dup.arxml' }),
      readBswmd: async () => ({ kind: 'ok', content: MIN_BSWMD }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert — zh-CN template: `BSWMD 已加载过: {path}`
    expect(response.kind).toBe('error');
    if (response.kind !== 'error') throw new Error('unreachable');
    expect(response.message).toContain('已加载过');
    expect(response.message).toContain('/tmp/dup.arxml');
    // Store unchanged — no replace
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(1);
    expect(useArxmlStore.getState().bswmdPaths).toEqual(['/tmp/dup.arxml']);
  });
});

// ---------------------------------------------------------------------------
// 6. Happy path
// ---------------------------------------------------------------------------

describe('useProjectActions — addBswmdFromDialog happy path (Sprint 12 #2)', () => {
  it('returns ok + store.bswmdSchemas.length === 1 for a valid new file', async () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });
    installApiStub({
      openBswmdDialog: async () => ({ kind: 'ok', path: '/tmp/new.arxml' }),
      readBswmd: async () => ({ kind: 'ok', content: MIN_BSWMD }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const response = await result.current.addBswmdFromDialog();

    // Assert
    expect(response.kind).toBe('ok');
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.bswmdPaths).toEqual(['/tmp/new.arxml']);
    expect(after.error).toBeNull();
    // Project sync — the manifest's bswmdPaths also picks up the new path
    expect(after.project?.bswmdPaths).toEqual(['/tmp/new.arxml']);
  });

  it('returns ok for two sequential loads (path indexing is fresh each time)', async () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });
    let counter = 0;
    const paths = ['/tmp/a.arxml', '/tmp/b.arxml'];
    installApiStub({
      openBswmdDialog: async () => {
        const path = paths[counter] ?? '/tmp/c.arxml';
        return { kind: 'ok' as const, path };
      },
      readBswmd: async () => ({ kind: 'ok' as const, content: MIN_BSWMD }),
    });

    // Act
    const { result } = renderHook(() => useProjectActions());
    const first = await result.current.addBswmdFromDialog();
    counter += 1;
    const second = await result.current.addBswmdFromDialog();

    // Assert
    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('ok');
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(2);
    expect(after.bswmdPaths).toEqual(['/tmp/a.arxml', '/tmp/b.arxml']);
  });
});
