// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useDiagExtractHandlers } from '../useDiagExtractHandlers.js';

describe('useDiagExtractHandlers — open extract in workspace', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      documents: [],
      documentPaths: [],
      activeDocumentPath: null,
      error: null,
    } as never);
  });

  it('parses both generated extracts and adds them to the workspace', async () => {
    const parseArxml = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: { path: '/out/Dem_Extract.arxml', version: '4.4', packages: [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { path: '/out/Dcm_Extract.arxml', version: '4.4', packages: [] },
      });
    (window as unknown as { autosarApi: Record<string, unknown> }).autosarApi = { parseArxml };

    const { result } = renderHook(() => useDiagExtractHandlers({ odxModal: { kind: 'closed' } }));
    act(() => {
      result.current.setDiagExtractModal({
        kind: 'open',
        demPath: '/out/Dem_Extract.arxml',
        dcmPath: '/out/Dcm_Extract.arxml',
        demContent: '<Dem/>',
        dcmContent: '<Dcm/>',
        stats: { dtcCount: 0, didCount: 0, routineCount: 0 },
      });
    });
    await act(async () => {
      await result.current.openExtractInWorkspace();
    });

    expect(parseArxml.mock.calls).toEqual([
      [{ path: '/out/Dem_Extract.arxml', content: '<Dem/>' }],
      [{ path: '/out/Dcm_Extract.arxml', content: '<Dcm/>' }],
    ]);
    expect(useArxmlStore.getState().documentPaths).toEqual([
      '/out/Dem_Extract.arxml',
      '/out/Dcm_Extract.arxml',
    ]);
    expect(useArxmlStore.getState().activeDocumentPath).toBe('/out/Dcm_Extract.arxml');
    expect(result.current.diagExtractModal.kind).toBe('closed');
  });
});