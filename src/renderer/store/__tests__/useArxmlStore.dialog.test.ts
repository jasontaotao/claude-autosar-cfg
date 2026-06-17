// Sprint 12 #3 Task 7 — store dialog state tests (with Stage 3.2 Task 3
// cleanup of `pendingAction`).
//
// Pins the contract for the two top-level state fields consumed by
// NewProjectDialog / ConfirmDialog (via the useProjectActions hook in
// Task 5):
//
//   - newProjectDialogOpen  (boolean, default false)
//   - confirmDialogOpen     (boolean, default false)
//
// and their corresponding setters (setNewProjectDialogOpen,
// setConfirmDialogOpen).
//
// Sprint 13 #2 Stage 3.2 Task 3 — the `pendingAction` field and its
// setter were removed because the renderer never read them. The dialog
// state itself IS the pending intent: a closed dialog means "no
// pending action", an open NewProjectDialog with a name/dir pair means
// "new project pending", etc. Removing the redundant field shrinks the
// store surface and eliminates 5 setter call sites in the hook layer.

import { describe, it, expect, beforeEach } from 'vitest';

import { useArxmlStore } from '../useArxmlStore.js';

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useArxmlStore — dialog state (Sprint 12 #3 Task 7)', () => {
  beforeEach(() => {
    // Reset store between tests — keeps test isolation independent of
    // earlier loose-mode tests that may have loaded docs.
    useArxmlStore.getState().clear();
  });

  describe('initial state', () => {
    it('newProjectDialogOpen defaults to false', () => {
      expect(useArxmlStore.getState().newProjectDialogOpen).toBe(false);
    });

    it('confirmDialogOpen defaults to false', () => {
      expect(useArxmlStore.getState().confirmDialogOpen).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // setNewProjectDialogOpen
  // -------------------------------------------------------------------------

  describe('setNewProjectDialogOpen', () => {
    it('setNewProjectDialogOpen(true) flips newProjectDialogOpen to true', () => {
      // Arrange
      expect(useArxmlStore.getState().newProjectDialogOpen).toBe(false);

      // Act
      useArxmlStore.getState().setNewProjectDialogOpen(true);

      // Assert
      expect(useArxmlStore.getState().newProjectDialogOpen).toBe(true);
    });

    it('setNewProjectDialogOpen(false) flips newProjectDialogOpen back to false', () => {
      // Arrange — open first
      useArxmlStore.getState().setNewProjectDialogOpen(true);
      expect(useArxmlStore.getState().newProjectDialogOpen).toBe(true);

      // Act
      useArxmlStore.getState().setNewProjectDialogOpen(false);

      // Assert
      expect(useArxmlStore.getState().newProjectDialogOpen).toBe(false);
    });

    it('setNewProjectDialogOpen does not touch confirmDialogOpen', () => {
      // Arrange — pre-set the other
      useArxmlStore.getState().setConfirmDialogOpen(true);

      // Act
      useArxmlStore.getState().setNewProjectDialogOpen(true);

      // Assert
      const after = useArxmlStore.getState();
      expect(after.confirmDialogOpen).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // setConfirmDialogOpen
  // -------------------------------------------------------------------------

  describe('setConfirmDialogOpen', () => {
    it('setConfirmDialogOpen(true) flips confirmDialogOpen to true', () => {
      // Arrange
      expect(useArxmlStore.getState().confirmDialogOpen).toBe(false);

      // Act
      useArxmlStore.getState().setConfirmDialogOpen(true);

      // Assert
      expect(useArxmlStore.getState().confirmDialogOpen).toBe(true);
    });

    it('setConfirmDialogOpen(false) flips confirmDialogOpen back to false', () => {
      // Arrange — open first
      useArxmlStore.getState().setConfirmDialogOpen(true);

      // Act
      useArxmlStore.getState().setConfirmDialogOpen(false);

      // Assert
      expect(useArxmlStore.getState().confirmDialogOpen).toBe(false);
    });

    it('setConfirmDialogOpen does not touch newProjectDialogOpen', () => {
      // Arrange
      useArxmlStore.getState().setNewProjectDialogOpen(true);

      // Act
      useArxmlStore.getState().setConfirmDialogOpen(true);

      // Assert
      const after = useArxmlStore.getState();
      expect(after.newProjectDialogOpen).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // clear() resets the dialog state too (parallel to project state).
  // -------------------------------------------------------------------------

  describe('clear() resets dialog state', () => {
    it('clear resets both dialog fields back to defaults', () => {
      // Arrange — open both dialogs
      useArxmlStore.getState().setNewProjectDialogOpen(true);
      useArxmlStore.getState().setConfirmDialogOpen(true);

      // Act
      useArxmlStore.getState().clear();

      // Assert
      const after = useArxmlStore.getState();
      expect(after.newProjectDialogOpen).toBe(false);
      expect(after.confirmDialogOpen).toBe(false);
    });
  });
});
