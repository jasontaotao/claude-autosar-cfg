// Sprint 14 #1 Phase B (T7) — script engine IPC handlers.
//
// Four invoke handlers (list / save / delete / run) + one main→renderer
// push channel (progress). The renderer is the source of truth for the
// open project; the main process reads / writes `manifest.scripts[]`
// directly via `loadManifest` / `saveManifest` — same pattern as the
// templates handler.
//
// V0.1 design:
//   - Each handler reads the manifest via the test-injected
//     `__resetForTest(manifestPath, projectId)` (the production wiring
//     tracks the open project via the renderer's `project:open` IPC and
//     shares the manifest path through a different channel — not in
//     V0.1 scope).
//   - `run` resolves imports (DAG), constructs a minimal `ArxmlDocument`
//     for the sandbox, and delegates to Phase A's `runInSandbox`. An
//     empty manifest with zero documents is acceptable — log-only
//     scripts still execute.

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArxmlDocument, ArxmlVersion } from '../../core/arxml/types.js';
import { loadManifest, saveManifest } from '../../core/project/manifest.js';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type {
  ScriptDeleteRequest,
  ScriptDeleteResponse,
  ScriptListRequest,
  ScriptListResponse,
  ScriptProgressEvent,
  ScriptRunRequest,
  ScriptRunResponse,
  ScriptSaveRequest,
  ScriptSaveResponse,
} from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';
import { classScriptError, validateShortName, ScriptError } from '../script/errors.js';
import { resolveImports } from '../script/import-resolver.js';
import type { ScriptEntry, ScriptLog, ScriptMutation, ScriptViolation } from '../script/types.js';
import { runInSandbox } from '../script/vm-runner.js';
import { getMainWindow } from '../window.js';

// Test-injection slot. In V0.1 the IPC handler is driven directly from
// tests; the production wiring will replace this with the actual open-
// project state once Phase C lands. The same `__resetForTest` style is
// used by `templatesHandler` (see `_builtinTemplates`).
let _manifestPath: string | null = null;
let _projectId: string | null = null;
export function __resetForTest(manifestPath: string | null, projectId: string | null): void {
  _manifestPath = manifestPath;
  _projectId = projectId;
}

/**
 * Sprint 17b (H8) — defensive path-containment check. Reject any
 * `_manifestPath` containing a `..` parent-traversal segment before
 * touching the filesystem. The script engine reads / writes the
 * manifest path it was given at startup; a compromised preload
 * bridge could otherwise forge `../../etc/passwd`. Throws
 * `ScriptError` with `kind: 'invalid-path'` on violation so the
 * renderer can dispatch a localized toast off the typed kind.
 */
function assertSafeManifestPath(p: string | null): asserts p is string {
  if (p === null) return; // null is the "no project" sentinel; the caller handles it.
  if (path.normalize(p).includes('..')) {
    throw classScriptError(
      'invalid-path',
      `script handler: manifest path contains parent traversal: ${p}`,
      { path: p },
    );
  }
}

interface LoadedManifest {
  readonly scripts: readonly ScriptEntry[];
}

async function loadCurrentManifest(): Promise<LoadedManifest> {
  if (_manifestPath === null || _projectId === null) {
    throw classScriptError(
      'no-project',
      'script handler: no project is open (call __resetForTest or wire via project:open)',
    );
  }
  assertSafeManifestPath(_manifestPath);
  let raw: string;
  try {
    raw = await readFile(_manifestPath, 'utf8');
  } catch (e) {
    throw classScriptError(
      'manifest-read',
      `script handler: cannot read manifest at ${_manifestPath}: ${
        e instanceof Error ? e.message : String(e)
      }`,
      { path: _manifestPath },
    );
  }
  const loaded = loadManifest(raw);
  if (!loaded.ok) {
    throw classScriptError(
      'manifest-read',
      `script handler: manifest invalid: ${JSON.stringify(loaded.error)}`,
    );
  }
  const m = loaded.value;
  if (m.id !== _projectId) {
    throw classScriptError(
      'no-project',
      `script handler: manifest id mismatch (got "${m.id}", expected "${_projectId}")`,
    );
  }
  // Touch every LoadedManifest field so future readers know they're
  // read at this layer (the `name` field is forwarded by callers via
  // writeCurrentManifest).
  return { scripts: m.scripts ?? [] };
}

async function writeCurrentManifest(scripts: readonly ScriptEntry[]): Promise<void> {
  if (_manifestPath === null)
    throw classScriptError('no-project', 'script handler: no project open');
  assertSafeManifestPath(_manifestPath);
  // Round-trip through loadManifest to retain any future fields the
  // runtime knows about. We can't pass the full saved manifest here
  // without widening the helper, so we re-emit the minimal shape that
  // matches the schema.
  const json = await readFile(_manifestPath, 'utf8');
  const cur = loadManifest(json);
  if (!cur.ok) {
    throw classScriptError(
      'manifest-read',
      `script handler: re-read manifest failed: ${cur.error}`,
    );
  }
  const updated = { ...cur.value, scripts: scripts.slice() };
  // v1.15.6 PATCH — route through writeAtomic so the manifest commit
  // survives a crash mid-write (temp-file + fsync + rename). The
  // script-engine manifest path is now crash-safe. Note: `stencilSaveHandler.ts`
  // still uses `await fs.writeFile` directly (FIO-2 from the v1.17.0
  // joint review); that site is intentionally out of scope here and
  // remains a follow-up. The invariant test in __tests__/script-handler.test.ts
  // guards against `.tmp-*` leftover files in the project directory.
  await writeAtomic(_manifestPath, saveManifest(updated));
}

// -- list -----------------------------------------------------------------

export async function scriptListHandler(_req: ScriptListRequest): Promise<ScriptListResponse> {
  const m = await loadCurrentManifest();
  // Lightweight summary — no `source` field on the wire (spec § 2.2).
  return {
    scripts: m.scripts.map((s) => ({
      id: s.id,
      name: s.name,
      shortName: s.shortName,
      kind: s.kind,
      updatedAt: s.updatedAt,
    })),
  };
}

// -- save -----------------------------------------------------------------

// v1.40.0 MINOR T3 (M1) — defensive name validator. The renderer
// pre-validates the `name` (display name) field, but a tampered
// preload bridge could still smuggle in NUL bytes, control characters,
// or arbitrarily-long strings. Cap the visible name at 80 chars (the
// manifest's `name` field is a human-readable label, not a free-form
// text blob) and reject strings that would corrupt the manifest JSON
// or the renderer's table cell. Mirrors the spirit of
// `validateShortName` but with a relaxed shape (display names are
// less strict than identifiers).
const NAME_MAX = 80;
function validateName(name: string): ScriptError | null {
  if (name.length > NAME_MAX) {
    return classScriptError(
      'invalid-source',
      `name too long (max ${NAME_MAX} chars, got ${name.length})`,
      { field: 'name' },
    );
  }
  if (/[\x00-\x1f]/.test(name)) {
    return classScriptError('invalid-source', 'name contains control character', { field: 'name' });
  }
  if (name.trim().length === 0) {
    return classScriptError('invalid-source', 'name is whitespace', { field: 'name' });
  }
  return null;
}

/**
 * Heuristic: pull `import { ... } from './x'` lines out of the user
 * source so the manifest's `imports[]` field is in sync with what the
 * resolver will re-scan at run time. Anything more sophisticated
 * (default / namespace / dynamic imports) is rejected at run time by
 * the resolver, not at save time.
 */
function extractDeclaredImports(source: string): ReadonlyArray<{ from: string; names: string[] }> {
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g;
  const out: Array<{ from: string; names: string[] }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const names = m[1]!
      .split(',')
      .map((s) => {
        const trimmed = s.trim();
        const aliased = trimmed.split(/\s+as\s+/)[0];
        return aliased ? aliased.trim() : '';
      })
      .filter((s) => s.length > 0);
    out.push({ from: m[2]!, names });
  }
  return out;
}

export async function scriptSaveHandler(req: ScriptSaveRequest): Promise<ScriptSaveResponse> {
  const err = validateShortName(req.shortName);
  if (err) throw err;
  // v1.40.0 MINOR T3 (M1) — validate the display name. The renderer
  // pre-validates but a tampered preload bridge could still pass NUL
  // bytes, control characters, or arbitrarily-long strings.
  const nameErr = validateName(req.name);
  if (nameErr !== null) throw nameErr;
  const m = await loadCurrentManifest();
  const list = m.scripts.slice();
  const now = new Date().toISOString();
  const declared = extractDeclaredImports(req.source);
  if (req.id !== undefined && req.id !== '') {
    const idx = list.findIndex((s) => s.id === req.id);
    if (idx < 0) throw classScriptError('unknown-script', `script id not found: ${req.id}`);
    // shortName collision against a different entry
    const collision = list.find((s) => s.shortName === req.shortName && s.id !== req.id);
    if (collision !== undefined) {
      throw classScriptError(
        'duplicate-shortname',
        `shortName "${req.shortName}" already used by another entry`,
      );
    }
    const prev = list[idx]!;
    const updated: ScriptEntry = {
      id: prev.id,
      name: req.name,
      shortName: req.shortName,
      kind: req.kind,
      source: req.source,
      imports: declared,
      updatedAt: now,
    };
    list[idx] = updated;
    await writeCurrentManifest(list);
    return { id: prev.id, updatedAt: now };
  }
  // create path
  if (list.some((s) => s.shortName === req.shortName)) {
    throw classScriptError(
      'duplicate-shortname',
      `duplicate shortName: "${req.shortName}" already exists`,
    );
  }
  const newEntry: ScriptEntry = {
    id: randomUUID(),
    name: req.name,
    shortName: req.shortName,
    kind: req.kind,
    source: req.source,
    imports: declared,
    updatedAt: now,
  };
  list.push(newEntry);
  await writeCurrentManifest(list);
  return { id: newEntry.id, updatedAt: now };
}

// -- delete ---------------------------------------------------------------

export async function scriptDeleteHandler(req: ScriptDeleteRequest): Promise<ScriptDeleteResponse> {
  const m = await loadCurrentManifest();
  const filtered = m.scripts.filter((s) => s.id !== req.id);
  await writeCurrentManifest(filtered);
  return { ok: true };
}

// -- run ------------------------------------------------------------------

/**
 * Build a minimal `ArxmlDocument` so log-only scripts can execute
 * without an actual project file. This is the V0.1 fallback when the
 * manifest has zero `valueArxmlPaths`; the full document-loading path
 * (parse the first value-side ARXML and feed it to the sandbox) is
 * wired in Phase C once the renderer hands us the actual open project.
 */
function emptyProject(): ArxmlDocument {
  return {
    path: '<empty>',
    version: '4.2' satisfies ArxmlVersion,
    packages: [],
  };
}

export async function scriptRunHandler(req: ScriptRunRequest): Promise<ScriptRunResponse> {
  const m = await loadCurrentManifest();
  const entry = m.scripts.find((s) => s.id === req.id);
  if (entry === undefined) {
    throw classScriptError('unknown-script', `script id not found: ${req.id}`);
  }
  // 1. Resolve imports — may throw `circular-import` / `unknown-module`
  //    / `unknown-export`. We catch `ScriptError` and convert the
  //    import-related kinds into a `ScriptRunResult` with
  //    `status: 'import-error'` so the renderer can map the error to
  //    the editor without having to inspect the raw exception.
  try {
    resolveImports(entry, m.scripts);
  } catch (e) {
    if (e instanceof ScriptError) {
      const kind = e.payload.kind;
      if (
        kind === 'unknown-module' ||
        kind === 'unknown-export' ||
        kind === 'circular-import' ||
        kind === 'unsupported-import' ||
        kind === 'depth-limit'
      ) {
        return {
          runId: 'import-error',
          status: 'import-error',
          logs: [],
          violations: [],
          mutations: [],
          durationMs: 0,
          errorMessage: e.payload.message,
        };
      }
    }
    throw e;
  }
  // 2. Sinks
  const logs: ScriptLog[] = [];
  const violations: ScriptViolation[] = [];
  const mutations: ScriptMutation[] = [];
  // 3. Run. V0.1: log-only scripts run against an empty ArxmlDocument.
  //    Phase C wires the actual open document in.
  const project = emptyProject();
  // v1.17.0 MINOR (T5) IPC-1 — wire SCRIPT_PROGRESS push channel.
  // `runInSandbox` fires `onLog` synchronously after each `ctx.log.*`
  // call (in addition to its own `logs` sink-array push). We forward
  // the event to the renderer via `webContents.send`. The push is
  // best-effort: when the window is null (pre-create / post-close),
  // the IPC `send` is skipped and the logs still land in the sink
  // array returned to the renderer via the final `ScriptRunResult`.
  //
  // Snapshot the BrowserWindow ONCE before the run starts so a
  // window close mid-run doesn't tear the listener half-way through.
  const mainWindow = getMainWindow();
  // v1.40.0 MINOR T3 (M2) — clamp `timeoutMs` to a safe range. The
  // renderer sends a number bounded by the UI's slider, but a tampered
  // preload could send `Infinity`, `Number.MAX_SAFE_INTEGER`, or `0`.
  // V8's `setTimeout` treats `0` (and negative values) as "no timeout",
  // which means a malicious or buggy caller could wedge the graceful-
  // shutdown drain that wraps `runInSandbox`. The floor at 1 s leaves
  // the runner enough headroom to fail fast on a stuck script; the
  // ceiling at 60 s caps the worst-case drain during quit.
  const SAFE_TIMEOUT_MIN_MS = 1000;
  const SAFE_TIMEOUT_MAX_MS = 60_000;
  const clampedTimeoutMs = Math.min(
    Math.max(req.timeoutMs ?? 5000, SAFE_TIMEOUT_MIN_MS),
    SAFE_TIMEOUT_MAX_MS,
  );
  try {
    return runInSandbox(entry, logs, violations, mutations, {
      timeoutMs: clampedTimeoutMs,
      project,
      onLog: (runId, log) => {
        if (mainWindow === null || mainWindow.isDestroyed()) return;
        const event: ScriptProgressEvent = {
          runId,
          level: log.level,
          message: log.message,
          ts: log.ts,
        };
        mainWindow.webContents.send(IPC_CHANNELS.SCRIPT_PROGRESS, event);
      },
    });
  } catch (e) {
    // Defensive — the runner should never throw, but if a future
    // refactor leaks an exception, surface it as a runtime-error
    // ScriptRunResult instead of an IPC rejection.
    const message = e instanceof Error ? e.message : String(e);
    return {
      runId: 'run-error',
      status: 'runtime-error',
      logs: logs.slice(),
      violations: violations.slice(),
      mutations: mutations.slice(),
      durationMs: 0,
      errorMessage: message,
    };
  }
}

// Re-export for tests + future callers that need to throw a
// ScriptError directly.
export { ScriptError };
