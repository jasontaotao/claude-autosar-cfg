// @vitest-environment jsdom
//
// CascadeConfirmDialog (Sprint 15 / Phase 3.3):
//   - 3-option modal for the delete-container-with-references flow.
//   - Module-level externalSetState + promise resolve pattern (mirrors
//     ConfirmDialog and PromptDialog).
//   - Esc / backdrop click all resolve with 'cancel' (the user has not
//     committed to a destructive action).
//   - Default focus is on the "Only delete" button (per spec).
//   - Renders a list of references; truncates to 10 + "... and N more".
//
// We intentionally reuse `fireEvent` (not `@testing-library/user-event`)
// because the project standardised on fireEvent to avoid pulling in a new
// runtime dep mid-sprint (see src/renderer/components/tree/__tests__/Tree.test.tsx
// header comment for the rationale).
//
// Tests pin:
//   1.  renders nothing when no confirm is active
//   2.  renders dialog with title and message after confirmCascade() is called
//   3.  lists all references when count <= 10
//   4.  truncates to 10 + shows "... and N more" when count > 10
//   5.  default focus is on the "Only delete" button
//   6.  click "Cancel" resolves with 'cancel'
//   7.  click "Only delete" resolves with 'only'
//   8.  click "Cascade" resolves with 'cascade'
//   9.  Esc key resolves with 'cancel'
//  10.  backdrop click resolves with 'cancel'
//  11.  renders nothing when root not mounted (fallback to 'cancel')

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CascadeConfirmRoot,
  confirmCascade,
  type CascadeReference,
} from '../CascadeConfirmDialog.js';

/**
 * Mount CascadeConfirmRoot for the current test. The post-mount effect
 * that assigns `externalSetState = setState` must be flushed before any
 * confirmCascade() call, otherwise the module-level confirmCascade()
 * falls back to resolving immediately with 'cancel'.
 */
async function mountHost(): Promise<void> {
  render(<CascadeConfirmRoot />);
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Build a list of N synthetic references. filePath and containerPath are
 * derived from the index for easy assertion.
 */
function makeRefs(n: number): readonly CascadeReference[] {
  return Array.from({ length: n }, (_, i) => ({
    filePath: `Can${i}.arxml`,
    containerPath: `/CanIf/CanIfInitCfg/RxPdu[${i}]`,
    paramKey: 'CanIfBufferRef',
  }));
}

afterEach(() => {
  // Unmount hosts so the module-level handle is cleared and the next
  // test starts from a clean slate.
  cleanup();
});

describe('CascadeConfirmDialog (Sprint 15 / Phase 3.3)', () => {
  beforeEach(async () => {
    await mountHost();
  });

  it('renders nothing when no confirm is active', () => {
    expect(screen.queryByTestId('cascade-overlay')).toBeNull();
  });

  it('renders title and message after confirmCascade() is called', async () => {
    confirmCascade({
      targetShortName: 'CanIfBufferCfg',
      references: makeRefs(3),
    });
    await screen.findByTestId('cascade-overlay');

    // Title contains the target name (via t() substitution). Locale-
    // agnostic: both zh-CN and en wrap `{name}` in single quotes.
    expect(screen.getByTestId('cascade-title')).toHaveTextContent('CanIfBufferCfg');
    // Message includes the count (3).
    expect(screen.getByTestId('cascade-message')).toHaveTextContent('3');
  });

  it('lists all references when count <= 10', async () => {
    confirmCascade({
      targetShortName: 'CanIfBufferCfg',
      references: makeRefs(3),
    });
    await screen.findByTestId('cascade-overlay');

    const list = screen.getByTestId('cascade-refs');
    expect(list.children).toHaveLength(3);
    // No truncation footer should be present.
    expect(screen.queryByTestId('cascade-more')).toBeNull();
  });

  it('truncates to 10 + shows "... and N more" when count > 10', async () => {
    const refs = makeRefs(15);
    confirmCascade({ targetShortName: 'X', references: refs });
    await screen.findByTestId('cascade-overlay');

    const list = screen.getByTestId('cascade-refs');
    expect(list.children).toHaveLength(10);
    // 15 - 10 = 5 more
    const more = screen.getByTestId('cascade-more');
    expect(more).toHaveTextContent('5');
    expect(more.textContent).toMatch(/more/i);
  });

  it('default focus is on the "Only delete" button', async () => {
    confirmCascade({
      targetShortName: 'X',
      references: makeRefs(2),
    });
    const onlyBtn = await screen.findByTestId('cascade-only');
    expect(document.activeElement).toBe(onlyBtn);
  });

  it('clicking "Cancel" resolves with "cancel"', async () => {
    const p = confirmCascade({
      targetShortName: 'X',
      references: makeRefs(2),
    });
    await screen.findByTestId('cascade-overlay');
    fireEvent.click(screen.getByTestId('cascade-cancel'));
    await waitFor(() => expect(p).resolves.toBe('cancel'));
  });

  it('clicking "Only delete" resolves with "only"', async () => {
    const p = confirmCascade({
      targetShortName: 'X',
      references: makeRefs(2),
    });
    await screen.findByTestId('cascade-overlay');
    fireEvent.click(screen.getByTestId('cascade-only'));
    await waitFor(() => expect(p).resolves.toBe('only'));
  });

  it('clicking "Cascade" resolves with "cascade"', async () => {
    const p = confirmCascade({
      targetShortName: 'X',
      references: makeRefs(2),
    });
    await screen.findByTestId('cascade-overlay');
    fireEvent.click(screen.getByTestId('cascade-cascade'));
    await waitFor(() => expect(p).resolves.toBe('cascade'));
  });

  it('Escape key resolves with "cancel"', async () => {
    const p = confirmCascade({
      targetShortName: 'X',
      references: makeRefs(2),
    });
    const overlay = await screen.findByTestId('cascade-overlay');
    fireEvent.keyDown(overlay, { key: 'Escape' });
    await waitFor(() => expect(p).resolves.toBe('cancel'));
  });

  it('backdrop click resolves with "cancel"', async () => {
    const p = confirmCascade({
      targetShortName: 'X',
      references: makeRefs(2),
    });
    await screen.findByTestId('cascade-overlay');
    fireEvent.click(screen.getByTestId('cascade-overlay'));
    await waitFor(() => expect(p).resolves.toBe('cancel'));
  });

  it('has correct a11y attributes (role=dialog, aria-modal, aria-labelledby, aria-describedby)', async () => {
    confirmCascade({
      targetShortName: 'X',
      references: makeRefs(1),
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toBeTruthy();
    expect(document.getElementById(describedBy!)).toBeTruthy();
  });
});

describe('CascadeConfirmDialog — fallback when root not mounted', () => {
  // No beforeEach mountHost — exercises the "externalSetState is null" branch.
  it('resolves immediately with "cancel" when root is not mounted', async () => {
    const p = confirmCascade({
      targetShortName: 'X',
      references: makeRefs(0),
    });
    await waitFor(() => expect(p).resolves.toBe('cancel'));
  });
});
