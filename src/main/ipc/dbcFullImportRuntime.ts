// DBC full-import runtime — main-process orchestration pieces shared by the
// preview handler (Task 10, read-only) and the future commit handler
// (Task 11). Mirrors the ODX split where preview and commit re-run exactly
// the same deterministic mapping pipeline (`computeOdxImportMappedModules`).
//
// Read-only by contract: this module never writes any file. Provenance
// reads are tolerant (missing file → empty; malformed / wrong-version →
// `dbc-manifest-ignored` warning + empty), matching spec §9.2.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { parseArxml } from '../../core/arxml/parser.js';
import type { ParseError } from '../../core/arxml/parser.js';
import type {
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
} from '../../core/arxml/types.js';
import { buildDbcBswmdDefIndex } from '../../core/dbc/bswmdDefIndex.js';
import type { DbcBswmdDefIndex, DbcImportModule } from '../../core/dbc/bswmdDefIndex.js';
import type { Dbm, DbmWarning } from '../../core/dbc/dbm.js';
import { buildDbm, createDbmDocument } from '../../core/dbc/dbmBuilder.js';
import { mapDbmToEcuc } from '../../core/dbc/mappers/mapDbmToEcuc.js';
import type { MapDbmToEcucResult } from '../../core/dbc/mappers/mapDbmToEcuc.js';
import { applyDbcPolicyOverrides, resolveDbcProfile } from '../../core/dbc/profile.js';
import type {
  DbcImportProfile,
  PduIdPolicy,
  UpperLayerNamingPolicy,
} from '../../core/dbc/profile.js';
import { collectImportContainers } from '../../core/import/threeWayMerge.js';
import type { BswModuleDef, BswmdError } from '../../core/project/bswmd.js';
import { parseBswmd } from '../../core/project/bswmd.js';
import { loadManifest } from '../../core/project/manifest.js';
import type { ProjectManifest } from '../../shared/project.js';
import type { DbcFullImportPreviewRequest } from '../../shared/types/dbc-import.js';

import { DBC_MAX_BYTES } from './dbcParseForBridgeHandler.js';
import { getOpenProjectManifestPath } from './project-manifest-state.js';
import { readFileWithCap, DEFAULT_FILE_CAP_BYTES } from './sizeCap.js';

export const DBC_PROVENANCE_RELATIVE_PATH = join('.autosarcfg', 'dbc-import-manifest.json');

// ---------------------------------------------------------------------------
// DBC provenance manifest（spec §9.2）。
// ---------------------------------------------------------------------------

export interface DbcProvenanceEntry {
  readonly module: 'Com' | 'CanIf' | 'PduR';
  readonly containerPath: string;
  readonly contentHash: string;
}

export interface DbcProvenanceSource {
  readonly sourceId: string;
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly targetNode: string;
  readonly profileId: string;
  readonly importedAt: string;
  readonly entries: readonly DbcProvenanceEntry[];
}

export interface DbcProvenanceManifest {
  readonly version: 1;
  readonly sources: readonly DbcProvenanceSource[];
}

export interface DbcProvenanceRead {
  /** containerPath → entry。同一 container 的 provenance owner 唯一（§9.2）。 */
  readonly entries: ReadonlyMap<string, DbcProvenanceEntry>;
  /** containerPath → 拥有该 container 的 sourceId。 */
  readonly ownerSourceIdByPath: ReadonlyMap<string, string>;
}

/**
 * DBC source 身份 id（spec §9.2）：sha256(JSON.stringify({sourceFile,
 * sourceHash, targetNode, profileId}))，字段序固定，同输入同 id。
 */
export function dbcManifestSourceId(input: {
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly targetNode: string;
  readonly profileId: string;
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function parseDbcProvenanceManifest(content: string): DbcProvenanceManifest | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const raw = parsed as { version?: unknown; sources?: unknown };
    if (raw.version !== 1 || !Array.isArray(raw.sources)) return null;
    const sources: DbcProvenanceSource[] = [];
    for (const rawSource of raw.sources) {
      if (typeof rawSource !== 'object' || rawSource === null) continue;
      const source = rawSource as Partial<DbcProvenanceSource>;
      if (
        typeof source.sourceId !== 'string' ||
        typeof source.sourceFile !== 'string' ||
        typeof source.sourceHash !== 'string' ||
        typeof source.targetNode !== 'string' ||
        typeof source.profileId !== 'string' ||
        typeof source.importedAt !== 'string' ||
        !Array.isArray(source.entries)
      ) {
        continue;
      }
      const entries: DbcProvenanceEntry[] = [];
      for (const rawEntry of source.entries) {
        if (typeof rawEntry !== 'object' || rawEntry === null) continue;
        const entry = rawEntry as Partial<DbcProvenanceEntry>;
        if (
          (entry.module !== 'Com' && entry.module !== 'CanIf' && entry.module !== 'PduR') ||
          typeof entry.containerPath !== 'string' ||
          typeof entry.contentHash !== 'string'
        ) {
          continue;
        }
        entries.push({
          module: entry.module,
          containerPath: entry.containerPath,
          contentHash: entry.contentHash,
        });
      }
      sources.push({
        sourceId: source.sourceId,
        sourceFile: source.sourceFile,
        sourceHash: source.sourceHash,
        targetNode: source.targetNode,
        profileId: source.profileId,
        importedAt: source.importedAt,
        entries,
      });
    }
    return { version: 1, sources };
  } catch {
    return null;
  }
}

/**
 * 读取 provenance manifest（容错，§9.2）：文件缺失按空处理；JSON malformed
 * 或 version 不符时忽略整个文件并报 `dbc-manifest-ignored`（warning，不阻断）。
 * Read-only：preview 绝不写该文件。
 */
export async function readDbcProvenanceManifest(
  manifestDir: string,
  warnings: DbmWarning[],
): Promise<DbcProvenanceRead> {
  const path = join(manifestDir, DBC_PROVENANCE_RELATIVE_PATH);
  let content: string;
  try {
    content = await fs.readFile(path, 'utf8');
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 'ENOENT') {
      warnings.push({
        code: 'dbc-manifest-ignored',
        elementRef: DBC_PROVENANCE_RELATIVE_PATH,
        message: `DBC import provenance manifest was ignored: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
    return { entries: new Map(), ownerSourceIdByPath: new Map() };
  }

  const manifest = parseDbcProvenanceManifest(content);
  if (manifest === null) {
    warnings.push({
      code: 'dbc-manifest-ignored',
      elementRef: DBC_PROVENANCE_RELATIVE_PATH,
      message: 'DBC import provenance manifest was ignored: malformed JSON or unsupported version',
    });
    return { entries: new Map(), ownerSourceIdByPath: new Map() };
  }

  const entries = new Map<string, DbcProvenanceEntry>();
  const ownerSourceIdByPath = new Map<string, string>();
  for (const source of manifest.sources) {
    for (const entry of source.entries) {
      if (entries.has(entry.containerPath)) continue; // 同一 container owner 唯一，首条胜出
      entries.set(entry.containerPath, entry);
      ownerSourceIdByPath.set(entry.containerPath, source.sourceId);
    }
  }
  return { entries, ownerSourceIdByPath };
}

// ---------------------------------------------------------------------------
// Target module discovery（§6.2）：ARXML collectModules，禁止 basename/regex。
// ---------------------------------------------------------------------------

/**
 * 递归遍历 ArxmlElement 子树，收集全部 module（本地实现，镜像 renderer
 * `importHelpers.collectModules`——main 进程不得跨边界依赖 renderer，见
 * `sws-validator` dependency-boundaries 回归测试）。
 */
function collectModules(el: ArxmlElement, visit: (m: ArxmlModule) => void): void {
  if (el.kind === 'module') {
    visit(el);
    return;
  }
  if (el.kind === 'container') {
    for (const c of el.children) collectModules(c, visit);
  }
}

/**
 * 递归收集文档中全部 ECUC module（element 子树遍历 + package 递归）。
 */
export function collectModulesFromPackages(doc: ArxmlDocument): ArxmlModule[] {
  const modules: ArxmlModule[] = [];
  function visitPackage(pkg: ArxmlPackage): void {
    for (const element of pkg.elements) {
      collectModules(element, (module) => modules.push(module));
    }
    for (const child of pkg.packages ?? []) visitPackage(child);
  }
  for (const pkg of doc.packages) visitPackage(pkg);
  return modules;
}

/** 存量 PduId 收集：现状值文件中 Com/CanIf 模块内的模块级 id 参数。 */
const ID_PARAM_NAMES = new Set(['ComHandleId', 'CanIfTxPduId', 'CanIfRxPduId']);

export function collectModuleIdParams(module: ArxmlModule): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const container of collectImportContainers(module).values()) {
    for (const [name, value] of Object.entries(container.params)) {
      if (!ID_PARAM_NAMES.has(name) || value.type !== 'integer') continue;
      if (Number.isFinite(value.value)) ids.add(value.value);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// 错误描述（与 ODX handler 同构）。
// ---------------------------------------------------------------------------

export function describeManifestError(error: {
  readonly kind: string;
  readonly field?: string;
  readonly path?: string;
  readonly reason?: string;
  readonly message?: string;
  readonly expected?: string;
  readonly found?: string;
}): string {
  switch (error.kind) {
    case 'json-parse':
      return `JSON parse error: ${error.message ?? ''}`;
    case 'invalid-shape':
      return `shape error: ${error.message ?? ''}`;
    case 'version-mismatch':
      return `schemaVersion mismatch (expected "${error.expected ?? ''}", got "${error.found ?? ''}")`;
    case 'invalid-path':
      return `${error.field ?? ''} contains invalid path "${error.path ?? ''}" (${error.reason ?? ''})`;
    case 'invalid-field':
      return `${error.field ?? ''}: ${error.message ?? ''}`;
    default:
      return 'Invalid project manifest';
  }
}

export function formatStructuredParseError(error: ParseError | BswmdError): string {
  if ('message' in error) {
    return error.kind === 'invalid-structure' ? `${error.path}: ${error.message}` : error.message;
  }
  return `unsupported-version: ${error.version}`;
}

// ---------------------------------------------------------------------------
// Shared pipeline steps。
// ---------------------------------------------------------------------------

export interface DbcProjectTarget {
  readonly docPath: string;
  readonly module: ArxmlModule;
}

export interface DbcProjectContext {
  readonly manifestDir: string;
  readonly manifestPath: string;
  readonly manifestJson: string;
  readonly manifest: ProjectManifest;
  /** 已收集的目标 module：shortName → { docPath, module }（歧义已判定）。 */
  readonly targetModules: ReadonlyMap<DbcImportModule, DbcProjectTarget>;
}

/** 读取项目（manifest + 全部 value ARXML）+ 目标模块发现（§6.2）。 */
export async function loadProjectContext(): Promise<DbcProjectContext> {
  const manifestPath = getOpenProjectManifestPath();
  if (manifestPath === null) {
    throw new Error('read-failed: No project is open');
  }

  const manifestDir = dirname(resolve(manifestPath));
  let manifestJson: string;
  try {
    manifestJson = await fs.readFile(manifestPath, 'utf8');
  } catch (error) {
    throw new Error(
      `read-failed: Unable to read project manifest: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const loadedManifest = loadManifest(manifestJson, manifestDir);
  if (!loadedManifest.ok) {
    throw new Error(
      `read-failed: Invalid manifest: ${describeManifestError(loadedManifest.error)}`,
    );
  }
  const manifest = loadedManifest.value;

  const occurrences = new Map<string, Array<{ docPath: string; module: ArxmlModule }>>();
  for (const relativePath of manifest.valueArxmlPaths) {
    const absolutePath = resolve(manifestDir, relativePath);
    const read = await readFileWithCap(absolutePath);
    if (!read.ok) {
      throw new Error(`read-failed: Unable to read value ARXML ${absolutePath}: ${read.message}`);
    }
    const parsed = parseArxml(read.content);
    if (!parsed.ok) {
      throw new Error(
        `read-failed: Failed to parse value ARXML ${absolutePath}: ${formatStructuredParseError(parsed.error)}`,
      );
    }
    for (const module of collectModulesFromPackages(parsed.value)) {
      const list = occurrences.get(module.shortName) ?? [];
      list.push({ docPath: absolutePath, module });
      occurrences.set(module.shortName, list);
    }
  }

  const targetModules = new Map<DbcImportModule, DbcProjectTarget>();
  for (const shortName of ['Com', 'CanIf', 'PduR'] as const) {
    const list = occurrences.get(shortName) ?? [];
    if (list.length === 0) continue;
    if (list.length > 1) {
      throw new Error(
        `dbc-module-ambiguous: Module ${shortName} occurs in ${list.length} value ARXML documents`,
      );
    }
    const occurrence = list[0]!;
    targetModules.set(shortName, { docPath: occurrence.docPath, module: occurrence.module });
  }

  return { manifestDir, manifestPath, manifestJson, manifest, targetModules };
}

/** 读取并 build DBM。DBC 解析失败抛 `dbc-malformed:` 前缀错误（透传，不加前缀）。 */
export async function loadDbm(dbcPath: string): Promise<Dbm> {
  const read = await readFileWithCap(dbcPath, DBC_MAX_BYTES);
  if (!read.ok) {
    if (read.kind === 'too-large') {
      throw new Error(`dbc-too-large: ${read.message}`);
    }
    throw new Error(`read-failed: ${read.message}`);
  }
  const document = createDbmDocument(dbcPath, read.content);
  return buildDbm(document);
}

/** 读取全部 BSWMD 并构建 DbcBswmdDefIndex（缺模块抛 `dbc-bswmd-not-loaded:`）。 */
export async function loadDbcBswmdIndex(
  manifestDir: string,
  bswmdPaths: readonly string[],
): Promise<DbcBswmdDefIndex> {
  const definitions = new Map<string, BswModuleDef>();
  for (const relativePath of bswmdPaths) {
    const absolutePath = resolve(manifestDir, relativePath);
    const read = await readFileWithCap(absolutePath, DEFAULT_FILE_CAP_BYTES);
    if (!read.ok) throw new Error(`read-failed: ${read.message}`);
    const parsed = parseBswmd(read.content);
    if (!parsed.ok) {
      throw new Error(
        `read-failed: BSWMD ${absolutePath} parse failed: ${formatStructuredParseError(parsed.error)}`,
      );
    }
    for (const moduleDefinition of parsed.value.modules) {
      definitions.set(moduleDefinition.shortName, moduleDefinition);
    }
  }
  return buildDbcBswmdDefIndex(definitions);
}

/** 解析内置 Profile + 应用 pduIdPolicy / upperLayerNaming override（不可变）。 */
export function resolveDbcProfileForRequest(
  profileId: string,
  pduIdPolicy?: Partial<PduIdPolicy>,
  upperLayerNaming?: Partial<UpperLayerNamingPolicy>,
): DbcImportProfile {
  const profile = resolveDbcProfile(profileId);
  return applyDbcPolicyOverrides(profile, pduIdPolicy, upperLayerNaming);
}

// ---------------------------------------------------------------------------
// Mapping pipeline（preview 与 commit 共用；同输入保证确定性，§2.1）。
// ---------------------------------------------------------------------------

export interface DbcMappingInput {
  readonly dbm: Dbm;
  readonly targetNode: string;
  readonly profile: DbcImportProfile;
  readonly targetModules: ReadonlyMap<DbcImportModule, DbcProjectTarget>;
}

export function runDbcMapping(input: DbcMappingInput, index: DbcBswmdDefIndex): MapDbmToEcucResult {
  const currentIds = new Map<'Com' | 'CanIf', ReadonlySet<number>>();
  for (const shortName of ['Com', 'CanIf'] as const) {
    const target = input.targetModules.get(shortName);
    currentIds.set(
      shortName,
      target === undefined ? new Set<number>() : collectModuleIdParams(target.module),
    );
  }
  return mapDbmToEcuc({
    dbm: input.dbm,
    targetNode: input.targetNode,
    index,
    profile: input.profile,
    currentIds,
  });
}

export interface DbcLoadedPipeline {
  readonly project: DbcProjectContext;
  readonly dbm: Dbm;
  readonly index: DbcBswmdDefIndex;
  readonly profile: DbcImportProfile;
}

/**
 * 完整加载 pipeline（Task 10 preview 与 Task 11 commit 共用）：项目 →
 * DBC → DBM → BSWMD index → Profile。任何失败抛 `xxx:` 前缀错误，由 handler
 * 映射为 closed `DbcImportError`。绝不写文件。
 */
export async function loadDbcFullImportPipeline(
  request: DbcFullImportPreviewRequest,
): Promise<DbcLoadedPipeline> {
  const project = await loadProjectContext();
  const dbm = await loadDbm(request.dbcPath);
  const index = await loadDbcBswmdIndex(project.manifestDir, project.manifest.bswmdPaths);
  const profile = resolveDbcProfileForRequest(
    request.profileId,
    request.pduIdPolicy,
    request.upperLayerNaming,
  );
  return { project, dbm, index, profile };
}

/**
 * Task 11 commit 入口：重算与 preview 完全一致的 mapped modules
 * （`computeOdxImportMappedModules` 同模式）。失败时抛前缀错误。
 */
export async function computeDbcFullImportMappedModules(
  request: DbcFullImportPreviewRequest,
): Promise<ReadonlyMap<DbcImportModule, ArxmlModule>> {
  const pipeline = await loadDbcFullImportPipeline(request);
  const targetNode = request.targetNode;
  if (targetNode === undefined) {
    throw new Error('dbc-target-node-invalid: targetNode is required for mapping');
  }
  if (!pipeline.dbm.nodes.some((node) => node.name === targetNode)) {
    throw new Error(`dbc-target-node-invalid: ${targetNode} is not a DBC node`);
  }
  const mapped = runDbcMapping(
    {
      dbm: pipeline.dbm,
      targetNode,
      profile: pipeline.profile,
      targetModules: pipeline.project.targetModules,
    },
    pipeline.index,
  );
  return mapped.modules;
}
