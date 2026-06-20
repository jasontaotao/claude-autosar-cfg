// @vitest-environment jsdom
//
// RemoveModuleConfirmDialog (Sprint 17 P2):
//   - 4-option modal for the remove-BSWMD-with-dependents flow. Mirrors
//     CascadeConfirmDialog (Sprint 15) but the 4th option lets the user
//     ALSO unlink the BSWMD file from disk (vs the 3-option cascade
//     which leaves the BSWMD file on disk).
//   - Choices: 'cancel' | 'only' | 'cascade' | 'cascade-and-unlink'.
//   - 'only' is the autoFocus default — it is the safest of the 3
//     destructive choices (no disk unlink, no cascade side effects on
//     dependents).
//   - 'cascade' is the existing 3rd option from CascadeConfirmDialog —
//     delete dependents but leave BSWMD on disk.
//   - 'cascade-and-unlink' is the new 4th option — delete dependents
//     AND unlink the BSWMD file from disk (calls `removeBswmdFromDisk`
//     in the store; the actual fs.unlink happens in main via
//     `bswmd:delete`).
//
// Tests pin:
//   1.  renders nothing when no confirm is active
//   2.  renders dialog with title + message + dependent count after
//       confirmRemoveBswmd() is called
//   3.  lists all dependents when count <= 10
//   4.  truncates to 10 + shows "... and N more" when count > 10
//   5.  default focus is on the "Only remove" button (safest of the
//       destructive choices)
//   6.  click "Cancel" resolves with 'cancel'
//   7.  click "Only remove" resolves with 'only'
//   8.  click "Cascade" resolves with 'cascade'
//   9.  click "Cascade and delete BSWMD" resolves with 'cascade-and-unlink'
//  10.  Esc key resolves with 'cancel'
//  11.  backdrop click resolves with 'cancel'
//  12.  has correct a11y attributes (role=dialog, aria-modal,
//       aria-labelledby, aria-describedby)
//  13.  resolves immediately with 'cancel' when root is not mounted
//
// We use `fireEvent` (not `@testing-library/user-event`) to match the
// project convention established in CascadeConfirmDialog.test.tsx.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type RemoveBswmdDependent,
  RemoveModuleConfirmRoot,
  confirmRemoveBswmd,
} from '../RemoveModuleConfirmDialog.js';

/**
 * Mount RemoveModuleConfirmRoot for the current test. The post-mount
 * effect that assigns `externalSetState = setState` must be flushed
 * before any confirmRemoveBswmd() call, otherwise the module-level
 * confirmRemoveBswmd() falls back to resolving immediately with
 * 'cancel'. Mirrors the same helper in CascadeConfirmDialog.test.tsx.
 */
async function mountHost(): Promise<void> {
  render(<RemoveModuleConfirmRoot />);
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Build a list of N synthetic dependents. filePath is derived from the
 * index for easy assertion; the dialog only renders filePath, not
 * containerPath / paramKey (a whole ARXML is the dependent, not a
 * single param like in CascadeConfirmDialog).
 */
function makeDependents(n: number): readonly RemoveBswmdDependent[] {
  return Array.from({ length: n }, (_, i) => ({
    filePath: `D:/proj/Dep${i}_EcucValues.arxml`,
  }));
}

afterEach(() => {
  // Unmount hosts so the module-level handle is cleared and the next
  // test starts from a clean slate.
  cleanup();
});

describe('RemoveModuleConfirmDialog (Sprint 17 P2)', () => {
  beforeEach(async () => {
    await mountHost();
  });

  it('renders nothing when no confirm is active', () => {
    expect(screen.queryByTestId('remove-overlay')).toBeNull();
  });

  it('renders title and message after confirmRemoveBswmd() is called', async () => {
    confirmRemoveBswmd({
      targetShortName: 'Can_bswmd.arxml',
      dependents: makeDependents(3),
    });
    await screen.findByTestId('remove-overlay');

    // Title contains the target name (via t() substitution). Locale-
    // agnostic: both zh-CN and en wrap `{name}` in single quotes.
    expect(screen.getByTestId('remove-title')).toHaveTextContent('Can_bswmd.arxml');
    // Message includes the dependent count (3).
    expect(screen.getByTestId('remove-message')).toHaveTextContent('3');
  });

  it('lists all dependents when count <= 10', async () => {
    confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(3),
    });
    await screen.findByTestId('remove-overlay');

    const list = screen.getByTestId('remove-deps');
    expect(list.children).toHaveLength(3);
    // No truncation footer should be present.
    expect(screen.queryByTestId('remove-more')).toBeNull();
  });

  it('truncates to 10 + shows "... and N more" when count > 10', async () => {
    const deps = makeDependents(15);
    confirmRemoveBswmd({ targetShortName: 'X', dependents: deps });
    await screen.findByTestId('remove-overlay');

    const list = screen.getByTestId('remove-deps');
    expect(list.children).toHaveLength(10);
    // 15 - 10 = 5 more
    const more = screen.getByTestId('remove-more');
    expect(more).toHaveTextContent('5');
    expect(more.textContent).toMatch(/more/i);
  });

  it('default focus is on the "Only remove" button (safest destructive choice)', async () => {
    confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(2),
    });
    const onlyBtn = await screen.findByTestId('remove-only');
    expect(document.activeElement).toBe(onlyBtn);
  });

  it('clicking "Cancel" resolves with "cancel"', async () => {
    const p = confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(2),
    });
    await screen.findByTestId('remove-overlay');
    fireEvent.click(screen.getByTestId('remove-cancel'));
    await waitFor(() => expect(p).resolves.toBe('cancel'));
  });

  it('clicking "Only remove" resolves with "only"', async () => {
    const p = confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(2),
    });
    await screen.findByTestId('remove-overlay');
    fireEvent.click(screen.getByTestId('remove-only'));
    await waitFor(() => expect(p).resolves.toBe('only'));
  });

  it('clicking "Cascade" resolves with "cascade"', async () => {
    const p = confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(2),
    });
    await screen.findByTestId('remove-overlay');
    fireEvent.click(screen.getByTestId('remove-cascade'));
    await waitFor(() => expect(p).resolves.toBe('cascade'));
  });

  it('clicking "Cascade and delete BSWMD" resolves with "cascade-and-unlink"', async () => {
    const p = confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(2),
    });
    await screen.findByTestId('remove-overlay');
    fireEvent.click(screen.getByTestId('remove-cascadeAndUnlink'));
    await waitFor(() => expect(p).resolves.toBe('cascade-and-unlink'));
  });

  it('Escape key resolves with "cancel"', async () => {
    const p = confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(2),
    });
    const overlay = await screen.findByTestId('remove-overlay');
    fireEvent.keyDown(overlay, { key: 'Escape' });
    await waitFor(() => expect(p).resolves.toBe('cancel'));
  });

  it('backdrop click resolves with "cancel"', async () => {
    const p = confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(2),
    });
    await screen.findByTestId('remove-overlay');
    fireEvent.click(screen.getByTestId('remove-overlay'));
    await waitFor(() => expect(p).resolves.toBe('cancel'));
  });

  it('has correct a11y attributes (role=dialog, aria-modal, aria-labelledby, aria-describedby)', async () => {
    confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(1),
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

describe('RemoveModuleConfirmDialog — fallback when root not mounted', () => {
  // No beforeEach mountHost — exercises the "externalSetState is null" branch.
  it('resolves immediately with "cancel" when root is not mounted', async () => {
    const p = confirmRemoveBswmd({
      targetShortName: 'X',
      dependents: makeDependents(0),
    });
    await waitFor(() => expect(p).resolves.toBe('cancel'));
  });
});
