import { useEffect } from 'react';

import { isSwsValidatorEnabled } from '@core/sws-validator/feature-flag.js';
import { fromArxmlDocument } from '@shared/normalized-document.js';

import { useArxmlStore } from '../store/useArxmlStore';
import { useSwsValidatorStore } from '../store/useSwsValidatorStore';

/**
 * Mount once at App level. When `useArxmlStore.doc` becomes non-null,
 * or when the active doc's dirty flag flips, debounce `delayMs` and
 * then call `useSwsValidatorStore.run({ document, schemaLayer })`.
 *
 * Mirrors `useDebouncedValidation` (Sprint 3) but targets the v1.6.0
 * Cluster G SWS Validator instead of the legacy `useArxmlStore.validate()`
 * path. Two validators coexist; the legacy schema-driven validator
 * stays sync (existing UX contract), while the SWS validator runs
 * async on a debounce so heavy rule suites don't block the UI thread.
 *
 * Skips work entirely when the `experimental.swsValidator` feature
 * flag is OFF (per G spec §2 G5). The store's `run()` also gates on
 * `enabled`, but skipping the doc normalization up-front avoids
 * walking an ArxmlDocument we won't use.
 */
export function useSwsValidatorRunner(delayMs: number = 300): void {
  const doc = useArxmlStore((s) => s.doc);
  const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);
  const isActiveDirty = useArxmlStore(
    (s) => s.activeDocumentPath !== null && s.dirtyPaths.has(s.activeDocumentPath),
  );

  useEffect(() => {
    if (doc === null) return;
    if (!isSwsValidatorEnabled()) return;
    const timer = setTimeout(() => {
      const store = useSwsValidatorStore.getState();
      if (!store.enabled) return;
      void store.run({
        document: fromArxmlDocument(doc),
        // `schemaLayer` is built inside `validate()` from BSWMD schemas;
        // for v1.6.0 we pass null and the engine tolerates missing
        // module metadata. v1.7.0+ may wire `useArxmlStore.bswmdSchemas`
        // through `buildSchemaLayer()` here.
        schemaLayer: null,
      });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [doc, isActiveDirty, activeDocumentPath, delayMs]);
}