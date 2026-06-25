// core/generator/diagnostics.ts
// Shared diagnostic channel used by every later task (pipeline, registry,
// EcuC generator, CLI surface). Keep this file dependency-free.

export const DiagnosticSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

export const DiagnosticCode = {
  ECUC_GEN_NO_SCHEMA: 'ECUC-GEN-001',
  ECUC_GEN_NO_GENERATOR: 'ECUC-GEN-002',
  ECUC_GEN_THROW: 'ECUC-GEN-003',
  ECUC_GEN_REF_UNRESOLVED: 'ECUC-GEN-010',
  ECUC_GEN_MULTIPLICITY: 'ECUC-GEN-011',
  ECUC_GEN_TYPE_MISMATCH: 'ECUC-GEN-012',
  ECUC_GEN_RANGE: 'ECUC-GEN-013',
  ECUC_GEN_ORDERING: 'ECUC-GEN-020',
  ECUC_GEN_DUPLICATE_SHORTNAME: 'ECUC-GEN-021',
  ECUC_GEN_TEMPLATE_RENDER: 'ECUC-GEN-030',
  ECUC_GEN_OUTPUT_WRITE: 'ECUC-GEN-031',
  ECUC_GEN_INFO_EMPTY_VARIANT: 'ECUC-GEN-INFO-001',
} as const;

export type DiagnosticSeverityValue = (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity];

export type DiagnosticCodeValue = (typeof DiagnosticCode)[keyof typeof DiagnosticCode];

export interface Diagnostic {
  readonly severity: DiagnosticSeverityValue;
  readonly code: DiagnosticCodeValue;
  readonly moduleShortName?: string;
  readonly bswmdPath?: string;
  readonly ecucPath?: string;
  readonly line?: number;
  readonly message: string;
}
