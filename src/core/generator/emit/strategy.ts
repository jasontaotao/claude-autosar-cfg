/**
 * Emit strategy for BSW configuration parameter declarations.
 *
 * These functions are pure C-string producers, one per
 * (configClass × isArray) cell of the BSW generator output:
 *
 *   PreCompile  → emitConstDecl   (CONST(...) ... = ...;)
 *   Link        → emitExternDecl  (extern CONST(...) ...;)
 *   PostBuild   → emitLoaderEntry (static ...; + runtime copy stub)
 *
 * Inputs are deliberately decoupled from the ECUC type system:
 * callers precompute `cType` and `cValue` (see handlebars-helpers.ts)
 * and pass them as plain strings. The emit functions never reach
 * back into BswmdParamDef — they only know C shape.
 */

export interface ConstDeclInput {
  readonly ident: string;
  readonly def: unknown;
  readonly value: unknown;
  readonly isArray: boolean;
  readonly cType: string;
  readonly cValue: string;
}

export function emitConstDecl(input: ConstDeclInput): string {
  if (!input.isArray) {
    return `CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident} = ${input.cValue};`;
  }
  const arr = input.value as readonly unknown[];
  const lit = arr.map((v) => String(v)).join(', ');
  return `CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident}[${arr.length}] = { ${lit} };`;
}

export interface ExternDeclInput {
  readonly ident: string;
  readonly cType: string;
  readonly isArray: boolean;
  readonly arrayLen?: number;
}

export function emitExternDecl(input: ExternDeclInput): string {
  if (!input.isArray) {
    return `extern CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident};`;
  }
  return `extern CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident}[${input.arrayLen ?? 0}];`;
}

export interface LoaderEntryInput {
  readonly ident: string;
  readonly cType: string;
  readonly isArray: boolean;
  readonly value?: unknown;
  readonly arrayLen?: number;
  readonly offset?: number;
}

export function emitLoaderEntry(input: LoaderEntryInput): string {
  if (!input.isArray) {
    return `static ${input.cType} ${input.ident};`;
  }
  const offset = (input.offset ?? 0).toString(16).padStart(2, '0');
  return [
    `static ${input.cType} ${input.ident}[${input.arrayLen ?? 0}];`,
    `*(uint8*)((uintptr_t)baseAddr + 0x${offset}u) = ${input.value ?? 0};`,
  ].join('\n');
}
