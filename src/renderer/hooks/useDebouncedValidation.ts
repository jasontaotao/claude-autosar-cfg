import { useEffect } from 'react';

import { useArxmlStore } from '../store/useArxmlStore';

/**
 * Mount once at App level. When `doc` or `dirty` changes, debounce 300ms then
 * call store.validate(). Cancels the previous timer on subsequent changes.
 *
 * Note: store.updateParam is already sync-revalidating. This hook provides
 * a safety net for any future async mutation paths or for revalidating after
 * IPC actions (setDoc from main process).
 */
export function useDebouncedValidation(delayMs: number = 300): void {
  const doc = useArxmlStore((s) => s.doc);
  // Re-validate when the active doc's dirty bit flips. dirtyPaths is a
  // Set; reading `.has(activeDocumentPath)` from a Zustand selector
  // returns a boolean that Zustand will re-evaluate whenever the Set
  // reference changes, which is what `updateParam` does.
  const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);
  const isActiveDirty = useArxmlStore((s) =>
    s.activeDocumentPath !== null && s.dirtyPaths.has(s.activeDocumentPath),
  );

  useEffect(() => {
    if (!doc) return;
    const timer = setTimeout(() => {
      useArxmlStore.getState().validate();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [doc, isActiveDirty, activeDocumentPath, delayMs]);
}
