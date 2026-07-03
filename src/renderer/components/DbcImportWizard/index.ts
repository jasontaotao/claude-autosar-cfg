// DbcImportWizard barrel re-export (v1.23.0 T4).
//
// Mirrors the DbcViewer / OdxViewer / ScriptPanel / StencilWizard
// pattern: callers import from the directory, not the .tsx file.
// Keeps the import path stable when the component is split or
// refactored.

export { DbcImportWizard } from './DbcImportWizard';
export type { DbcImportWizardProps } from './DbcImportWizard';
