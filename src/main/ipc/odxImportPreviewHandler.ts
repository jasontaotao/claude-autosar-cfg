// odxImportPreviewHandler — read-only orchestration for ODX full import.
//
// Preview deliberately does not mutate the workspace. It reads the open
// project manifest, existing value ARXMLs, BSWMDs and optional provenance
// state, then classifies the deterministic incoming Dcm/Dem modules using
// the pure three-way merge model. Commit-only decisions are handled by a
// separate IPC channel.

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

import { loadManifest } from '../../core/project/manifest.js';
import type { ProjectManifest } from '../../shared/project.js';
import { parseBswmd } from '../../core/project/bswmd.js';
import type { BswmdError, BswModuleDef } from '../../core/project/bswmd.js';
import { parseArxml } from '../../core/arxml/parser.js';
import type { ParseError } from '../../core/arxml/parser.js';
import type { ArxmlModule, ArxmlPackage } from '../../core/arxml/types.js';
import { buildDim } from '../../core/odx/dimBuilder.js';
import type { DimWarning } from '../../core/odx/dim.js';
import { buildBswmdDefIndex } from '../../core/odx/bswmdDefIndex.js';
import { mapDimToEcuc } from '../../core/odx/mapDimToEcuc.js';
import {
  classifyImportRows,
  collectImportContainers,
  hashContainerForProvenance,
  type ImportManifestEntry,
} from '../../core/odx/threeWayMerge.js';
import { parseOdxDocument } from '../../core/odx/odxDocument.js';

import type {
  OdxImportError,
  OdxImportPreview,
  OdxImportPreviewRequest,
  OdxImportPreviewResponse,
  OdxImportRow,
  OdxTargetModuleInfo,
} from '../../shared/types/odx-import.js';

import { DEFAULT_FILE_CAP_BYTES, readFileWithCap } from './sizeCap.js';
import { getOpenProjectManifestPath } from './project-manifest-state.js';

const PROVENANCE_RELATIVE_PATH = join('.autosarcfg', 'odx-import-manifest.json');

function formatStructuredParseError(error: ParseError | BswmdError): string {
  if ('message' in error) {
    return error.kind === 'invalid-structure' ? `${error.path}: ${error.message}` : error.message;
  }
  return `unsupported-version: ${error.version}`;
}

function describeManifestError(error: {
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

function collectModules(packages: readonly ArxmlPackage[]): ArxmlModule[] {
  return packages.flatMap((pkg) => [
    ...pkg.elements.filter((element): element is ArxmlModule => element.kind === 'module'),
    ...collectModules(pkg.packages ?? []),
  ]);
}

function resolveContainedPath(manifestDir: string, relativePath: string): string {
  return resolve(manifestDir, relativePath);
}

function previewHash(
  rows: readonly OdxImportRow[],
  stats: OdxImportPreview['stats'],
  targetModules: OdxImportPreview['targetModules'],
): string {
  return createHash('sha256').update(JSON.stringify({ rows, stats, targetModules })).digest('hex');
}

function parseProvenanceManifest(
  content: string,
  warnings: DimWarning[],
): ReadonlyMap<string, ImportManifestEntry> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1 ||
      !Array.isArray((parsed as { entries?: unknown }).entries)
    ) {
      throw new Error('version or entries is invalid');
    }

    const result = new Map<string, ImportManifestEntry>();
    for (const rawEntry of (parsed as { entries: unknown[] }).entries) {
      if (typeof rawEntry !== 'object' || rawEntry === null) continue;
      const entry = rawEntry as Partial<ImportManifestEntry>;
      if (
        (entry.module !== 'Dcm' && entry.module !== 'Dem') ||
        typeof entry.containerPath !== 'string' ||
        typeof entry.contentHash !== 'string'
      ) {
        continue;
      }
      result.set(entry.containerPath, {
        module: entry.module,
        containerPath: entry.containerPath,
        ...(entry.odxId === undefined ? {} : { odxId: entry.odxId }),
        contentHash: entry.contentHash,
      });
    }
    return result;
  } catch (error) {
    warnings.push({
      code: 'odx-manifest-ignored',
      elementRef: PROVENANCE_RELATIVE_PATH,
      message: `ODX import provenance manifest was ignored: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return new Map();
  }
}

async function readProvenanceManifest(
  manifestDir: string,
  warnings: DimWarning[],
): Promise<ReadonlyMap<string, ImportManifestEntry>> {
  const path = join(manifestDir, PROVENANCE_RELATIVE_PATH);
  try {
    const content = await fs.readFile(path, 'utf8');
    return parseProvenanceManifest(content, warnings);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 'ENOENT') {
      warnings.push({
        code: 'odx-manifest-ignored',
        elementRef: PROVENANCE_RELATIVE_PATH,
        message: `ODX import provenance manifest was ignored: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
    return new Map();
  }
}

async function loadBswmdDefinitions(
  manifest: ProjectManifest,
  manifestDir: string,
): Promise<ReadonlyMap<string, BswModuleDef>> {
  const definitions = new Map<string, BswModuleDef>();
  for (const relativePath of manifest.bswmdPaths) {
    const absolutePath = resolveContainedPath(manifestDir, relativePath);
    const read = await readFileWithCap(absolutePath);
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
  return definitions;
}

function didIdentifierCount(dim: ReturnType<typeof buildDim>): number {
  return new Set(
    dim.services
      .filter(
        (service) =>
          service.serviceClass === 'ReadDataByIdentifier' ||
          service.serviceClass === 'WriteDataByIdentifier',
      )
      .flatMap((service) => {
        const value = service.request.find((param) => param.semantic === 'ID')?.codedValue;
        if (value === undefined) return [];
        return [/^0[xX]/.test(value) ? Number.parseInt(value, 16) : Number.parseInt(value, 10)];
      })
      .filter(
        (identifier) => Number.isFinite(identifier) && identifier >= 0 && identifier <= 0xffff,
      ),
  ).size;
}

function errorFromUnknown(error: unknown, fallback: string): OdxImportError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('odx-variant-not-found:')) {
    return { kind: 'odx-variant-not-found', message };
  }
  if (message.startsWith('odx-inheritance-cycle:')) {
    return { kind: 'odx-inheritance-cycle', message };
  }
  if (message.startsWith('read-failed:')) {
    return { kind: 'read-failed', message: message.slice('read-failed:'.length).trim() };
  }
  if (message.startsWith('odx-malformed:')) {
    return { kind: 'odx-malformed', message: message.slice('odx-malformed:'.length).trim() };
  }
  return { kind: 'odx-malformed', message: fallback || message };
}

function emptyStats(): OdxImportPreview['stats'] {
  return {
    services: 0,
    dids: 0,
    dtcs: 0,
    sessions: 0,
    securityLevels: 0,
  };
}

export async function odxImportPreviewHandler(
  request: OdxImportPreviewRequest,
): Promise<OdxImportPreviewResponse> {
  const manifestPath = getOpenProjectManifestPath();
  if (manifestPath === null) {
    return { ok: false, error: { kind: 'read-failed', message: 'No project is open' } };
  }

  try {
    const manifestDir = dirname(resolve(manifestPath));
    const manifestRead = await fs.readFile(manifestPath, 'utf8');
    const loadedManifest = loadManifest(manifestRead, manifestDir);
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

    // Discover target modules before parsing ODX. This gives the wizard
    // target/save-first information even in the multi-variant selection step.
    const dirtyPaths = new Set(request.dirtyDocPaths.map((path) => resolve(path)));
    const moduleOccurrences = new Map<
      'Dcm' | 'Dem',
      Array<{ docPath: string; module: ArxmlModule }>
    >();
    for (const relativePath of manifest.valueArxmlPaths) {
      const absolutePath = resolveContainedPath(manifestDir, relativePath);
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
        if (module.shortName !== 'Dcm' && module.shortName !== 'Dem') continue;
        const moduleShortName = module.shortName as 'Dcm' | 'Dem';
        const occurrences = moduleOccurrences.get(moduleShortName) ?? [];
        occurrences.push({ docPath: absolutePath, module });
        moduleOccurrences.set(moduleShortName, occurrences);
      }
    }

    const targetModules: Record<'dcm' | 'dem', OdxTargetModuleInfo> = {
      dcm: { exists: false, dirty: false },
      dem: { exists: false, dirty: false },
    };
    for (const moduleShortName of ['Dcm', 'Dem'] as const) {
      const occurrences = moduleOccurrences.get(moduleShortName) ?? [];
      if (occurrences.length > 1) {
        return {
          ok: false,
          error: {
            kind: 'odx-module-ambiguous',
            module: moduleShortName,
            message: `Module ${moduleShortName} occurs in multiple value ARXML documents`,
          },
        };
      }
      const occurrence = occurrences[0];
      if (occurrence) {
        targetModules[moduleShortName.toLowerCase() as 'dcm' | 'dem'] = {
          exists: true,
          docPath: occurrence.docPath,
          dirty: dirtyPaths.has(resolve(occurrence.docPath)),
        };
      }
    }

    for (const [moduleShortName, target] of [
      ['Dcm', targetModules.dcm],
      ['Dem', targetModules.dem],
    ] as const) {
      if (target.exists && target.dirty && target.docPath) {
        return {
          ok: false,
          error: {
            kind: 'odx-target-dirty',
            docPath: target.docPath,
            message: `${moduleShortName} target document is dirty; save it before preview`,
          },
        };
      }
    }

    const odxRead = await readFileWithCap(request.odxPath, DEFAULT_FILE_CAP_BYTES);
    if (!odxRead.ok) {
      return {
        ok: false,
        error: {
          kind: odxRead.kind === 'too-large' ? 'odx-too-large' : 'read-failed',
          message: odxRead.message,
        },
      };
    }

    let document;
    try {
      document = parseOdxDocument(odxRead.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: { kind: 'odx-malformed', message } };
    }

    const variants = document.importableVariants;
    if (variants.length === 0) {
      return {
        ok: false,
        error: {
          kind: 'odx-no-variant',
          message: 'ODX document has no importable BASE-VARIANT or ECU-VARIANT',
        },
      };
    }

    if (variants.length > 1 && request.variantId === undefined) {
      const emptyPreview: OdxImportPreview = {
        variants,
        rows: [],
        warnings: [],
        previewHash: previewHash([], emptyStats(), targetModules),
        stats: emptyStats(),
        targetModules,
      };
      return { ok: true, value: emptyPreview };
    }

    const selectedVariant =
      variants.length === 1
        ? variants[0]
        : variants.find((variant) => variant.odxId === request.variantId);
    if (!selectedVariant) {
      return {
        ok: false,
        error: {
          kind: 'odx-variant-not-found',
          message: `odx-variant-not-found: ${request.variantId ?? ''}`,
        },
      };
    }

    const bswmdDefinitions = await loadBswmdDefinitions(manifest, manifestDir);
    const bswmdIndex = buildBswmdDefIndex(bswmdDefinitions);
    for (const [moduleShortName, containerKey] of [
      ['Dcm', 'DcmConfigSet'],
      ['Dem', 'DemConfigSet'],
    ] as const) {
      if (!bswmdIndex.containerPath.has(containerKey)) {
        return {
          ok: false,
          error: {
            kind: 'odx-bswmd-not-loaded',
            module: moduleShortName,
            message: `${moduleShortName} BSWMD is unavailable or does not contain ${containerKey}`,
          },
        };
      }
    }

    const dim = buildDim({
      document,
      variantId: selectedVariant.odxId,
      sourcePath: request.odxPath,
    });
    const mapped = mapDimToEcuc({ dim, bswmdIndex });

    const warnings: DimWarning[] = [...mapped.warnings];
    const provenance = await readProvenanceManifest(manifestDir, warnings);

    const rows: OdxImportRow[] = [];
    for (const incomingModule of mapped.modules) {
      const moduleShortName = incomingModule.shortName === 'Dcm' ? 'Dcm' : 'Dem';
      const incomingContainers = collectImportContainers(incomingModule);
      const incomingHashes = new Map(
        [...incomingContainers].map(([path, container]) => [
          path,
          hashContainerForProvenance(container),
        ]),
      );
      const currentModule = moduleOccurrences.get(moduleShortName)?.[0]?.module;
      const currentContainers = currentModule ? collectImportContainers(currentModule) : new Map();
      const currentHashes = new Map(
        [...currentContainers].map(([path, container]) => [
          path,
          hashContainerForProvenance(container),
        ]),
      );
      const baseEntries = new Map(
        [...provenance].filter(([, entry]) => entry.module === moduleShortName),
      );
      rows.push(
        ...classifyImportRows({
          module: moduleShortName,
          manifestEntries: baseEntries,
          currentContainers: currentHashes,
          incomingContainers: incomingHashes,
        }),
      );
    }
    rows.sort((a, b) =>
      a.module === b.module ? a.path.localeCompare(b.path) : a.module.localeCompare(b.module),
    );

    const stats: OdxImportPreview['stats'] = {
      services: dim.services.length,
      dids: didIdentifierCount(dim),
      dtcs: dim.dtcs.length,
      sessions: dim.sessions.length,
      securityLevels: dim.securityLevels.length,
    };

    return {
      ok: true,
      value: {
        variants,
        selectedVariant,
        rows,
        warnings,
        previewHash: previewHash(rows, stats, targetModules),
        stats,
        targetModules,
      },
    };
  } catch (error) {
    return { ok: false, error: errorFromUnknown(error, 'ODX preview failed') };
  }
}

export type { OdxImportPreviewRequest, OdxImportPreviewResponse };
