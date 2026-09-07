// dbcFullImportCommitHandler — DBC full-import commit orchestration.
//
// Transactional, server-side commit: it never trusts container content or
// decision rows from the renderer. It re-runs the deterministic preview,
// verifies `request.previewHash`, applies only path decisions, merges the
// incoming Com / CanIf / PduR modules three-way against the provenance base,
// then writes existing/new ECUC documents → project manifest (only when new
// modules are registered) → DBC provenance, with a pending-write snapshot and
// reverse-order rollback on any failure (spec §9.1 / §9.2).
//
// Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
// §9 (merge / provenance) + §12 (closed error set).

import { promises as fs, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { parseArxml } from '../../core/arxml/parser.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import type { ArxmlDocument, ArxmlModule, ArxmlPackage } from '../../core/arxml/types.js';
import type { DbcImportModule } from '../../core/dbc/bswmdDefIndex.js';
import type { DbmWarning } from '../../core/dbc/dbm.js';
import { applyPatchesToDocument } from '../../core/import/patch.js';
import {
  collectImportContainers,
  hashContainerForProvenance,
  mergeModuleThreeWay,
} from '../../core/import/threeWayMerge.js';
import type { ImportPatchOp } from '../../core/import/types.js';
import { isPathInsideReal } from '../../shared/paths/isPathInsideReal.js';
import type { ProjectManifest } from '../../shared/project.js';
import type {
  DbcFullImportCommitRequest,
  DbcFullImportCommitResponse,
  DbcImportDecision,
  DbcImportError,
  DbcImportRow,
} from '../../shared/types/dbc-import.js';
import { writeAtomic } from '../io/writeAtomic.js';

import { computeDbcFullImportPreview } from './dbcFullImportPreviewHandler.js';
import {
  computeDbcFullImportMappedModules,
  DBC_PROVENANCE_RELATIVE_PATH,
  dbcManifestSourceId,
  formatStructuredParseError,
  loadDbcFullImportPipeline,
  readDbcProvenanceManifest,
} from './dbcFullImportRuntime.js';
import type {
  DbcProvenanceEntry,
  DbcProvenanceManifest,
  DbcProvenanceSource,
} from './dbcFullImportRuntime.js';
import { getOpenProjectManifestPath } from './project-manifest-state.js';
import { readFileWithCap } from './sizeCap.js';

interface PendingWrite {
  readonly path: string;
  readonly content: string;
  readonly existed: boolean;
  readonly oldContent?: string | undefined;
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function manifestRelative(manifestDir: string, absolutePath: string): string {
  return relative(manifestDir, absolutePath).replace(/\\/g, '/');
}

async function uniqueNewModulePath(
  manifestDir: string,
  moduleShortName: DbcImportModule,
): Promise<string> {
  const base = join(manifestDir, 'ecuc', `${moduleShortName}_EcucValues.arxml`);
  if (!fileExists(base)) return base;
  for (let index = 1; ; index += 1) {
    const candidate = join(manifestDir, 'ecuc', `${moduleShortName}_${index}_EcucValues.arxml`);
    if (!fileExists(candidate)) return candidate;
  }
}

function moduleDocument(module: ArxmlModule, path: string): ArxmlDocument {
  const pkg: ArxmlPackage = {
    shortName: 'P',
    path: '/P',
    elements: [module],
  };
  return { path, version: '4.4', packages: [pkg] };
}

async function rollbackWrites(writes: readonly PendingWrite[]): Promise<void> {
  for (const write of [...writes].reverse()) {
    if (write.existed && write.oldContent !== undefined) {
      await writeAtomic(write.path, write.oldContent);
    } else if (!write.existed) {
      await fs.unlink(write.path).catch(() => undefined);
    }
  }
}

/** commit 侧可能透传的 preview 错误 kinds（write-failed / dbc-commit-mismatch 属本 handler）。 */
type CommitErrorKind = Exclude<DbcImportError['kind'], 'write-failed' | 'dbc-commit-mismatch'>;

function errorFromUnknown(error: unknown, fallback: string): DbcImportError {
  const message = error instanceof Error ? error.message : String(error);
  const kinds: readonly CommitErrorKind[] = [
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

/** 读取 DBC provenance 源数组（容错，§9.2）：缺失/损坏/旧版本 → 空数组，写时整体替换。 */
async function readRawDbcProvenanceSources(
  manifestDir: string,
): Promise<readonly DbcProvenanceSource[]> {
  const path = join(manifestDir, DBC_PROVENANCE_RELATIVE_PATH);
  let content: string;
  try {
    content = await fs.readFile(path, 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const raw = parsed as { version?: unknown; sources?: unknown };
    if (raw.version !== 1 || !Array.isArray(raw.sources)) return [];
    return raw.sources as readonly DbcProvenanceSource[];
  } catch {
    return [];
  }
}

export async function dbcFullImportCommitHandler(
  request: DbcFullImportCommitRequest,
): Promise<DbcFullImportCommitResponse> {
  const openManifestPath = getOpenProjectManifestPath();
  if (openManifestPath === null) {
    return { ok: false, error: { kind: 'read-failed', message: 'No project is open' } };
  }

  const targetNode = request.targetNode;
  if (targetNode === undefined) {
    return {
      ok: false,
      error: { kind: 'dbc-target-node-invalid', message: 'targetNode is required for commit' },
    };
  }

  try {
    // 1. Re-run the preview server-side; never trust renderer rows.
    const previewResult = await computeDbcFullImportPreview(request);
    if (!previewResult.ok) return previewResult;
    const preview = previewResult.value;

    // 2. Verify the preview hash.
    if (request.previewHash !== preview.previewHash) {
      return {
        ok: false,
        error: {
          kind: 'dbc-commit-mismatch',
          message: 'Preview hash mismatch: the DBC file, project, or selection changed',
        },
      };
    }

    // 3. Reject unknown decision paths and validate decision module matches the row.
    const requestedByPath = new Map(request.decisions.map((item) => [item.path, item]));
    const rowByPath = new Map(preview.rows.map((row) => [row.path, row]));
    for (const decision of request.decisions) {
      const row = rowByPath.get(decision.path);
      if (row === undefined) {
        return {
          ok: false,
          error: {
            kind: 'dbc-commit-mismatch',
            message: `Preview hash mismatch: unknown decision path ${decision.path}`,
          },
        };
      }
      if (row.module !== decision.module) {
        return {
          ok: false,
          error: {
            kind: 'dbc-commit-mismatch',
            message: `Preview hash mismatch: decision module mismatch for ${decision.path}`,
          },
        };
      }
    }

    // 4. Build a decision map keyed by row path (defaults from the preview rows).
    const decisions = new Map<string, DbcImportDecision>();
    for (const row of preview.rows) {
      decisions.set(row.path, requestedByPath.get(row.path)?.decision ?? row.defaultDecision);
    }

    // 5. Load project context + DBM + provenance.
    const pipeline = await loadDbcFullImportPipeline(request);
    const { manifestDir, manifestPath, manifestJson, manifest, targetModules } = pipeline.project;
    const dbm = pipeline.dbm;

    const warnings: DbmWarning[] = [];
    const provenance = await readDbcProvenanceManifest(manifestDir, warnings);
    const existingSources = await readRawDbcProvenanceSources(manifestDir);

    // 6. Parse the current documents that contain target modules (for patching).
    const currentDocuments = new Map<string, ArxmlDocument>();
    for (const target of targetModules.values()) {
      if (currentDocuments.has(target.docPath)) continue;
      const read = await readFileWithCap(target.docPath);
      if (!read.ok) throw new Error(`read-failed: ${read.message}`);
      const parsed = parseArxml(read.content);
      if (!parsed.ok) {
        throw new Error(
          `read-failed: Failed to parse ${target.docPath}: ${formatStructuredParseError(parsed.error)}`,
        );
      }
      currentDocuments.set(target.docPath, parsed.value);
    }

    // 7. Re-run the mapping pipeline for the incoming modules.
    const incomingModules = await computeDbcFullImportMappedModules(request);

    const patchesByDocPath = new Map<string, ImportPatchOp[]>();
    const newManifestPaths: string[] = [];
    const newDocuments: Array<{ path: string; doc: ArxmlDocument }> = [];
    const mergedRows: Array<{ module: ArxmlModule; rows: readonly DbcImportRow[] }> = [];

    for (const moduleShortName of ['Com', 'CanIf', 'PduR'] as const) {
      const incomingModule = incomingModules.get(moduleShortName);
      if (incomingModule === undefined) {
        return {
          ok: false,
          error: {
            kind: 'dbc-bswmd-not-loaded',
            message: `Incoming ${moduleShortName} module is unavailable`,
          },
        };
      }

      const rows = preview.rows.filter((row) => row.module === moduleShortName);
      const currentTarget = targetModules.get(moduleShortName);

      const baseContainers = new Map(
        [...provenance.entries].filter(([, entry]) => entry.module === moduleShortName),
      );
      const currentContainers = currentTarget
        ? new Map(
            [...collectImportContainers(currentTarget.module)].map(([path, container]) => [
              path,
              hashContainerForProvenance(container),
            ]),
          )
        : new Map<string, string>();
      const incomingContainers = new Map(
        [...collectImportContainers(incomingModule)].map(([path, container]) => [
          path,
          hashContainerForProvenance(container),
        ]),
      );

      const mergedModule = mergeModuleThreeWay({
        existing: currentTarget?.module ?? null,
        incoming: incomingModule,
        baseContainers,
        currentContainers,
        incomingContainers,
        removedCategoryLabel: 'removed-in-dbc',
        decisions,
      });
      mergedRows.push({ module: mergedModule, rows });

      if (currentTarget) {
        const ops = patchesByDocPath.get(currentTarget.docPath) ?? [];
        ops.push({
          kind: 'overwrite-module',
          moduleShortName,
          replacement: mergedModule,
        });
        patchesByDocPath.set(currentTarget.docPath, ops);
      } else {
        const targetPath = await uniqueNewModulePath(manifestDir, moduleShortName);
        if (!(await isPathInsideReal(targetPath, manifestDir))) {
          return {
            ok: false,
            error: {
              kind: 'write-failed',
              message: `Resolved target escapes project directory: ${targetPath}`,
              rolledBack: false,
            },
          };
        }
        newManifestPaths.push(targetPath);
        newDocuments.push({ path: targetPath, doc: moduleDocument(mergedModule, targetPath) });
      }
    }

    // 8. Compute the DBC source identity exactly as the preview did (spec §9.2).
    const currentSourceId = dbcManifestSourceId({
      sourceFile: basename(request.dbcPath),
      sourceHash: dbm.meta.sourceHash,
      targetNode,
      profileId: request.profileId,
    });

    // 9. Replace this source's entries with committed containers owned by this
    // source (post-merge contentHash); keep other sources untouched.
    // ODX parity (odxImportCommitHandler.provenanceEntries): record an entry
    // for EVERY row whose container survives the merge — no decision filter —
    // so keep-local / locally-modified / removed-in-dbc-kept / conflict-kept
    // containers keep their provenance baseline (otherwise the next import
    // classifies them as `added` with defaultDecision `import` and silently
    // overwrites the user's decision). Containers dropped by the merge
    // (explicit `delete`, dropped keep-local additions, removed-in-dbc rows
    // with nothing left locally) are absent from the merged module and get no
    // entry, exactly like ODX. Per spec §9.2 a container whose provenance
    // owner is another DBC source is never claimed by this source.
    const committedEntries: DbcProvenanceEntry[] = [];
    for (const { module, rows } of mergedRows) {
      const mergedContainers = collectImportContainers(module);
      for (const row of rows) {
        const owner = provenance.ownerSourceIdByPath.get(row.path);
        if (owner !== undefined && owner !== currentSourceId) continue;
        const container = mergedContainers.get(row.path);
        if (container === undefined) continue;
        committedEntries.push({
          module: module.shortName as DbcImportModule,
          containerPath: row.path,
          contentHash: hashContainerForProvenance(container),
        });
      }
    }

    const existingSourceIndex = existingSources.findIndex(
      (source) => source.sourceId === currentSourceId,
    );
    const updatedSource: DbcProvenanceSource = {
      sourceId: currentSourceId,
      sourceFile: basename(request.dbcPath),
      sourceHash: dbm.meta.sourceHash,
      targetNode,
      profileId: request.profileId,
      importedAt: new Date().toISOString(),
      entries: committedEntries,
    };
    const nextSources =
      existingSourceIndex >= 0
        ? existingSources.map((source, index) =>
            index === existingSourceIndex ? updatedSource : source,
          )
        : [...existingSources, updatedSource];
    const nextProvenance: DbcProvenanceManifest = { version: 1, sources: nextSources };
    const provenancePath = join(manifestDir, DBC_PROVENANCE_RELATIVE_PATH);

    // 10. Write in order: ECUC files → project manifest (only if changed) → DBC
    // provenance, with pending-write snapshot and reverse-order rollback.
    const pendingWrites: PendingWrite[] = [];
    try {
      for (const [docPath, ops] of patchesByDocPath) {
        const targetDoc = currentDocuments.get(docPath);
        if (!targetDoc) throw new Error(`Missing current document snapshot: ${docPath}`);
        const nextDoc = applyPatchesToDocument(targetDoc, ops);
        const serialized = serializeArxml(nextDoc);
        if (!serialized.ok) throw new Error(serialized.error.message);
        const existed = fileExists(docPath);
        const oldContent = existed ? await fs.readFile(docPath, 'utf8') : undefined;
        pendingWrites.push({ path: docPath, content: serialized.value, existed, oldContent });
        await writeAtomic(docPath, serialized.value);
      }

      for (const newDocument of newDocuments) {
        const serialized = serializeArxml(newDocument.doc);
        if (!serialized.ok) throw new Error(serialized.error.message);
        const existed = fileExists(newDocument.path);
        const oldContent = existed ? await fs.readFile(newDocument.path, 'utf8') : undefined;
        pendingWrites.push({
          path: newDocument.path,
          content: serialized.value,
          existed,
          oldContent,
        });
        await writeAtomic(newDocument.path, serialized.value);
      }

      if (newManifestPaths.length > 0) {
        const nextManifest: ProjectManifest = {
          ...manifest,
          valueArxmlPaths: [
            ...manifest.valueArxmlPaths,
            ...newManifestPaths.map((path) => manifestRelative(manifestDir, path)),
          ],
        };
        const manifestContent = `${JSON.stringify(nextManifest, null, 2)}\n`;
        pendingWrites.push({
          path: manifestPath,
          content: manifestContent,
          existed: true,
          oldContent: manifestJson,
        });
        await writeAtomic(manifestPath, manifestContent);
      }

      const provenanceContent = `${JSON.stringify(nextProvenance, null, 2)}\n`;
      pendingWrites.push({
        path: provenancePath,
        content: provenanceContent,
        existed: fileExists(provenancePath),
        oldContent: fileExists(provenancePath)
          ? await fs.readFile(provenancePath, 'utf8')
          : undefined,
      });
      await writeAtomic(provenancePath, provenanceContent);

      const counts = { applied: 0, kept: 0, deleted: 0 };
      for (const decision of request.decisions) {
        if (decision.decision === 'import') counts.applied += 1;
        else if (decision.decision === 'keep-local') counts.kept += 1;
        else counts.deleted += 1;
      }

      return {
        ok: true,
        value: { ...counts, manifestPath: provenancePath },
      };
    } catch (error) {
      let rollbackOk = true;
      try {
        await rollbackWrites(pendingWrites);
      } catch {
        rollbackOk = false;
      }
      return {
        ok: false,
        error: {
          kind: 'write-failed',
          message: error instanceof Error ? error.message : String(error),
          rolledBack: rollbackOk,
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: errorFromUnknown(error, 'DBC commit failed'),
    };
  }
}
