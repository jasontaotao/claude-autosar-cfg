// DbcViewer barrel re-export (Bug #5).
//
// Pattern mirrors `ScriptPanel/index.ts` and `StencilWizard/index.ts`:
// callers import from the directory, not the .tsx file. Keeps the
// import path stable when the component is split or refactored.

export { DbcViewer } from './DbcViewer';
export type { DbcViewerProps } from './DbcViewer';
