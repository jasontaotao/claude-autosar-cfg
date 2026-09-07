// dbcFullImportPreviewHandler — read-only orchestration for the DBC full
// import preview (`dbc:fullImportPreview`). Deliberately never writes any
// file: it reads the open project manifest, value ARXMLs, BSWMDs, the DBC
// source and the tolerant DBC provenance manifest, then classifies the
// deterministic incoming Com / CanIf / PduR modules with the generalized
// three-way merge. Commit-only decisions are handled by a separate IPC
// channel (Task 11).
//
// Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
// §8 (preview model) + §9 (merge / provenance) + §12 (closed error set).

import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';

import type { ArxmlModule } from '../../core/arxml/types.js';
import type { DbcImportModule } from '../../core/dbc/bswmdDefIndex.js';
import type { DbmWarning } from '../../core/dbc/dbm.js';
import type {
  DbcImportProfile,
  PduIdPolicy,
  UpperLayerNamingPolicy,
} from '../../core/dbc/profile.js';
import {
  classifyImportRows,
  collectImportContainers,
  hashContainerForProvenance,
} from '../../core/import/threeWayMerge.js';
import type {
  DbcFullImportPreview,
  DbcFullImportPreviewRequest,
  DbcFullImportPreviewResponse,
  DbcImportError,
  DbcImportFieldDiff,
  DbcImportRow,
  DbcTargetModuleInfo,
} from '../../shared/types/dbc-import.js';

import {
  dbcManifestSourceId,
  loadDbcBswmdIndex,
  loadDbm,
  loadProjectContext,
  readDbcProvenanceManifest,
  resolveDbcProfileForRequest,
  runDbcMapping,
} from './dbcFullImportRuntime.js';
import type { DbcProjectContext, DbcProjectTarget } from './dbcFullImportRuntime.js';

// ---------------------------------------------------------------------------
// Error mapping（closed `DbcImportError` union，spec §12）。
// ---------------------------------------------------------------------------

/** preview 可能产生的 error kinds（write-failed / dbc-commit-mismatch 属 commit 侧）。 */
type PreviewErrorKind = Exclude<DbcImportError['kind'], 'write-failed' | 'dbc-commit-mismatch'>;

function errorFromUnknown(error: unknown, fallback: string): DbcImportError {
  const message = error instanceof Error ? error.message : String(error);
  const kinds: readonly PreviewErrorKind[] = [
    'dbc-malformed',
    'dbc-too-large',
    'dbc-no-messages',
    'dbc-target-node-invalid',
    'dbc-profile-not-found',
    'dbc-bswmd-not-loaded',
    'dbc-module-ambiguous',
    'dbc-target-dirty',
    'read-failed',
  ];
  for (const kind of kinds) {
    if (message.startsWith(`${kind}:`)) {
      return { kind, message: message.slice(kind.length + 1).trim() };
    }
  }
  return { kind: 'read-failed', message: fallback || message };
}

function emptyStats(): DbcFullImportPreview['stats'] {
  return {
    messages: 0,
    signals: 0,
    skippedIrrelevantMessages: 0,
    skippedMultiplexedSignals: 0,
  };
}

// ---------------------------------------------------------------------------
// Preview hash（spec §8.3）：固定字段对象，sha256(JSON.stringify) 序列化。
// profile 传解析后（含 override 生效）的值，保证 policy 变更改变 hash、
// 相同输入重复调用 hash 不变。targetNode / pduIdPolicy / upperLayerNaming
// 传请求生效值；discovery 模式（无 targetNode）返回空串 hash。
// ---------------------------------------------------------------------------

function dbcPreviewHash(input: {
  readonly dbmSourceHash: string;
  readonly targetNode: string;
  readonly profile: DbcImportProfile;
  readonly pduIdPolicy: PduIdPolicy;
  readonly upperLayerNaming: UpperLayerNamingPolicy;
  readonly rows: readonly DbcImportRow[];
  readonly targetModules: DbcFullImportPreview['targetModules'];
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

// ---------------------------------------------------------------------------
// Row building（§8.1 + §9.2 provenance conflict rule）。
// ---------------------------------------------------------------------------

/**
 * 把 mapper 的字段 diff 并入 classifyImportRows 产出的行：diff.containerPath
 * 已是实例路径（RULING 10），与 collectImportContainers 的 key（= row.path）
 * 按路径相等合并。
 */
function mergeFieldDiffs(
  rows: ReadonlyArray<Omit<DbcImportRow, 'fieldDiffs'>>,
  fieldDiffsByModule: ReadonlyMap<DbcImportModule, readonly DbcImportFieldDiff[]>,
): readonly DbcImportRow[] {
  const diffsByPath = new Map<string, DbcImportFieldDiff[]>();
  for (const group of fieldDiffsByModule.values()) {
    for (const fieldDiff of group) {
      const list = diffsByPath.get(fieldDiff.containerPath) ?? [];
      list.push(fieldDiff);
      diffsByPath.set(fieldDiff.containerPath, list);
    }
  }
  return rows.map((row) => {
    const diffs = diffsByPath.get(row.path);
    // DbcImportRow.fieldDiffs 是必填数组字段：无 diff 的行也补空数组。
    return { ...row, fieldDiffs: diffs ?? [] };
  });
}

/**
 * Provenance conflict rule（spec §9.2）：container 的 provenance owner 是
 * 其他 DBC source 时按「非 owner 的 base 视为已修改」处理 → 强制 conflict
 * （默认 keep-local，携带双方 hash）。owner 即当前请求 source 时走正常 base。
 */
function enforceOwnerConflicts(
  rows: ReadonlyArray<Omit<DbcImportRow, 'fieldDiffs'>>,
  currentSourceId: string,
  ownerSourceIdByPath: ReadonlyMap<string, string>,
  currentHashes: ReadonlyMap<string, string>,
  incomingHashes: ReadonlyMap<string, string>,
): ReadonlyArray<Omit<DbcImportRow, 'fieldDiffs'>> {
  return rows.map((row) => {
    const owner = ownerSourceIdByPath.get(row.path);
    if (owner === undefined || owner === currentSourceId) return row;
    const incomingHash = incomingHashes.get(row.path);
    if (incomingHash === undefined) return row; // incoming 已无该容器 → 保持原行
    const localHash = currentHashes.get(row.path);
    return {
      ...row,
      category: 'conflict',
      defaultDecision: 'keep-local',
      conflictDetail: { localHash: localHash ?? 'deleted', incomingHash },
    };
  });
}

/** 按模块分组收集容器 hash（collectImportContainers key = 实例路径）。 */
function containerHashMaps(
  modules: ReadonlyMap<DbcImportModule, ArxmlModule>,
): ReadonlyMap<DbcImportModule, ReadonlyMap<string, string>> {
  const result = new Map<DbcImportModule, ReadonlyMap<string, string>>();
  for (const [shortName, module] of modules) {
    const hashes = new Map(
      [...collectImportContainers(module)].map(([path, container]) => [
        path,
        hashContainerForProvenance(container),
      ]),
    );
    result.set(shortName, hashes);
  }
  return result;
}

function targetModuleInfo(
  target: DbcProjectTarget | undefined,
  dirtyPaths: ReadonlySet<string>,
): DbcTargetModuleInfo {
  if (target === undefined) return { exists: false, dirty: false };
  return {
    exists: true,
    docPath: target.docPath,
    dirty: dirtyPaths.has(resolve(target.docPath)),
  };
}

/** 构建 targetModules（不可变：DTO 属性 readonly，每次新建对象）。 */
function buildTargetModules(
  project: DbcProjectContext,
  dirtyPaths: ReadonlySet<string>,
): DbcFullImportPreview['targetModules'] {
  return {
    Com: targetModuleInfo(project.targetModules.get('Com'), dirtyPaths),
    CanIf: targetModuleInfo(project.targetModules.get('CanIf'), dirtyPaths),
    PduR: targetModuleInfo(project.targetModules.get('PduR'), dirtyPaths),
  };
}

/** rows 按 (module, path) code-unit 序排序（§8.3，与 ODX 一致）。 */
function sortRows(rows: readonly DbcImportRow[]): readonly DbcImportRow[] {
  return [...rows].sort((a, b) => {
    if (a.module !== b.module) return a.module < b.module ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Handler。
// ---------------------------------------------------------------------------

export async function dbcFullImportPreviewHandler(
  request: DbcFullImportPreviewRequest,
): Promise<DbcFullImportPreviewResponse> {
  const { targetNode } = request;
  try {
    const project = await loadProjectContext();
    const dirtyPaths = new Set(request.dirtyDocPaths.map((path) => resolve(path)));

    const targetModules = buildTargetModules(project, dirtyPaths);

    const dbm = await loadDbm(request.dbcPath);
    if (dbm.messages.length === 0) {
      return { ok: false, error: { kind: 'dbc-no-messages', message: 'DBC has no messages' } };
    }

    // Discovery-only 预览（wizard Step 1，spec §6.2）：不加载 BSWMD。
    if (targetNode === undefined) {
      return {
        ok: true,
        value: {
          nodes: dbm.nodes.map((node) => node.name),
          targetModules,
          rows: [],
          warnings: [...dbm.warnings],
          stats: emptyStats(),
          previewHash: '',
        },
      };
    }

    // Mapping 预览（wizard Step 2+）。
    if (!dbm.nodes.some((node) => node.name === targetNode)) {
      return {
        ok: false,
        error: { kind: 'dbc-target-node-invalid', message: `'${targetNode}' is not a DBC node` },
      };
    }
    for (const shortName of ['Com', 'CanIf', 'PduR'] as const) {
      const info = targetModules[shortName];
      if (info.exists && info.docPath !== undefined && info.dirty) {
        return {
          ok: false,
          error: {
            kind: 'dbc-target-dirty',
            message: `${shortName} target document is dirty; save it before preview`,
          },
        };
      }
    }

    const index = await loadDbcBswmdIndex(project.manifestDir, project.manifest.bswmdPaths);
    const profile = resolveDbcProfileForRequest(
      request.profileId,
      request.pduIdPolicy,
      request.upperLayerNaming,
    );

    const mapped = runDbcMapping(
      { dbm, targetNode, profile, targetModules: project.targetModules },
      index,
    );

    const warnings: DbmWarning[] = [...mapped.warnings];
    const provenance = await readDbcProvenanceManifest(project.manifestDir, warnings);
    const currentSourceId = dbcManifestSourceId({
      sourceFile: basename(request.dbcPath),
      sourceHash: dbm.meta.sourceHash,
      targetNode,
      profileId: request.profileId,
    });

    const incomingHashesByModule = containerHashMaps(mapped.modules);
    const currentHashesByModule = new Map<DbcImportModule, ReadonlyMap<string, string>>();
    for (const shortName of ['Com', 'CanIf', 'PduR'] as const) {
      const target = project.targetModules.get(shortName);
      currentHashesByModule.set(
        shortName,
        target === undefined
          ? new Map<string, string>()
          : new Map(
              [...collectImportContainers(target.module)].map(([path, container]) => [
                path,
                hashContainerForProvenance(container),
              ]),
            ),
      );
    }

    const rows: Array<Omit<DbcImportRow, 'fieldDiffs'>> = [];
    for (const shortName of ['Com', 'CanIf', 'PduR'] as const) {
      const incomingHashes = incomingHashesByModule.get(shortName) ?? new Map<string, string>();
      const currentHashes = currentHashesByModule.get(shortName) ?? new Map<string, string>();
      const baseEntries = new Map(
        [...provenance.entries].filter(([, entry]) => entry.module === shortName),
      );
      rows.push(
        ...enforceOwnerConflicts(
          classifyImportRows({
            module: shortName,
            removedCategoryLabel: 'removed-in-dbc',
            manifestEntries: baseEntries,
            currentContainers: currentHashes,
            incomingContainers: incomingHashes,
          }),
          currentSourceId,
          provenance.ownerSourceIdByPath,
          currentHashes,
          incomingHashes,
        ),
      );
    }
    const rowsWithDiffs = mergeFieldDiffs(rows, mapped.fieldDiffsByModule);
    const sortedRows = sortRows(rowsWithDiffs);

    const previewHash = dbcPreviewHash({
      dbmSourceHash: dbm.meta.sourceHash,
      targetNode,
      profile,
      pduIdPolicy: profile.modules.CanIf.pduIdPolicy,
      upperLayerNaming: profile.modules.CanIf.upperLayerNaming,
      rows: sortedRows,
      targetModules,
    });

    return {
      ok: true,
      value: {
        nodes: dbm.nodes.map((node) => node.name),
        targetModules,
        rows: sortedRows,
        warnings,
        stats: mapped.stats,
        previewHash,
      },
    };
  } catch (error) {
    return { ok: false, error: errorFromUnknown(error, 'DBC preview failed') };
  }
}

export type { DbcFullImportPreviewRequest, DbcFullImportPreviewResponse };

/** Task 11 commit 用：重算与 preview 完全一致的 preview（hash 比对入口）。 */
export const computeDbcFullImportPreview = dbcFullImportPreviewHandler;
