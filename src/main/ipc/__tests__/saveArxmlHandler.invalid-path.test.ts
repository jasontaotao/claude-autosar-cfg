// Sprint 17b (H8) — `saveArxmlHandler` path-containment tests.
//
// The handler writes the per-doc ARXML file to either:
//   1. `req.currentPath` (silent save-back), or
//   2. The path the user picked via `dialog.showSaveDialog`.
//
// Both branches must reject any path containing a `..` parent-traversal
// segment. Without this check a compromised renderer could forge
// `currentPath = '../../etc/passwd'` and the main process would
// happily overwrite the file.
//
// 2 cases pin the rejection contract:
//   1. rejects `currentPath = '../../etc/passwd'` with `kind: 'invalid-path'`
//   2. accepts a normal absolute `currentPath` (real tmp dir)

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { showSaveDialog } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog,
  },
}));

import type { ArxmlDocument } from '../../../core/arxml/types.js';
import { saveArxmlHandler } from '../saveArxmlHandler.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-save-arxml-invalid-path-'));
  showSaveDialog.mockReset();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeDoc(): ArxmlDocument {
  return {
    path: 'unused',
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [],
      },
    ],
  };
}

describe('saveArxmlHandler path-containment (Sprint 17b H8)', () => {
  it("rejects currentPath with a '..' parent-traversal segment", async () => {
    const r = await saveArxmlHandler({
      doc: makeDoc(),
      currentPath: '../../etc/passwd',
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error.kind).toBe('invalid-path');
    if (r.error.kind !== 'invalid-path') throw new Error('unreachable');
    expect(r.error.message).toMatch(/parent traversal/i);
    expect(r.error.message).toContain('../../etc/passwd');
    // File was NOT written.
    expect(existsSync('../../etc/passwd')).toBe(false);
  });

  it('accepts a normal absolute currentPath and writes successfully', async () => {
    const target = join(workDir, 'Can_EcucValues.arxml');
    const r = await saveArxmlHandler({
      doc: makeDoc(),
      currentPath: target,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.value.canceled).toBe(false);
    expect(r.value.path).toBe(target);
    expect(existsSync(target)).toBe(true);
  });
});
