// @vitest-environment jsdom
//
// BswmdChipRow tests — Sprint 13+ Stage 3.4.
//
// The row is a controlled component:
//   - bswmdPaths  : list of absolute paths to render as chips
//   - selectedPaths: list of absolute paths the user has selected
//   - onToggle    : called with the toggled absolute path
//
// It owns no state of its own; the host (NewProjectDialog) is the
// source of truth for selectedPaths. This makes the row's behavior
// deterministic and easy to test.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { BswmdChipRow } from '../BswmdChipRow.js';

const TWO_BSWMD = ['/samples/classic/bswmd/Can.arxml', '/samples/classic/bswmd/EcuC.arxml'];

afterEach(() => {
  cleanup();
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

describe('BswmdChipRow (Sprint 13+ Stage 3.4)', () => {
  it('renders one chip per BSWMD path, labelled with the basename', () => {
    render(<BswmdChipRow bswmdPaths={TWO_BSWMD} selectedPaths={[]} onToggle={() => undefined} />);
    expect(screen.getByTestId('bswmd-chip-Can.arxml')).toBeInTheDocument();
    expect(screen.getByTestId('bswmd-chip-EcuC.arxml')).toBeInTheDocument();
  });

  it('marks a chip as selected when its absolute path is in selectedPaths', () => {
    render(
      <BswmdChipRow
        bswmdPaths={TWO_BSWMD}
        selectedPaths={['/samples/classic/bswmd/Can.arxml']}
        onToggle={() => undefined}
      />,
    );
    const can = screen.getByTestId('bswmd-chip-Can.arxml');
    expect(can.className).toMatch(/bswmd-chip--selected/);
    expect(can.getAttribute('aria-pressed')).toBe('true');
    const ecuc = screen.getByTestId('bswmd-chip-EcuC.arxml');
    expect(ecuc.className).not.toMatch(/bswmd-chip--selected/);
    expect(ecuc.getAttribute('aria-pressed')).toBe('false');
  });

  it('invokes onToggle with the absolute path (not the basename) when a chip is clicked', () => {
    const onToggle = vi.fn();
    render(<BswmdChipRow bswmdPaths={TWO_BSWMD} selectedPaths={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('bswmd-chip-Can.arxml'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('/samples/classic/bswmd/Can.arxml');
  });

  it('renders the noBswmd empty-state message when bswmdPaths is empty', () => {
    render(<BswmdChipRow bswmdPaths={[]} selectedPaths={[]} onToggle={() => undefined} />);
    const empty = screen.getByTestId('bswmd-chip-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent('This template has no BSWMD files');
  });

  it('localises the label and hint (en by default)', () => {
    render(<BswmdChipRow bswmdPaths={TWO_BSWMD} selectedPaths={[]} onToggle={() => undefined} />);
    expect(screen.getByText('Preload BSWMDs')).toBeInTheDocument();
    expect(
      screen.getByText('Select multiple; they will be copied to your project'),
    ).toBeInTheDocument();
  });

  it('flips the label and hint to zh-CN when the store locale changes', () => {
    useArxmlStore.getState().setLocale('zh-CN');
    render(<BswmdChipRow bswmdPaths={TWO_BSWMD} selectedPaths={[]} onToggle={() => undefined} />);
    expect(screen.getByText('预填 BSWMD')).toBeInTheDocument();
    expect(screen.getByText('可多选；将随模板一并拷贝到项目目录')).toBeInTheDocument();
  });

  it('localises the empty-state message in zh-CN', () => {
    useArxmlStore.getState().setLocale('zh-CN');
    render(<BswmdChipRow bswmdPaths={[]} selectedPaths={[]} onToggle={() => undefined} />);
    expect(screen.getByTestId('bswmd-chip-empty')).toHaveTextContent('该模板未携带 BSWMD');
  });
});
