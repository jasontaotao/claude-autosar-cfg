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
  const dirty = useArxmlStore((s) => s.dirty);

  useEffect(() => {
    if (!doc) return;
    const timer = setTimeout(() => {
      useArxmlStore.getState().validate();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [doc, dirty, delayMs]);
}
