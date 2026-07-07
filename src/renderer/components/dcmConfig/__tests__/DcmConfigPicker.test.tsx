// @vitest-environment jsdom
// v1.32.0 MINOR T6 — DcmConfigPicker wraps openOdx() IPC.
//
// Pinned behaviours:
//   1. Mounts and invokes openOdx() exactly once, then calls onResolve with the picked path.
//   2. On `canceled` result, calls onCancel and not onResolve.
//   3. On `read-failed` result, calls onCancel and warns to console (OS dialog already showed the error).
//   4. React strict-mode mount-cycle does not double-fire openOdx (useRef guard per
//      lesson `re-entrancy-guard-via-useref-not-setstate-callback-state`).

import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DcmConfigPicker } from '../DcmConfigPicker.js';

describe('DcmConfigPicker (v1.32.0 T6)', () => {
  beforeEach(() => {
    (window as unknown as { autosarApi: unknown }).autosarApi = {
      openOdx: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes openOdx on mount and calls onResolve with the picked path', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdx as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'opened',
      path: '/user/proj.odx',
      content: '<ODX></ODX>',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0)); // let effect fire

    expect(window.autosarApi.openOdx).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('/user/proj.odx');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when openOdx returns canceled', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdx as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('calls onCancel and warns when openOdx returns read-failed', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (window.autosarApi.openOdx as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'read-failed',
      message: 'ENOENT',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ODX read failed'));
  });

  it('does not double-fire openOdx under React StrictMode (useRef guard)', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdx as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });

    // React 18+ StrictMode (mirrors React 19 behavior) invokes the mount
    // effect twice on first mount. The useRef guard must ensure openOdx
    // fires exactly once per logical mount cycle.
    render(
      <StrictMode>
        <DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />
      </StrictMode>,
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(window.autosarApi.openOdx).toHaveBeenCalledTimes(1);
  });
});
