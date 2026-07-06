// @vitest-environment jsdom
//
// v1.30.0 MINOR — minimal renderer-side smoke test for the
// `DcmConfigTrigger` button. Mocks `window.autosarApi.dcmConfig`,
// verifies the button invokes the bridge with the expected payload,
// and asserts the rendered `<pre>` contains the bridge response.
//
// The full UX (success dialog, failure toast, project-context menu
// integration, ODX file picker) is deferred to 1.31.0 PATCH.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EcucInstanceRow } from '../../../../shared/types.js';
import { DcmConfigTrigger } from '../DcmConfigTrigger.js';

const SAMPLE_RESPONSE = {
  ok: true,
  value: {
    dcmConfigXml: '<Dcm>...</Dcm>',
    odxLinkedDcmDspCount: 3,
    odxLinkedRoutineCount: 1,
    serviceCounts: {
      DcmClearDTC: 0,
      DcmReadDTC: 0,
      DcmReadDataById: 1,
      DcmWriteDataById: 0,
      DcmRoutineControl: 1,
    },
    outputPath: '/tmp/dcm.cfg.arxml',
    appliedStepCount: 4,
  },
} as const;

describe('DcmConfigTrigger — v1.30.0 smoke', () => {
  let mockInvoke: ReturnType<typeof vi.fn>;
  let mockApi: { dcmConfig: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockInvoke = vi.fn().mockResolvedValue(SAMPLE_RESPONSE);
    mockApi = { dcmConfig: mockInvoke };
    (window as unknown as { autosarApi: typeof mockApi }).autosarApi = mockApi;
  });

  it('renders the trigger button', () => {
    render(<DcmConfigTrigger odxPath="/x.odx-d" xlsxRows={[]} />);
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('calls window.autosarApi.dcmConfig with the expected payload', async () => {
    const xlsxRows: readonly EcucInstanceRow[] = [
      {
        sheet: 'DcmReadDataById' as never,
        shortName: 'ReadVbatt',
        params: { didRef: 'Vbatt' },
      },
    ];
    render(<DcmConfigTrigger odxPath="/x.odx-d" xlsxRows={xlsxRows} bswmdPath="/y.arxml" />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    // The bridge function is async; await its resolution to assert
    // mockInvoke was called with the expected payload.
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith({
      odxPath: '/x.odx-d',
      xlsxRows,
      bswmdPath: '/y.arxml',
    });
  });

  it('surfaces the bridge response in the rendered <pre>', async () => {
    render(<DcmConfigTrigger odxPath="/x.odx-d" xlsxRows={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    const pre = await screen.findByTestId('dcm-config-result');
    expect(pre).toHaveTextContent('"appliedStepCount": 4');
  });
});
