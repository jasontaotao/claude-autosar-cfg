// Additive DBC full-import IPC DTOs. This file is intentionally separate
// from `types.ts`: the v1.23.0 `dbc:importComStack` bridge contract remains
// unchanged while the full-import preview/commit surface evolves
// independently. Mirrors the ODX `odx-import.ts` layout.
// Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
// §8.1 (preview row model) + §10.1 (IPC contract) + §12 (hard error closed set).
import type { DbcWarningCode, DbmWarning } from '../../core/dbc/dbm.js';
import type { PduIdPolicy, UpperLayerNamingPolicy } from '../../core/dbc/profile.js';
import type { ImportDecision } from '../../core/odx/threeWayMerge.js';

/** 复用既有泛化合并的决策类型，禁止新定义（spec §8.1）。 */
export type DbcImportDecision = ImportDecision;

export type DbcImportCategory =
  | 'added'
  | 'updated'
  | 'locally-modified'
  | 'conflict'
  | 'converged'
  | 'removed-in-dbc';

export interface DbcImportFieldDiff {
  readonly moduleName: 'Com' | 'CanIf' | 'PduR';
  readonly containerPath: string;
  /** BSWMD definition spine key（§4.2），不是实例路径；UI 显示取最后一段。 */
  readonly paramKey: string;
  readonly local?: string | number | boolean;
  readonly incoming?: string | number | boolean;
  readonly source: 'Auto' | 'Derived' | 'Profile-default' | 'Unmapped' | 'Error';
  readonly warningCodes?: readonly DbcWarningCode[];
}

export interface DbcImportRow {
  readonly module: 'Com' | 'CanIf' | 'PduR';
  readonly path: string;
  readonly shortName: string;
  readonly category: DbcImportCategory;
  readonly defaultDecision: DbcImportDecision;
  readonly conflictDetail?: {
    readonly localHash: string;
    readonly incomingHash: string;
  };
  readonly fieldDiffs: readonly DbcImportFieldDiff[];
}

/** Preview 统计。skippedIrrelevantMessages 支撑 §7.3.1 的过滤呈现。 */
export interface DbcImportStats {
  readonly messages: number; // DBC 解析出的全部 message 数，不含相关性过滤
  readonly signals: number; // DBC 解析出的全部 signal 数，不含相关性 / multiplex 过滤
  readonly skippedIrrelevantMessages: number;
  readonly skippedMultiplexedSignals: number; // 仅统计相关 message 中的 muxed 信号
}

export interface DbcFullImportPreviewRequest {
  readonly dbcPath: string;
  /** Step 1 discovery 可省略：返回 nodes / targetModules，rows 为空。mapping 预览必须提供。 */
  readonly targetNode?: string;
  /** renderer 持有的未保存文档绝对路径列表（dirty 判定的唯一数据源，§6.2）。 */
  readonly dirtyDocPaths: readonly string[];
  /** Phase 2 固定为内置默认值常量；Phase 3 起为实际 Profile id。 */
  readonly profileId: string;
  readonly pduIdPolicy?: Partial<PduIdPolicy>;
  readonly upperLayerNaming?: Partial<UpperLayerNamingPolicy>;
}

export interface DbcFullImportPreview {
  readonly nodes: readonly string[]; // DBC BU_ 列表，供 wizard Step 1 选择/校验
  readonly targetModules: Readonly<Record<'Com' | 'CanIf' | 'PduR', DbcTargetModuleInfo>>;
  readonly rows: readonly DbcImportRow[];
  readonly warnings: readonly DbmWarning[];
  readonly stats: DbcImportStats;
  readonly previewHash: string;
}

export interface DbcTargetModuleInfo {
  readonly exists: boolean;
  readonly docPath?: string;
  readonly dirty: boolean;
}

export type DbcFullImportPreviewResponse =
  | { readonly ok: true; readonly value: DbcFullImportPreview }
  | { readonly ok: false; readonly error: DbcImportError };

export interface DbcFullImportCommitRequest extends DbcFullImportPreviewRequest {
  readonly previewHash: string;
  readonly decisions: readonly {
    readonly module: 'Com' | 'CanIf' | 'PduR';
    readonly path: string;
    readonly decision: DbcImportDecision;
  }[];
}

export type DbcFullImportCommitResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly applied: number;
        readonly kept: number;
        readonly deleted: number;
        readonly manifestPath: string; // provenance 文件路径（与 ODX commit 返回对齐）
      };
    }
  | { readonly ok: false; readonly error: DbcImportError };

/**
 * §12 表的 discriminated union（kind 的 closed set 以 §12 为 normative 来源）；
 * `write-failed` 必须携带 `rolledBack`。与既有 `OdxImportError` 同构。
 */
export type DbcImportError =
  | {
      readonly kind:
        | 'dbc-malformed'
        | 'dbc-too-large'
        | 'dbc-no-messages'
        | 'dbc-target-node-invalid'
        | 'dbc-profile-not-found'
        | 'dbc-bswmd-not-loaded'
        | 'dbc-module-ambiguous'
        | 'dbc-target-dirty'
        | 'dbc-commit-mismatch'
        | 'read-failed';
      readonly message: string;
    }
  | { readonly kind: 'write-failed'; readonly message: string; readonly rolledBack: boolean };
