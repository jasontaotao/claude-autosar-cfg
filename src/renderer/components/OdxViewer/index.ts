// OdxViewer barrel re-export (v1.22.0 T2).
//
// Pattern mirrors DbcViewer/index.ts: callers import from the
// directory, not the .tsx file. Keeps the import path stable
// when the component is split or refactored.

export { OdxViewer } from './OdxViewer';
export type { OdxViewerProps } from './OdxViewer';
