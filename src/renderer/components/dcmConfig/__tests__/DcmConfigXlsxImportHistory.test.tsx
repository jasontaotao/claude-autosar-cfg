// @vitest-environment jsdom
//
// DcmConfigXlsxImportHistory — v1.34.0 MINOR T2.
//
// Pinned behaviours:
//   1. Renders empty-state line when history is empty (en)
//   2. Renders one row per history entry with rows count + Reuse button (en)
//   3. Renders all entries when history has 3 (multi-render, cap-thru)
//   4. Renders zh-CN strings when locale=zh-CN
//   5. Clicking Reuse button calls props.onReuse with the entry importedAt

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { XlsxImportRecord } from '../../../store/slices/xlsxImportSlice.js';
import { DcmConfigXlsxImportHistory } from '../DcmConfigXlsxImportHistory.js';

const EMPTY: readonly XlsxImportRecord[] = [];
const ONE: readonly XlsxImportRecord[] = [
  {
    rows: [{ sheet: 'DcmReadDataById', shortName: 'R', params: {} } as never],
    source: 'manual',
    importedAt: 1000,
  },
];
const THREE: readonly XlsxImportRecord[] = [
  {
    rows: [{ sheet: 'A', shortName: 'A', params: {} } as never],
    source: 'wizard',
    importedAt: 3000,
  },
  {
    rows: [{ sheet: 'B', shortName: 'B', params: {} } as never],
    source: 'manual',
    importedAt: 2000,
  },
  {
    rows: [{ sheet: 'C', shortName: 'C', params: {} } as never],
    source: 'wizard',
    importedAt: 1000,
  },
];

describe('DcmConfigXlsxImportHistory (v1.34.0 MINOR T2)', () => {
  afterEach(() => cleanup());

  it('renders empty-state line when history is empty (en)', () => {
    render(<DcmConfigXlsxImportHistory history={EMPTY} locale="en" onReuse={() => undefined} />);
    expect(screen.getByTestId('xlsx-import-history-empty')).toHaveTextContent(/no prior imports/i);
  });

  it('renders one row per history entry with rows count + Reuse button (en)', () => {
    render(<DcmConfigXlsxImportHistory history={ONE} locale="en" onReuse={() => undefined} />);
    expect(screen.getByTestId('xlsx-import-history-row-1000')).toBeInTheDocument();
    expect(screen.getByTestId('xlsx-import-history-reuse-1000')).toHaveTextContent(/reuse/i);
  });

  it('renders all entries when history has 3 (multi-render, cap-thru)', () => {
    render(<DcmConfigXlsxImportHistory history={THREE} locale="en" onReuse={() => undefined} />);
    expect(screen.getByTestId('xlsx-import-history-row-3000')).toBeInTheDocument();
    expect(screen.getByTestId('xlsx-import-history-row-2000')).toBeInTheDocument();
    expect(screen.getByTestId('xlsx-import-history-row-1000')).toBeInTheDocument();
  });

  it('renders zh-CN strings when locale=zh-CN', () => {
    render(<DcmConfigXlsxImportHistory history={ONE} locale="zh-CN" onReuse={() => undefined} />);
    expect(screen.getByTestId('xlsx-import-history-reuse-1000')).toHaveTextContent('复用');
  });

  it('clicking Reuse button calls props.onReuse with the entry importedAt', () => {
    const onReuse = vi.fn();
    render(<DcmConfigXlsxImportHistory history={ONE} locale="en" onReuse={onReuse} />);
    fireEvent.click(screen.getByTestId('xlsx-import-history-reuse-1000'));
    expect(onReuse).toHaveBeenCalledWith(1000);
  });
});
