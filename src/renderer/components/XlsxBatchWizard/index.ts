// XlsxBatchWizard barrel re-export (v1.25.0 T5).
//
// Mirrors the DbcViewer / OdxViewer / ScriptPanel / StencilWizard /
// DbcImportWizard pattern: callers import from the directory, not
// the .tsx file. Keeps the import path stable when the component is
// split or refactored.

export { XlsxBatchWizard } from './XlsxBatchWizard';
export type { XlsxBatchWizardProps } from './XlsxBatchWizard';
