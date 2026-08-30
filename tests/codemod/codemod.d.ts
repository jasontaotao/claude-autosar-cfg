// tests/codemod/codemod.d.ts — scripts/codemod/*.mjs 的类型声明。
// TS 不解析 .mjs 实现（无 allowJs），签名取自 Task 2 brief「Interfaces」节；
// 行为正确性由 tests/codemod/__tests__/hex-to-tokens.test.ts 运行时保证。
// 注意：本仓库当前仅 hex-to-tokens.mjs 被 TS 导入，故通配声明按其导出收窄。
declare module '*.mjs' {
  export interface Deviation {
    value: string;
    count: number;
    firstLine: number;
  }

  export interface TransformStats {
    plannedCommentsStripped: number;
    danglingRewritten: number;
    replaced: number;
  }

  export interface TransformMaps {
    tokenMap?: Record<string, string>;
    adjudicatedMap?: Record<string, string>;
    fileOverrides?: Record<string, Record<string, string>>;
    alphaMap?: Record<string, string>;
    gradientMap?: Record<string, string>;
    exceptions?: Set<string>;
  }

  export const TOKEN_MAP: Record<string, string>;
  export const ADJUDICATED_TOKEN_MAP: Record<string, string>;
  export const FILE_OVERRIDES: Record<string, Record<string, string>>;
  export const ALPHA_MAP: Record<string, string>;
  export const GRADIENT_MAP: Record<string, string>;
  export const EXCEPTIONS: Set<string>;

  export function expandHex(hex: string): string;
  export function rgbSpaceToHex(fn: string): string | null;
  export function normalizeAlpha(fn: string): string;
  export function findCssFiles(root?: string): string[];
  export function scanResidue(
    css: string,
    relFile?: string,
    exceptions?: Set<string>,
  ): Array<{ line: number; kind: string; value: string }>;
  export function transformCss(
    css: string,
    relFile: string,
    maps?: TransformMaps,
  ): { output: string; deviations: Deviation[]; stats: TransformStats };
}
