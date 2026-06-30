// v1.17.0 MINOR (T5) IPC-1 — SCRIPT_PROGRESS push channel emit test.
//
// Verifies that scriptRunHandler emits webContents.send on each
// log line via the SCRIPT_PROGRESS IPC channel. The test mocks
// `getMainWindow()` (added in `src/main/window.ts` in this same
// commit) to inject a fake BrowserWindow with a spy webContents.send.
//
// Before T5: SCRIPT_PROGRESS was declared in IPC_CHANNELS,
// registered in preload, consumed by renderer useScriptActions
// .subscribeProgress — but had NO emitter in src/main/. T5
// closes that orphan subscription.
//
// The mock setup mirrors the `vi.mock('../../stencil/feature-flag.js', ...)`
// pattern already used by `featureFlagsHandler.test.ts` — vi.mock
// redirects the `getMainWindow` import in script-handler.ts to
// our injected fake. Per-test, `setMainWindowReturn(null | obj)`
// swaps the fake so we can exercise the null-window fallback.

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScriptSaveRequest } from '../../../shared/types.js';

// vi.hoisted lifts the mock control surface above the vi.mock factory
// (which runs before the module-import block).
const mocks = vi.hoisted(() => {
  const send = vi.fn();
  let current: unknown = {
    isDestroyed: () => false,
    webContents: { send },
  };
  return {
    send,
    setMainWindowReturn: (v: unknown): void => {
      current = v;
    },
    getMainWindow: () => current,
  };
});

vi.mock('../../window.js', () => ({
  getMainWindow: mocks.getMainWindow,
}));

// Import AFTER vi.mock so script-handler.ts's `import { getMainWindow }
// from '../window.js'` resolves to the mock above.
const { scriptRunHandler, scriptSaveHandler, __resetForTest } =
  await import('../script-handler.js');

let workDir: string;
let manifestPath: string;
const projectId = 'demo';

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-script-progress-'));
  manifestPath = join(workDir, 'demo.autosarcfg.json');
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: '1',
        id: projectId,
        name: 'Demo',
        valueArxmlPaths: [],
        bswmdPaths: [],
        scripts: [],
      },
      null,
      2,
    ),
  );
  __resetForTest(manifestPath, projectId);
  mocks.send.mockReset();
  // Default: window is present, sends go to the spy.
  mocks.setMainWindowReturn({
    isDestroyed: () => false,
    webContents: { send: mocks.send },
  });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  __resetForTest(null, null);
  mocks.setMainWindowReturn(null);
});

function saveReq(overrides: Partial<ScriptSaveRequest> = {}): ScriptSaveRequest {
  return {
    projectId,
    name: 'Sample',
    shortName: 'sample-script',
    kind: 'free',
    source: '// hi',
    ...overrides,
  };
}

describe('SCRIPT_PROGRESS push channel emit (v1.17.0 IPC-1)', () => {
  it('emits one ScriptProgressEvent per ctx.log.* call', async () => {
    const saved = await scriptSaveHandler(
      saveReq({
        shortName: 'multi-log',
        source: [
          'ctx.log.info("first");',
          'ctx.log.warn("second");',
          'ctx.log.info("third");',
        ].join('\n'),
      }),
    );
    const r = await scriptRunHandler({ projectId, id: saved.id });
    expect(r.status).toBe('ok');

    // Three sends (one per log line). Each carries runId + level + message + ts.
    expect(mocks.send).toHaveBeenCalledTimes(3);
    const calls: ReadonlyArray<readonly [string, unknown]> = mocks.send.mock.calls;
    for (const [channel, payload] of calls) {
      expect(channel).toBe('script:progress');
      const e = payload as {
        readonly runId: string;
        readonly level: string;
        readonly message: string;
        readonly ts: number;
      };
      expect(typeof e.runId).toBe('string');
      expect(e.runId.length).toBeGreaterThan(0);
      expect(typeof e.ts).toBe('number');
    }
    const messages = calls.map(([, p]) => (p as { readonly message: string }).message);
    expect(messages).toEqual(['first', 'second', 'third']);
    const levels = calls.map(([, p]) => (p as { readonly level: string }).level);
    expect(levels).toEqual(['info', 'warn', 'info']);
  });

  it('does not throw when getMainWindow returns null (window pre-create / post-close)', async () => {
    mocks.setMainWindowReturn(null);
    const saved = await scriptSaveHandler(
      saveReq({ shortName: 'null-window', source: 'ctx.log.info("ignored")' }),
    );
    const r = await scriptRunHandler({ projectId, id: saved.id });
    expect(r.status).toBe('ok');
    // Sink array still captured the log — that's the existing path.
    expect(r.logs.some((l) => l.message === 'ignored')).toBe(true);
    // No IPC push because there is no window to push to.
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
