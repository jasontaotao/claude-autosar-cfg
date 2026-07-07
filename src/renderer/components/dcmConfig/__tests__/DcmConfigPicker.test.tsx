// @vitest-environment jsdom
// v1.33.0 MINOR T3 — DcmConfigPicker wraps openOdxWithDefault() IPC.
//
// Pinned behaviours:
//   1. Mounts and invokes openOdxWithDefault({ defaultPath }) exactly once,
//      then calls onResolve with the picked path.
//   2. On `canceled` result, calls onCancel and not onResolve.
//   3. On `read-failed` result, calls onCancel and warns to console (OS dialog already showed the error).
//   4. React strict-mode mount-cycle does not double-fire openOdxWithDefault (useRef guard per
//      lesson `re-entrancy-guard-via-useref-not-setstate-callback-state`).
//   5. The optional `defaultPath` prop is forwarded verbatim to the IPC call so the OS dialog
//      can pre-fill its starting location.

import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DcmConfigPicker } from '../DcmConfigPicker.js';

describe('DcmConfigPicker (v1.33.0 T3)', () => {
  beforeEach(() => {
    (window as unknown as { autosarApi: unknown }).autosarApi = {
      openOdxWithDefault: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes openOdxWithDefault on mount and calls onResolve with the picked path', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdxWithDefault as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'opened',
      path: '/user/proj.odx',
      content: '<ODX></ODX>',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0)); // let effect fire

    expect(window.autosarApi.openOdxWithDefault).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('/user/proj.odx');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when openOdxWithDefault returns canceled', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdxWithDefault as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('calls onCancel and warns when openOdxWithDefault returns read-failed', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (window.autosarApi.openOdxWithDefault as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'read-failed',
      message: 'ENOENT',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ODX read failed'));
  });

  it('does not double-fire openOdxWithDefault under React StrictMode (useRef guard)', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdxWithDefault as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });

    // React 18+ StrictMode (mirrors React 19 behavior) invokes the mount
    // effect twice on first mount. The useRef guard must ensure openOdxWithDefault
    // fires exactly once per logical mount cycle.
    render(
      <StrictMode>
        <DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />
      </StrictMode>,
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(window.autosarApi.openOdxWithDefault).toHaveBeenCalledTimes(1);
  });

  it('passes defaultPath prop to the new IPC channel', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdxWithDefault as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });

    render(
      <DcmConfigPicker
        locale="en"
        onResolve={onResolve}
        onCancel={onCancel}
        defaultPath="/some/path"
      />,
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(window.autosarApi.openOdxWithDefault).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: '/some/path' }),
    );
  });
});
