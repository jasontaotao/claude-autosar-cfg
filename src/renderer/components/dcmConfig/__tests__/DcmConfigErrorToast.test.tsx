// @vitest-environment jsdom
//
// DcmConfigErrorToast — v1.31.0 PATCH T2.
//
// Pinned behaviours:
//   1. Does not render when error is null
//   2. Renders localized message for each of the 6 error classes
//   3. Auto-dismisses after 8 seconds
//   4. Close button immediately dismisses
//   5. aria-live="polite" for screen reader announcement

import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DcmConfigErrorToast, type DcmConfigErrorClass } from '../DcmConfigErrorToast.js';

describe('DcmConfigErrorToast (v1.31.0 PATCH T2)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const classes: readonly DcmConfigErrorClass[] = [
    'bswmdUnreadable',
    'odxUnreadable',
    'odxParseFailed',
    'bswmdMapMissing',
    'atomicWriteFailed',
    'unexpected',
  ] as const;

  it.each(classes)('renders localized message for class %s (en)', (classKey) => {
    const onDismiss = vi.fn();
    render(
      <DcmConfigErrorToast
        error={{ message: 'detail', classKey }}
        locale="en"
        onDismiss={onDismiss}
      />,
    );
    const toast = screen.getByTestId('dcm-config-error-toast');
    expect(toast).toBeInTheDocument();
    expect(toast.textContent).toContain('detail');
  });

  it('renders zh-CN message for bswmdUnreadable class', () => {
    render(
      <DcmConfigErrorToast
        error={{ message: 'ENOENT', classKey: 'bswmdUnreadable' }}
        locale="zh-CN"
        onDismiss={vi.fn()}
      />,
    );
    const toast = screen.getByTestId('dcm-config-error-toast');
    expect(toast.textContent).toContain('无法读取 BSWMD 文件');
    expect(toast.textContent).toContain('ENOENT');
  });

  it('does not render when error is null', () => {
    render(<DcmConfigErrorToast error={null} locale="en" onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('dcm-config-error-toast')).not.toBeInTheDocument();
  });

  it('auto-dismisses after 8 seconds', () => {
    const onDismiss = vi.fn();
    render(
      <DcmConfigErrorToast
        error={{ message: 'x', classKey: 'unexpected' }}
        locale="en"
        onDismiss={onDismiss}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('close button immediately dismisses', () => {
    const onDismiss = vi.fn();
    render(
      <DcmConfigErrorToast
        error={{ message: 'x', classKey: 'unexpected' }}
        locale="en"
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByTestId('dcm-config-error-toast-dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('uses aria-live="polite" for screen reader announcement', () => {
    render(
      <DcmConfigErrorToast
        error={{ message: 'x', classKey: 'unexpected' }}
        locale="en"
        onDismiss={vi.fn()}
      />,
    );
    const toast = screen.getByTestId('dcm-config-error-toast');
    expect(toast.getAttribute('aria-live')).toBe('polite');
  });
});
