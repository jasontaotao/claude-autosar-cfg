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

  it('passes the project BSWMD directory when exporting diagnostic extract', async () => {
    useArxmlStore.setState({
      projectPath: '/proj/demo.autosarcfg.json',
      project: {
        schemaVersion: '1',
        id: 'p1',
        name: 'demo',
        valueArxmlPaths: [],
        bswmdPaths: ['bswmd/Dcm_bswmd.arxml'],
      } as never,
    } as never);
    const importDiagnosticExtract = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        demPath: '/proj/samples/arxml/diagnostic-extract/Dem_Extract.arxml',
        demContent: '<Dem/>',
        dcmPath: '/proj/samples/arxml/diagnostic-extract/Dcm_Extract.arxml',
        dcmContent: '<Dcm/>',
        stats: { dtcCount: 0, didCount: 0, routineCount: 0 },
      },
    });
    (window as unknown as { autosarApi: Record<string, unknown> }).autosarApi = {
      importDiagnosticExtract,
    };

    const { result } = renderHook(() => useDiagExtractHandlers({
      odxModal: {
      kind: 'open',
      path: '/proj/Demo.odx-d',
      summary: {
        dtcCount: 0,
        didCount: 0,
        routineCount: 0,
        dtcs: [],
        dids: [],
        routines: [],
      },
    },
    }));
    await act(async () => {
      await result.current.handleExportOdxDiagnosticExtract();
    });

    expect(importDiagnosticExtract).toHaveBeenCalledWith({
      odxPath: '/proj/Demo.odx-d',
      outputDir: '/proj/samples/arxml/diagnostic-extract',
      bswmdDir: '/proj/bswmd',
    });
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