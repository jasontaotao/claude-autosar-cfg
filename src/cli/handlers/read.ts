// Read command handler (v1.6.0 A+C-3 stub; will flesh out in PR(5)).
//
// Returns a ReadResult by opening the project manifest, parsing all
// referenced ARXML files via `fromArxmlDocument`, and summarizing
// module / container / parameter / reference counts.
//
// For PR(A+C-3) this ships a minimal implementation sufficient for
// integration tests #1 + #4 (read existing fixture + W Demo ECU).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseArxml } from '../../core/arxml/parser.js';
import { fromArxmlDocument } from '../../shared/normalized-document.js';
import { loadManifest } from '../../core/project/manifest.js';

import type { ReadArgs, ReadResult } from '../../shared/headless/ipc-contract.js';
import { failWith } from '../command-dispatcher.js';

export async function readHeadlessProject(args: ReadArgs): Promise<ReadResult> {
  const start = Date.now();
  const projectPath = resolve(args.projectPath);

  if (!existsSync(projectPath)) {
    failWith({ kind: 'file-not-found', path: projectPath }, 1);
  }

  // Loose mode: single ARXML file. Manifest mode: load + iterate arxml list.
  if (projectPath.endsWith('.arxml')) {
    return readSingleArxml(projectPath, start);
  }
  return readProjectManifest(projectPath, start);
}

async function readSingleArxml(filePath: string, start: number): Promise<ReadResult> {
  let xml: string;
  try {
    xml = await readFile(filePath, 'utf-8');
  } catch (err) {
    failWith(
      { kind: 'file-not-found', path: filePath },
      1,
      [`[autosarcfg] cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`],
    );
    throw new Error('unreachable'); // satisfies TS — failWith is `never` but TS sometimes loses that across async boundaries
  }

  const parsed = parseArxml(xml);
  if (!parsed.ok) {
    const message = 'message' in parsed.error ? parsed.error.message : parsed.error.kind;
    failWith(
      { kind: 'parse-error', path: filePath, message },
      1,
      [`[autosarcfg] parse failed: ${message}`],
    );
    throw new Error('unreachable');
  }

  const doc = fromArxmlDocument(parsed.value, 'dom');
  return {
    ok: true,
    command: 'read',
    projectPath: filePath,
    summary: summarize(doc),
    document: doc,
    durationMs: Date.now() - start,
  };
}

async function readProjectManifest(manifestPath: string, start: number): Promise<ReadResult> {
  const manifestDir = resolve(manifestPath, '..');
  let json: string;
  try {
    json = await readFile(manifestPath, 'utf-8');
  } catch (err) {
    failWith(
      { kind: 'file-not-found', path: manifestPath },
      1,
      [`[autosarcfg] cannot read manifest: ${err instanceof Error ? err.message : String(err)}`],
    );
    throw new Error('unreachable');
  }

  const loaded = loadManifest(json, manifestDir);
  if (!loaded.ok) {
    const message = 'message' in loaded.error ? loaded.error.message : String(loaded.error.kind);
    failWith(
      { kind: 'parse-error', path: manifestPath, message },
      1,
      [`[autosarcfg] manifest invalid: ${message}`],
    );
    throw new Error('unreachable');
  }

  let totalModules = 0;
  let totalContainers = 0;
  let totalParams = 0;
  let totalRefs = 0;
  let arxmlVersion = 'unknown';
  const manifest = loaded.value;
  for (const relPath of manifest.valueArxmlPaths) {
    const absPath = resolve(manifestDir, relPath);
    if (!existsSync(absPath)) continue;
    const xml = await readFile(absPath, 'utf-8');
    const parsed = parseArxml(xml);
    if (!parsed.ok) continue;
    arxmlVersion = parsed.value.version;
    const doc = fromArxmlDocument(parsed.value, 'dom');
    totalModules += doc.packages.reduce((s, p) => s + countByKind(p.elements, 'module'), 0);
    totalContainers += doc.packages.reduce((s, p) => s + countByKind(p.elements, 'container'), 0);
    totalParams += doc.packages.reduce((s, p) => s + countParams(p.elements), 0);
    totalRefs += doc.packages.reduce((s, p) => s + countByKind(p.elements, 'reference'), 0);
  }

  return {
    ok: true,
    command: 'read',
    projectPath: manifestPath,
    summary: {
      arxmlVersion,
      moduleCount: totalModules,
      containerCount: totalContainers,
      parameterCount: totalParams,
      referenceCount: totalRefs,
    },
    document: { manifestPath, manifest },
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Summary helpers (pure, easy to test in isolation if needed)
// ---------------------------------------------------------------------------

function summarize(doc: { packages: ReadonlyArray<{ elements: ReadonlyArray<NormalizedElementLite> }> }): {
  arxmlVersion: string;
  moduleCount: number;
  containerCount: number;
  parameterCount: number;
  referenceCount: number;
} {
  let modules = 0;
  let containers = 0;
  let params = 0;
  let refs = 0;
  for (const pkg of doc.packages) {
    modules += countByKind(pkg.elements, 'module');
    containers += countByKind(pkg.elements, 'container');
    refs += countByKind(pkg.elements, 'reference');
    params += countParams(pkg.elements);
  }
  return { arxmlVersion: 'unknown', moduleCount: modules, containerCount: containers, parameterCount: params, referenceCount: refs };
}

interface NormalizedElementLite {
  readonly kind: 'module' | 'container' | 'reference' | 'unknown';
  readonly params?: Readonly<Record<string, unknown>>;
  readonly children?: ReadonlyArray<NormalizedElementLite>;
}

function countByKind(elements: ReadonlyArray<NormalizedElementLite>, kind: NormalizedElementLite['kind']): number {
  let n = 0;
  for (const e of elements) {
    if (e.kind === kind) n++;
    if (e.children) n += countByKind(e.children, kind);
  }
  return n;
}

function countParams(elements: ReadonlyArray<NormalizedElementLite>): number {
  let n = 0;
  for (const e of elements) {
    if (e.params) n += Object.keys(e.params).length;
    if (e.children) n += countParams(e.children);
  }
  return n;
}