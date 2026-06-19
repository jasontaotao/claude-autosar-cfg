// Sprint 14 Task 1 — ArxmlDocument.sourceBswmdPath contract test.
//
// Verifies the optional `sourceBswmdPath` field added to the shared
// ArxmlDocument type. The field is set by the BSWMD-to-ECUC skeleton
// flow (Task 8) so the cascade-remove flow (Task 12) can find
// dependents. Manual / Open ARXML flows leave it undefined.
//
// The test imports the re-export from `shared/types` (the public
// surface consumed by main + preload + renderer); the underlying
// declaration lives in `core/arxml/types.ts` but is re-exported here.

import { describe, expect, it } from 'vitest';

import type {
  ArxmlDocument,
  ScriptDeleteRequest,
  ScriptDeleteResponse,
  ScriptListRequest,
  ScriptListResponse,
  ScriptProgressEvent,
  ScriptRunRequest,
  ScriptRunResponse,
  ScriptSaveRequest,
  ScriptSaveResponse,
} from '../types.js';

describe('ArxmlDocument.sourceBswmdPath (Sprint 14 Task 1)', () => {
  it('accepts optional sourceBswmdPath field', () => {
    const doc: ArxmlDocument = {
      path: '/proj/Can_EcucValues.arxml',
      version: '4.6',
      packages: [],
      sourceBswmdPath: '/proj/Can_bswmd.arxml',
    };
    expect(doc.sourceBswmdPath).toBe('/proj/Can_bswmd.arxml');
  });

  it('is optional (can be omitted)', () => {
    const doc: ArxmlDocument = {
      path: '/proj/manual.arxml',
      version: '4.6',
      packages: [],
    };
    expect(doc.sourceBswmdPath).toBeUndefined();
  });
});

// Sprint 14 #1 Phase B (T6) — IPC request/response shapes for the
// script engine. The types themselves live in `src/shared/types.ts`;
// the runtime smoke tests here verify the contracts compile and the
// shape assumptions hold (required fields, discriminated unions).
describe('Sprint 14 #1 script IPC types', () => {
  it('ScriptListRequest is { projectId }', () => {
    const r: ScriptListRequest = { projectId: 'p1' };
    expect(r.projectId).toBe('p1');
  });

  it('ScriptListResponse is { scripts } with readonly array', () => {
    const r: ScriptListResponse = { scripts: [] };
    expect(r.scripts).toEqual([]);
  });

  it('ScriptSaveRequest allows omitting id for create', () => {
    const r: ScriptSaveRequest = {
      projectId: 'p1',
      name: 'X',
      shortName: 'x-script',
      kind: 'validator',
      source: '// x',
    };
    expect(r.id).toBeUndefined();
  });

  it('ScriptSaveResponse carries id + updatedAt', () => {
    const r: ScriptSaveResponse = { id: 'abc', updatedAt: '2026-06-19T00:00:00.000Z' };
    expect(r.id).toBe('abc');
    expect(r.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('ScriptDeleteRequest is { projectId, id } and Response is the { ok: true } marker', () => {
    const req: ScriptDeleteRequest = { projectId: 'p1', id: 'abc' };
    const resp: ScriptDeleteResponse = { ok: true };
    expect(req.id).toBe('abc');
    expect(resp.ok).toBe(true);
  });

  it('ScriptRunRequest allows omitting timeoutMs', () => {
    const r: ScriptRunRequest = { projectId: 'p1', id: 'abc' };
    expect(r.timeoutMs).toBeUndefined();
  });

  it('ScriptRunResponse is the ScriptRunResult discriminated status union', () => {
    const ok: ScriptRunResponse = {
      runId: 'r1',
      status: 'ok',
      logs: [],
      violations: [],
      mutations: [],
      durationMs: 12,
    };
    const syntaxErr: ScriptRunResponse = {
      runId: 'r1',
      status: 'syntax-error',
      logs: [],
      violations: [],
      mutations: [],
      durationMs: 0,
      errorMessage: 'unexpected token',
      errorLine: 3,
      errorColumn: 1,
    };
    expect(ok.status).toBe('ok');
    expect(syntaxErr.status).toBe('syntax-error');
  });

  it('ScriptProgressEvent carries runId + level + message + ts', () => {
    const e: ScriptProgressEvent = {
      runId: 'r1',
      level: 'info',
      message: 'halfway',
      ts: 1700000000000,
    };
    expect(e.level).toBe('info');
    expect(e.message).toBe('halfway');
  });
});
