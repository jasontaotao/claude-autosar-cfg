// @vitest-environment jsdom
//
// v1.15.5 — `useDebouncedValidation` RTL unit tests.
//
// Pins the contract:
//   - Mounted once at App level. Returns void.
//   - When `doc` becomes non-null, debounces `delayMs` and calls
//     `useArxmlStore.validate()` exactly once.
//   - When `doc` changes again before the timer fires, the previous
//     timer is cancelled and only the latest one survives (coalesce).
//   - When `isActiveDirty` flips (a Set mutation triggers a re-render
//     even when `doc` reference is unchanged), the hook schedules an
//     additional validate.
//   - When `doc` is null, the hook does nothing (no timer, no validate).
//   - On unmount, the timer is cleared and no validate fires after.
//
// Strategy mirrors `useSwsValidatorRunner.test.tsx`: vi.useFakeTimers
// + renderHook + spying on `useArxmlStore.getState().validate`.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useDebouncedValidation } from '../useDebouncedValidation.js';

describe('useDebouncedValidation (v1.15.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset the relevant store slices to a clean state.
    useArxmlStore.setState({
      doc: null,
      activeDocumentPath: null,
      dirtyPaths: new Set<string>(),
    } as Partial<ReturnType<typeof useArxmlStore.getState>>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not schedule validate when doc is null', () => {
    const validateSpy = vi.spyOn(useArxmlStore.getState(), 'validate');

    renderHook(() => useDebouncedValidation(50));

    vi.advanceTimersByTime(500);
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it('fires validate once after delayMs when doc becomes non-null', () => {
    const validateSpy = vi.spyOn(useArxmlStore.getState(), 'validate');

    renderHook(() => useDebouncedValidation(50));

    act(() => {
      useArxmlStore.setState({
        doc: { path: '/x', version: { major: 4, minor: 2, patch: 0 }, packages: [] },
      } as unknown as Partial<ReturnType<typeof useArxmlStore.getState>>);
    });

    expect(validateSpy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces three rapid doc changes into one validate', () => {
    const validateSpy = vi.spyOn(useArxmlStore.getState(), 'validate');

    renderHook(() => useDebouncedValidation(50));

    act(() => {
      useArxmlStore.setState({ doc: makeDoc('/a') } as never);
    });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    act(() => {
      useArxmlStore.setState({ doc: makeDoc('/b') } as never);
    });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    act(() => {
      useArxmlStore.setState({ doc: makeDoc('/c') } as never);
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it('schedules a fresh validate when isActiveDirty flips', () => {
    const validateSpy = vi.spyOn(useArxmlStore.getState(), 'validate');

    renderHook(() => useDebouncedValidation(50));

    act(() => {
      useArxmlStore.setState({
        doc: makeDoc('/x'),
        activeDocumentPath: '/x',
        dirtyPaths: new Set<string>(),
      } as unknown as Partial<ReturnType<typeof useArxmlStore.getState>>);
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(validateSpy).toHaveBeenCalledTimes(1);

    // Flip dirty bit: same doc reference, but isActiveDirty changes
    // (Set.has → re-evaluate). Hook should re-schedule.
    act(() => {
      const next = new Set(useArxmlStore.getState().dirtyPaths);
      next.add('/x');
      useArxmlStore.setState({ dirtyPaths: next } as Partial<
        ReturnType<typeof useArxmlStore.getState>
      >);
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(validateSpy).toHaveBeenCalledTimes(2);
  });

  it('cleans the timer on unmount', () => {
    const validateSpy = vi.spyOn(useArxmlStore.getState(), 'validate');

    const { unmount } = renderHook(() => useDebouncedValidation(50));

    act(() => {
      useArxmlStore.setState({ doc: makeDoc('/x') } as never);
    });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(validateSpy).not.toHaveBeenCalled();
  });
});

// Minimal ArxmlDocument factory for the store stub. The hook only reads
// `doc` truthiness; deeper fields don't affect the timer logic.
function makeDoc(path: string): unknown {
  return { path, version: { major: 4, minor: 2, patch: 0 }, packages: [] };
}
