// odxImportCommitHandler — ODX full-import commit orchestration.
//
// The handler never trusts container content from the renderer. It recomputes
// the preview, verifies the hash, applies only path decisions, then writes
// module documents + project manifest + provenance state with rollback of
// every file it touched.

import { promises as fs, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { loadManifest } from '../../core/project/manifest.js';
import type { ProjectManifest } from '../../shared/project.js';
import { parseArxml } from '../../core/arxml/parser.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ArxmlPackage,
} from '../../core/arxml/types.js';
import { applyPatchesToDocument } from '../../core/import/patch.js';
import type { ImportPatchOp } from '../../core/import/types.js';
import { hashContainerForProvenance, mergeModuleThreeWay } from '../../core/odx/threeWayMerge.js';

import { writeAtomic } from '../io/writeAtomic.js';
import { isPathInsideReal } from '../../shared/paths/isPathInsideReal.js';
import { getOpenProjectManifestPath } from './project-manifest-state.js';
import { readFileWithCap } from './sizeCap.js';
import {
  computeOdxImportMappedModules,
  computeOdxImportPreview,
  formatStructuredParseError,
} from './odxImportPreviewHandler.js';

import type {
  OdxImportCommitRequest,
  OdxImportCommitResponse,
  OdxImportDecision,
  OdxImportModule,
  OdxImportRow,
} from '../../shared/types/odx-import.js';

const PROVENANCE_PATH = join('.autosarcfg', 'odx-import-manifest.json');

interface PendingWrite {
  readonly path: string;
  readonly content: string;
  readonly existed: boolean;
  readonly oldContent?: string | undefined;
}

interface CurrentTarget {
  readonly docPath: string;
  readonly doc: ArxmlDocument;
  readonly module: ArxmlModule;
}

function describeManifestError(error: unknown): string {
  const details = error as {
    kind?: string;
    field?: string;
    path?: string;
    reason?: string;
    message?: string;
    expected?: string;
    found?: string;
  };
  switch (details?.kind) {
    case 'json-parse':
      return `JSON parse error: ${details.message ?? ''}`;
    case 'invalid-shape':
      return `shape error: ${details.message ?? ''}`;
    case 'version-mismatch':
      return `schemaVersion mismatch (expected "${details.expected ?? ''}", got "${details.found ?? ''}")`;
    case 'invalid-path':
      return `${details.field ?? ''} contains invalid path "${details.path ?? ''}" (${details.reason ?? ''})`;
    case 'invalid-field':
      return `${details.field ?? ''}: ${details.message ?? ''}`;
    default:
      return 'Invalid project manifest';
  }
}

function collectModules(packages: readonly ArxmlPackage[]): ArxmlModule[] {
  return packages.flatMap((pkg) => [
    ...pkg.elements.filter((element): element is ArxmlModule => element.kind === 'module'),
    ...collectModules(pkg.packages ?? []),
  ]);
}

function findContainerByPath(module: ArxmlModule, path: string): ArxmlContainer | undefined {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== module.shortName) return undefined;

  let current: ArxmlContainer | undefined;
  let children = module.children;
  for (const segment of segments.slice(1)) {
    const found = children.find(
      (child) => child.kind === 'container' && child.shortName === segment,
    );
    if (!found || found.kind !== 'container') return undefined;
    current = found;
    children = found.children;
  }
  return current;
}

function manifestRelative(manifestDir: string, absolutePath: string): string {
  return relative(manifestDir, absolutePath).replace(/\\/g, '/');
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

async function uniqueNewModulePath(
  manifestDir: string,
  moduleShortName: OdxImportModule,
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

function rowsForModule(
  rows: readonly OdxImportRow[],
  module: OdxImportModule,
): readonly OdxImportRow[] {
  return rows.filter((row) => row.module === module);
}

function provenanceEntries(
  mergedModule: ArxmlModule,
  rows: readonly OdxImportRow[],
): Array<{ module: OdxImportModule; containerPath: string; contentHash: string }> {
  return rows.flatMap((row) => {
    const container = findContainerByPath(mergedModule, row.path);
    return container
      ? [
          {
            module: mergedModule.shortName as OdxImportModule,
            containerPath: row.path,
            contentHash: hashContainerForProvenance(container),
          },
        ]
      : [];
  });
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

export async function odxImportCommitHandler(
  request: OdxImportCommitRequest,
): Promise<OdxImportCommitResponse> {
  const manifestPath = getOpenProjectManifestPath();
  if (manifestPath === null) {
    return { ok: false, error: { kind: 'read-failed', message: 'No project is open' } };
  }

  try {
    const manifestDir = dirname(resolve(manifestPath));
    const previewResult = await computeOdxImportPreview({
      odxPath: request.odxPath,
      dirtyDocPaths: request.dirtyDocPaths,
      variantId: request.variantId,
    });
    if (!previewResult.ok) return previewResult;
    const preview = previewResult.value;

    if (request.previewHash !== preview.previewHash) {
      return {
        ok: false,
        error: {
          kind: 'odx-commit-mismatch',
          message: 'Preview hash mismatch: the ODX file, project, or selection changed',
        },
      };
    }

    const requestedDecisions = new Map(request.decisions.map((item) => [item.path, item.decision]));
    const knownPaths = new Set(preview.rows.map((row) => row.path));
    for (const path of requestedDecisions.keys()) {
      if (!knownPaths.has(path)) {
        return {
          ok: false,
          error: {
            kind: 'odx-commit-mismatch',
            message: `Preview hash mismatch: unknown decision path ${path}`,
          },
        };
      }
    }

    const decisions = new Map<string, OdxImportDecision>();
    for (const row of preview.rows) {
      decisions.set(row.path, requestedDecisions.get(row.path) ?? row.defaultDecision);
    }

    const manifestJson = await fs.readFile(manifestPath, 'utf8');
    const loadedManifest = loadManifest(manifestJson, manifestDir);
    if (!loadedManifest.ok) {
      return {
        ok: false,
        error: {
          kind: 'read-failed',
          message: `Invalid manifest: ${describeManifestError(loadedManifest.error)}`,
        },
      };
    }
    const manifest = loadedManifest.value;

    const currentTargets = new Map<OdxImportModule, CurrentTarget>();
    for (const relativePath of manifest.valueArxmlPaths) {
      const absolutePath = resolve(manifestDir, relativePath);
      const read = await readFileWithCap(absolutePath);
      if (!read.ok) return { ok: false, error: { kind: 'read-failed', message: read.message } };
      const parsed = parseArxml(read.content);
      if (!parsed.ok) {
        return {
          ok: false,
          error: {
            kind: 'read-failed',
            message: `Failed to parse ${absolutePath}: ${formatStructuredParseError(parsed.error)}`,
          },
        };
      }
      for (const module of collectModules(parsed.value.packages)) {
        if (module.shortName === 'Dcm' || module.shortName === 'Dem') {
          currentTargets.set(module.shortName, {
            docPath: absolutePath,
            doc: parsed.value,
            module,
          });
        }
      }
    }

    const incomingModules = await computeOdxImportMappedModules({
      odxPath: request.odxPath,
      dirtyDocPaths: request.dirtyDocPaths,
      variantId: request.variantId,
    });

    const patchesByDocPath = new Map<string, ImportPatchOp[]>();
    const newManifestPaths: string[] = [];
    const newDocuments: Array<{
      path: string;
      doc: ArxmlDocument;
      module: OdxImportModule;
      rows: readonly OdxImportRow[];
    }> = [];
    const mergedRows: Array<{ module: ArxmlModule; rows: readonly OdxImportRow[] }> = [];

    for (const moduleShortName of ['Dcm', 'Dem'] as const) {
      const incomingModule = incomingModules.get(moduleShortName);
      if (!incomingModule) {
        return {
          ok: false,
          error: {
            kind: 'odx-bswmd-not-loaded',
            module: moduleShortName,
            message: `Incoming ${moduleShortName} module is unavailable`,
          },
        };
      }

      const rows = rowsForModule(preview.rows, moduleShortName);
      const currentTarget = currentTargets.get(moduleShortName);
      const mergedModule = mergeModuleThreeWay({
        existing: currentTarget?.module ?? null,
        incoming: incomingModule,
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
        newDocuments.push({
          path: targetPath,
          doc: moduleDocument(mergedModule, targetPath),
          module: moduleShortName,
          rows,
        });
      }
    }

    const pendingWrites: PendingWrite[] = [];
    try {
      for (const [docPath, ops] of patchesByDocPath) {
        const targetDoc = [...currentTargets.values()].find(
          (target) => target.docPath === docPath,
        )?.doc;
        if (!targetDoc) {
          throw new Error(`Missing current document snapshot: ${docPath}`);
        }
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

      let nextManifest: ProjectManifest = manifest;
      if (newManifestPaths.length > 0) {
        nextManifest = {
          ...manifest,
          valueArxmlPaths: [
            ...manifest.valueArxmlPaths,
            ...newManifestPaths.map((path) => manifestRelative(manifestDir, path)),
          ],
        };
      }
      const manifestContent = `${JSON.stringify(nextManifest, null, 2)}\n`;
      pendingWrites.push({
        path: manifestPath,
        content: manifestContent,
        existed: true,
        oldContent: manifestJson,
      });
      await writeAtomic(manifestPath, manifestContent);

      const odxRead = await readFileWithCap(request.odxPath);
      if (!odxRead.ok) throw new Error(odxRead.message);
      const sourceHash = createHash('sha256').update(odxRead.content).digest('hex');
      const provenance = {
        version: 1,
        sourceFile: basename(request.odxPath),
        sourceHash: `sha256:${sourceHash}`,
        variant: {
          kind: preview.selectedVariant?.kind ?? 'BASE-VARIANT',
          odxId: preview.selectedVariant?.odxId ?? request.variantId,
          shortName: preview.selectedVariant?.odxId ?? request.variantId,
        },
        importedAt: new Date().toISOString(),
        entries: mergedRows.flatMap(({ module, rows }) => provenanceEntries(module, rows)),
      };
      const provenancePath = join(manifestDir, PROVENANCE_PATH);
      pendingWrites.push({
        path: provenancePath,
        content: `${JSON.stringify(provenance, null, 2)}\n`,
        existed: fileExists(provenancePath),
        oldContent: fileExists(provenancePath)
          ? await fs.readFile(provenancePath, 'utf8')
          : undefined,
      });
      await writeAtomic(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

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
      error: {
        kind: 'odx-malformed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
