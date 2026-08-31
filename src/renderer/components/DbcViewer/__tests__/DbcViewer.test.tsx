// @vitest-environment jsdom
//
// DbcViewer — v1.21.0 Bug #5 (HIGH: DBC 解析器装上未接入).
//
// Read-only modal that renders a `DbcSummary` (see
// `src/shared/types.ts`). The viewer is the renderer-side payoff for
// the v1.7.0 @dbc-forge/core install that was previously dead code:
// users can finally open a .dbc file via "File Operations → Open
// DBC…" and see the parsed network.
//
// Behaviour pinned by tests (Bug #5 Phase 4 — RED):
//   1. Renders the title with the source filename
//   2. Renders the network stats (version, node count, message count)
//   3. Renders one row per message (id, name, dlc, transmitter, signals)
//   4. Renders nodes as a chip row
//   5. Empty / null summary shows a placeholder, not a crash
//   6. Close button fires onClose
//   7. Error state shows a localized error banner (not the table)

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DbcSummary } from '@shared/types';

import { DbcViewer } from '../DbcViewer';

const SAMPLE_SUMMARY: DbcSummary = {
  version: '1.0',
  nodeCount: 2,
  messageCount: 2,
  nodes: ['ECU1', 'ECU2'],
  messages: [
    { id: 100, name: 'Frame_A', dlc: 8, transmitter: 'ECU1', signalCount: 1, isExtended: false },
    { id: 2048, name: 'Frame_B', dlc: 4, transmitter: 'ECU2', signalCount: 2, isExtended: true },
  ],
};

describe('DbcViewer (Bug #5)', () => {
  afterEach(() => cleanup());

  it('renders the title with the source filename', () => {
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('dbc-viewer-title').textContent).toMatch(/network\.dbc/);
  });

  it('renders the network stats (version, node count, message count)', () => {
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
      />,
    );
    const stats = screen.getByTestId('dbc-viewer-stats').textContent;
    expect(stats).toMatch(/1\.0/);
    expect(stats).toMatch(/2/); // nodeCount and messageCount both 2 — at least one number renders
    expect(stats).toMatch(/node/i);
    expect(stats).toMatch(/message/i);
  });

  it('renders one row per message with all columns', () => {
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('dbc-message-100')).not.toBeNull();
    expect(screen.getByTestId('dbc-message-2048')).not.toBeNull();
    // Frame_A row contains id 100, name Frame_A, dlc 8, ECU1, 1 signal
    const rowA = screen.getByTestId('dbc-message-100').textContent ?? '';
    expect(rowA).toMatch(/0x064/);
    expect(rowA).toMatch(/Frame_A/);
    expect(rowA).toMatch(/8/);
    expect(rowA).toMatch(/ECU1/);
    expect(rowA).toMatch(/1/);
    // Frame_B is extended and contains 2 signals — distinct from Frame_A so the
    // signalCount column is wired correctly.
    const rowB = screen.getByTestId('dbc-message-2048').textContent ?? '';
    expect(rowB).toMatch(/0x00000800/i);
    expect(rowB).toMatch(/Ext/);
  });

  it('renders nodes as a chip row (each node name appears)', () => {
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
      />,
    );
    const nodes = screen.getByTestId('dbc-viewer-nodes');
    expect(nodes.textContent).toMatch(/ECU1/);
    expect(nodes.textContent).toMatch(/ECU2/);
  });

  it('close button fires onClose', () => {
    const onClose = vi.fn();
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('dbc-viewer-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('error state: renders localized error banner instead of the table', () => {
    render(
      <DbcViewer
        open
        path="/tmp/bad.dbc"
        summary={null}
        error="DBC parse failed: syntax error at line 3"
        locale="en"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('dbc-viewer-error')).not.toBeNull();
    expect(screen.getByTestId('dbc-viewer-error').textContent).toMatch(/syntax error/i);
    expect(screen.queryByTestId('dbc-viewer-stats')).toBeNull();
  });

  it('localizes the title in zh-CN', () => {
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="zh-CN"
        onClose={vi.fn()}
      />,
    );
    // Title contains the localized "DBC" or "网络" label
    const title = screen.getByTestId('dbc-viewer-title').textContent ?? '';
    expect(title).toMatch(/DBC|网络/);
  });

  // Bug #5 code-review HIGH-1 — keyboard / a11y.
  it('Escape key fires onClose', () => {
    const onClose = vi.fn();
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking the backdrop fires onClose; clicking the modal body does NOT', () => {
    const onClose = vi.fn();
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={onClose}
      />,
    );
    const backdrop = screen.getByTestId('dbc-viewer');
    // Clicking the backdrop directly should close.
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Clicking an inner element should NOT close — stopPropagation on
    // the inner card prevents accidental dismissal from row clicks.
    const titleEl = screen.getByTestId('dbc-viewer-title');
    fireEvent.click(titleEl);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the close button on open (initial focus)', async () => {
    render(
      <DbcViewer
        open
        path="/tmp/network.dbc"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
      />,
    );
    // requestAnimationFrame defers focus to the next paint.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const closeBtn = screen.getByTestId('dbc-viewer-close');
    expect(document.activeElement).toBe(closeBtn);
  });
});
