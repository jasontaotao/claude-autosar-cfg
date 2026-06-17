// Sprint 12 #3 Task 7 — store dialog state + pendingAction tests.
//
// Pins the contract for the three new top-level state fields consumed
// by NewProjectDialog / ConfirmDialog (via the useProjectActions hook
// in Task 5):
//
//   - newProjectDialogOpen  (boolean, default false)
//   - confirmDialogOpen     (boolean, default false)
//   - pendingAction         (PendingAction | null, default null)
//
// and their corresponding setters (setNewProjectDialogOpen,
// setConfirmDialogOpen, setPendingAction).
//
// PendingAction is a discriminated union of four kinds — these will be
// switched on by the useProjectActions hook (Task 5) when the user
// confirms / discards / continues editing in ConfirmDialog. The store
// itself just stores the action; dispatch happens at the hook layer.

import { describe, it, expect, beforeEach } from 'vitest';

import { useArxmlStore } from '../useArxmlStore.js';
import type { PendingAction } from '../useArxmlStore.js';

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

    it('pendingAction defaults to null', () => {
      expect(useArxmlStore.getState().pendingAction).toBeNull();
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

    it('setNewProjectDialogOpen does not touch other dialog state', () => {
      // Arrange — pre-set the others
      useArxmlStore.getState().setConfirmDialogOpen(true);
      useArxmlStore.getState().setPendingAction({ kind: 'newProject' });

      // Act
      useArxmlStore.getState().setNewProjectDialogOpen(true);

      // Assert
      const after = useArxmlStore.getState();
      expect(after.confirmDialogOpen).toBe(true);
      expect(after.pendingAction).toEqual({ kind: 'newProject' });
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

    it('setConfirmDialogOpen does not touch other dialog state', () => {
      // Arrange
      useArxmlStore.getState().setNewProjectDialogOpen(true);
      useArxmlStore.getState().setPendingAction({ kind: 'openProject' });

      // Act
      useArxmlStore.getState().setConfirmDialogOpen(true);

      // Assert
      const after = useArxmlStore.getState();
      expect(after.newProjectDialogOpen).toBe(true);
      expect(after.pendingAction).toEqual({ kind: 'openProject' });
    });
  });

  // -------------------------------------------------------------------------
  // setPendingAction — records / clears the action that triggered
  // ConfirmDialog. The action kind drives the post-confirm dispatch
  // (handled at the hook layer, Task 5).
  // -------------------------------------------------------------------------

  describe('setPendingAction', () => {
    it('setPendingAction({ kind: "newProject" }) records the action', () => {
      // Arrange
      expect(useArxmlStore.getState().pendingAction).toBeNull();

      // Act
      useArxmlStore.getState().setPendingAction({ kind: 'newProject' });

      // Assert
      expect(useArxmlStore.getState().pendingAction).toEqual({ kind: 'newProject' });
    });

    it('setPendingAction({ kind: "openProject" }) records the action', () => {
      // Act
      useArxmlStore.getState().setPendingAction({ kind: 'openProject' });

      // Assert
      expect(useArxmlStore.getState().pendingAction).toEqual({ kind: 'openProject' });
    });

    it('setPendingAction({ kind: "addBswmd", path, content }) records path + content', () => {
      // Act
      const action: PendingAction = {
        kind: 'addBswmd',
        path: '/schemas/Adc_bswmd.arxml',
        content: '<dummy/>',
      };
      useArxmlStore.getState().setPendingAction(action);

      // Assert
      expect(useArxmlStore.getState().pendingAction).toEqual(action);
    });

    it('setPendingAction({ kind: "removeBswmd", path }) records the path', () => {
      // Act
      const action: PendingAction = { kind: 'removeBswmd', path: '/schemas/Adc_bswmd.arxml' };
      useArxmlStore.getState().setPendingAction(action);

      // Assert
      expect(useArxmlStore.getState().pendingAction).toEqual(action);
    });

    it('setPendingAction(null) clears the action', () => {
      // Arrange — set first
      useArxmlStore.getState().setPendingAction({ kind: 'newProject' });
      expect(useArxmlStore.getState().pendingAction).not.toBeNull();

      // Act
      useArxmlStore.getState().setPendingAction(null);

      // Assert
      expect(useArxmlStore.getState().pendingAction).toBeNull();
    });

    it('setPendingAction preserves the kind — discriminated union works', () => {
      // Discriminator round-trip across all 4 kinds. The TS type system
      // enforces this at compile time; this test pins the runtime shape
      // so a future refactor doesn't accidentally drop a kind.
      const kinds: PendingAction['kind'][] = ['newProject', 'openProject', 'addBswmd', 'removeBswmd'];
      for (const kind of kinds) {
        useArxmlStore.getState().setPendingAction({ kind } as PendingAction);
        const after = useArxmlStore.getState().pendingAction;
        expect(after).not.toBeNull();
        expect(after?.kind).toBe(kind);
      }
    });
  });

  // -------------------------------------------------------------------------
  // clear() resets the new dialog state too (parallel to project state).
  // -------------------------------------------------------------------------

  describe('clear() resets dialog state', () => {
    it('clear resets all three dialog fields back to defaults', () => {
      // Arrange — open both dialogs + set a pending action
      useArxmlStore.getState().setNewProjectDialogOpen(true);
      useArxmlStore.getState().setConfirmDialogOpen(true);
      useArxmlStore.getState().setPendingAction({ kind: 'newProject' });

      // Act
      useArxmlStore.getState().clear();

      // Assert
      const after = useArxmlStore.getState();
      expect(after.newProjectDialogOpen).toBe(false);
      expect(after.confirmDialogOpen).toBe(false);
      expect(after.pendingAction).toBeNull();
    });
  });
});
