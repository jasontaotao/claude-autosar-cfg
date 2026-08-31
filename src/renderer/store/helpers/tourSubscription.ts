// src/renderer/store/helpers/tourSubscription.ts
// Renderer-owned bridge from the tour slice to the validation engine.
//
// This lives in the renderer layer because zustand is renderer state.
// Keeping it out of `src/core` prevents the Electron main bundle from
// statically importing browser-only state and crashing before a
// window exists.
import { setValidationPaused } from '../../../core/sws-validator/engine.js';
import { useArxmlStore } from '../useArxmlStore.js';

export function installTourSubscription(): () => void {
  return useArxmlStore.subscribe((state) => {
    setValidationPaused(state.tour.validationPaused);
  });
}
