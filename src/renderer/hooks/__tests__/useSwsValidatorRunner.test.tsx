// @vitest-environment jsdom
//
// `useSwsValidatorRunner` — v1.6.0 deferred #1 wire-up test.
//
// Pins the contract:
//   - Mounted once at App level.
//   - When the active `useArxmlStore` doc becomes non-null (or its
//     dirty flag flips), debounce `delayMs` and then call
//     `useSwsValidatorStore.run({ document, schemaLayer })`.
//   - When the SWS validator feature flag is OFF, the hook does
//     nothing (no run, no normalization).
//   - When `useArxmlStore.doc` is null, the hook does nothing.
//
// Mirrors the testing strategy of `useDebouncedValidation` (sibling
// hook) but observes `useSwsValidatorStore` instead of the legacy
// `useArxmlStore.validate()`.

import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types';
import { setFlagForTest, _resetFlagCache } from '@core/sws-validator/feature-flag.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useSwsValidatorStore } from '../../store/useSwsValidatorStore.js';
import { useSwsValidatorRunner } from '../useSwsValidatorRunner.js';

// Minimal ArxmlDocument that satisfies `fromArxmlDocument`. Only the
// fields the runner needs (path + version + packages) are populated.
const FAKE_DOC = {
  path: '/fake',
  version: { major: 4, minor: 2, patch: 0 },
  packages: [],
} as unknown as ArxmlDocument;

describe('useSwsValidatorRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setFlagForTest('swsValidator', true);
    _resetFlagCache();
    // Reset both stores to a clean state for every test.
    useSwsValidatorStore.setState({
      results: [],
      running: false,
      enabled: true,
      panelOpen: false,
      severityFilter: 'all',
      lastRunAt: null,
      focusedErrorIndex: 0,
    });
    useArxmlStore.setState({
      doc: null,
      activeDocumentPath: null,
      dirtyPaths: new Set<string>(),
    } as Partial<ReturnType<typeof useArxmlStore.getState>>);
  });

  afterEach(() => {
    vi.useRealTimers();
    setFlagForTest(null);
    _resetFlagCache();
  });

  it('does nothing when feature flag is OFF', () => {
    setFlagForTest('swsValidator', false);
    _resetFlagCache();
    const runSpy = vi.spyOn(useSwsValidatorStore.getState(), 'run');

    renderHook(() => useSwsValidatorRunner(300));

    act(() => {
      useArxmlStore.setState({
        doc: FAKE_DOC,
        activeDocumentPath: '/fake',
      } as Partial<ReturnType<typeof useArxmlStore.getState>>);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(runSpy).not.toHaveBeenCalled();
  });

  it('does nothing when doc is null', () => {
    const runSpy = vi.spyOn(useSwsValidatorStore.getState(), 'run');

    renderHook(() => useSwsValidatorRunner(300));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(runSpy).not.toHaveBeenCalled();
  });

  it('calls useSwsValidatorStore.run after debounce when doc appears', () => {
    const runSpy = vi.spyOn(useSwsValidatorStore.getState(), 'run');

    renderHook(() => useSwsValidatorRunner(300));

    act(() => {
      useArxmlStore.setState({
        doc: FAKE_DOC,
        activeDocumentPath: '/fake',
      } as Partial<ReturnType<typeof useArxmlStore.getState>>);
    });
    // Before debounce fires — no call yet.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(runSpy).not.toHaveBeenCalled();

    // After debounce — call fires.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    const callArg = runSpy.mock.calls[0]?.[0] as
      | { document: unknown; schemaLayer: unknown }
      | undefined;
    expect(callArg?.document).toBeDefined();
    expect(callArg?.schemaLayer).toBeNull();
  });

  it('debounces repeated changes — only one run after quiet period', () => {
    const runSpy = vi.spyOn(useSwsValidatorStore.getState(), 'run');

    renderHook(() => useSwsValidatorRunner(300));

    // Three rapid mutations within the debounce window.
    act(() => {
      useArxmlStore.setState({
        doc: FAKE_DOC,
        activeDocumentPath: '/fake',
        dirtyPaths: new Set(['/fake']),
      } as Partial<ReturnType<typeof useArxmlStore.getState>>);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      useArxmlStore.setState({
        dirtyPaths: new Set(['/fake', '/other']),
      } as Partial<ReturnType<typeof useArxmlStore.getState>>);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      useArxmlStore.setState({
        dirtyPaths: new Set(['/fake', '/other', '/third']),
      } as Partial<ReturnType<typeof useArxmlStore.getState>>);
    });
    // Advance past the final debounce window.
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // All three mutations landed inside one debounce window ⇒ 1 run.
    expect(runSpy).toHaveBeenCalledTimes(1);
  });
});
