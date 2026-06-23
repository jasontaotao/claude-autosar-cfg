// src/renderer/store/helpers/paramUpdate.ts
// Renderer-side facade for `applyParamUpdate`. The implementation
// lives in `core/arxml/mutation.ts` (Sprint 18 hotfix) so the
// post-fold wrapper handling, definitionRef preservation, and
// reference-equality contracts are consistent across every call
// site (renderer, scripts, headless CLI).
//
// We re-export from here so the existing `import { applyParamUpdate }
// from '../../store/helpers/paramUpdate'` imports in
// `useArxmlStore.ts` keep working.

export {
  applyParamUpdate,
} from '@core/arxml/mutation';