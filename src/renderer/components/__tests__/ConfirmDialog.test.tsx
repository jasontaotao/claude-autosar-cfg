// @vitest-environment jsdom
//
// ConfirmDialog (Sprint 12 #3 Task 6):
//   - Self-contained module-level externalSetState + promise resolve
//     pattern (mirrors PromptDialog).
//   - 3 button choices: continue (cancel) / discard / saveAndProceed.
//   - Esc / backdrop / × button all resolve with 'continue' (treated as
//     "用户期望不动" — the user did not commit to a destructive action).
//
// Tests pin:
//   1. renders nothing when no confirm is active
//   2. renders title + 3 buttons + close button after confirm() is called
//   3. clicking "继续编辑" resolves with 'continue'
//   4. clicking "不保存，新建" resolves with 'discard'
//   5. clicking "保存并新建" resolves with 'saveAndProceed'
//   6. Esc key resolves with 'continue'
//   7. backdrop click resolves with 'continue'
//   8. × close button resolves with 'continue'
//   9. sequential confirms are handled one after another
//  10. clicking inside dialog body does not close (event does not bubble)

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfirmRoot, confirm } from '../ConfirmDialog.js';

/**
 * Mount ConfirmRoot for the current test. The post-mount effect that
 * assigns `externalSetState = setState` must be flushed before any
 * confirm() call, otherwise the module-level confirm() falls back to
 * resolving immediately with 'continue' (a safe "do nothing" default).
 */
async function mountHost(): Promise<void> {
  render(<ConfirmRoot />);
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  // Unmount hosts so the module-level handle is cleared and the next
  // test starts from a clean slate.
  cleanup();
});

describe('ConfirmDialog (Sprint 12 #3 Task 6)', () => {
  beforeEach(async () => {
    await mountHost();
  });

  it('renders nothing when no confirm is active', () => {
    expect(screen.queryByTestId('confirm-overlay')).toBeNull();
  });

  it('renders title, message, 3 buttons, and close × after confirm() is called', async () => {
    confirm({ title: '未保存的更改', message: '当前项目有未保存的更改。' });
    await screen.findByTestId('confirm-overlay');

    expect(screen.getByTestId('confirm-title')).toHaveTextContent('未保存的更改');
    expect(screen.getByTestId('confirm-message')).toHaveTextContent('当前项目有未保存的更改。');
    expect(screen.getByTestId('confirm-continue')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-discard')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-saveAndProceed')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-close')).toBeInTheDocument();
  });

  it('uses default labels for the 3 buttons (继续编辑 / 不保存，新建 / 保存并新建)', async () => {
    confirm({ title: 't', message: 'm' });
    await screen.findByTestId('confirm-overlay');
    expect(screen.getByTestId('confirm-continue')).toHaveTextContent('继续编辑');
    expect(screen.getByTestId('confirm-discard')).toHaveTextContent('不保存，新建');
    expect(screen.getByTestId('confirm-saveAndProceed')).toHaveTextContent('保存并新建');
  });

  it('accepts custom labels for each button', async () => {
    confirm({
      title: 't',
      message: 'm',
      continueLabel: 'Keep editing',
      discardLabel: 'Discard',
      saveLabel: 'Save & proceed',
    });
    await screen.findByTestId('confirm-overlay');
    expect(screen.getByTestId('confirm-continue')).toHaveTextContent('Keep editing');
    expect(screen.getByTestId('confirm-discard')).toHaveTextContent('Discard');
    expect(screen.getByTestId('confirm-saveAndProceed')).toHaveTextContent('Save & proceed');
  });

  it('clicking "继续编辑" resolves with "continue"', async () => {
    const p = confirm({ title: 't', message: 'm' });
    await screen.findByTestId('confirm-overlay');
    fireEvent.click(screen.getByTestId('confirm-continue'));
    await waitFor(() => expect(p).resolves.toBe('continue'));
  });

  it('clicking "不保存，新建" resolves with "discard"', async () => {
    const p = confirm({ title: 't', message: 'm' });
    await screen.findByTestId('confirm-overlay');
    fireEvent.click(screen.getByTestId('confirm-discard'));
    await waitFor(() => expect(p).resolves.toBe('discard'));
  });

  it('clicking "保存并新建" resolves with "saveAndProceed"', async () => {
    const p = confirm({ title: 't', message: 'm' });
    await screen.findByTestId('confirm-overlay');
    fireEvent.click(screen.getByTestId('confirm-saveAndProceed'));
    await waitFor(() => expect(p).resolves.toBe('saveAndProceed'));
  });

  it('Escape key resolves with "continue" (用户期望不动)', async () => {
    const p = confirm({ title: 't', message: 'm' });
    const overlay = await screen.findByTestId('confirm-overlay');
    fireEvent.keyDown(overlay, { key: 'Escape' });
    await waitFor(() => expect(p).resolves.toBe('continue'));
  });

  it('backdrop click resolves with "continue"', async () => {
    const p = confirm({ title: 't', message: 'm' });
    await screen.findByTestId('confirm-overlay');
    fireEvent.click(screen.getByTestId('confirm-overlay'));
    await waitFor(() => expect(p).resolves.toBe('continue'));
  });

  it('× close button resolves with "continue"', async () => {
    const p = confirm({ title: 't', message: 'm' });
    await screen.findByTestId('confirm-overlay');
    fireEvent.click(screen.getByTestId('confirm-close'));
    await waitFor(() => expect(p).resolves.toBe('continue'));
  });

  it('handles sequential confirms (the second resolves after the first)', async () => {
    const p1 = confirm({ title: 'first', message: 'm1' });
    await screen.findByTestId('confirm-overlay');
    fireEvent.click(screen.getByTestId('confirm-discard'));
    await waitFor(() => expect(p1).resolves.toBe('discard'));

    // The second confirm kicks off after the first one resolved; the
    // overlay should now show the second dialog.
    const p2 = confirm({ title: 'second', message: 'm2' });
    // Wait for re-render to show the new title.
    await waitFor(() =>
      expect(screen.getByTestId('confirm-title')).toHaveTextContent('second'),
    );
    fireEvent.click(screen.getByTestId('confirm-saveAndProceed'));
    await waitFor(() => expect(p2).resolves.toBe('saveAndProceed'));
  });

  it('clicking inside the dialog body does NOT close (event does not bubble to backdrop)', async () => {
    const p = confirm({ title: 't', message: 'm' });
    await screen.findByTestId('confirm-overlay');
    fireEvent.click(screen.getByTestId('confirm-message'));
    // Give microtasks a chance to flush.
    await act(async () => {
      await Promise.resolve();
    });
    // The dialog must still be mounted (click on body should not close).
    expect(screen.getByTestId('confirm-overlay')).toBeInTheDocument();
    // Sanity: click continue and confirm the resolution value.
    fireEvent.click(screen.getByTestId('confirm-continue'));
    await waitFor(() => expect(p).resolves.toBe('continue'));
  });

  it('has correct a11y attributes (role=dialog, aria-modal, aria-labelledby)', async () => {
    confirm({ title: '未保存的更改', message: 'm' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    // The labelledby target exists in the document.
    expect(document.getElementById(labelledBy!)).toBeTruthy();
  });
});
