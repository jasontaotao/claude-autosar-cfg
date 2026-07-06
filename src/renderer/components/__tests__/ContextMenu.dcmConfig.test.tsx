// @vitest-environment jsdom
//
// ContextMenu dcm-config integration — v1.31.0 PATCH T6.
//
// Pinned behaviours:
//   1. Renders "Generate Dcm Config" when target.kind='bswmd' and
//      target.path matches the Dcm BSWMD regex
//   2. Does NOT render the entry when target.path does NOT match
//   3. Clicking the entry emits a `generate-dcm-config` action with
//      the target's path

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuRoot, openContextMenu } from '../ContextMenu.js';

const actionSpy = vi.fn();

beforeEach(() => {
  actionSpy.mockReset();
  // Mount the menu root once per test.
  render(<ContextMenuRoot onAction={actionSpy} locale="en" />);
});

afterEach(() => {
  cleanup();
});

function openAt(kind: 'bswmd', path: string, shortName: string): void {
  act(() => {
    openContextMenu({ kind, path, shortName }, 100, 100);
  });
}

describe('ContextMenu dcm-config (v1.31.0 PATCH T6)', () => {
  it('renders the entry when target path matches Dcm BSWMD regex', () => {
    openAt('bswmd', '/samples/Bsw_Dcm_Bswmd.arxml', 'Bsw_Dcm_Bswmd.arxml');
    expect(screen.getByTestId('context-menu-item-generate-dcm-config')).toBeInTheDocument();
  });

  it('does NOT render the entry when target path does NOT match Dcm BSWMD regex', () => {
    openAt('bswmd', '/samples/Bsw_Com_Bswmd.arxml', 'Bsw_Com_Bswmd.arxml');
    expect(screen.queryByTestId('context-menu-item-generate-dcm-config')).not.toBeInTheDocument();
  });

  it('emits generate-dcm-config action on click with the target path', () => {
    const path = '/samples/Bsw_Dcm_Bswmd.arxml';
    openAt('bswmd', path, 'Bsw_Dcm_Bswmd.arxml');
    fireEvent.click(screen.getByTestId('context-menu-item-generate-dcm-config'));
    expect(actionSpy).toHaveBeenCalledOnce();
    expect(actionSpy).toHaveBeenCalledWith({ type: 'generate-dcm-config', path });
  });
});
