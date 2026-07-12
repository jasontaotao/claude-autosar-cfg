// v1.48.1 PATCH T2 -- regression test for IPC_CHANNELS.GET_APP_VERSION.
//
// Closes Round-8 audit F-3 (LOW): the handler previously returned a
// hard-coded `'0.11.0'` literal that predated v1.0.0 and silently
// drifted from the real `package.json` "version". The fix at
// `src/main/ipc/register.ts:122` reads `app.getVersion()` instead.
//
// This test pins the new contract by:
//   1. Mocking `electron.app.getVersion()` to return a controlled value
//      ('9.9.9-test').
//   2. Mocking `ipcMain.handle()` to capture the registered handler so the
//      test can invoke it directly without booting Electron.
//   3. Calling `registerIpcHandlers()` (which registers GET_APP_VERSION).
//   4. Invoking the registered handler and asserting the returned value
//      matches the mocked `app.getVersion()` -- NOT a stale literal.

const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock(
  'electron',
  async (
    importOriginal: () => Promise<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> => {
    const actual = await importOriginal();
    return {
      ...actual,
      app: {
        // Fixture: pretend the live app version is '9.9.9-test' so any
        // drift toward a stale literal ('0.11.0') surfaces as an
        // equality mismatch.
        getVersion: vi.fn(() => '9.9.9-test'),
      },
      ipcMain: {
        handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
          registeredHandlers.set(channel, handler);
        }),
      },
    };
  },
);

// Import AFTER vi.mock so the mocked `electron` is in scope.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../../../shared/ipc-contract.js';
import { registerIpcHandlers } from '../register.js';

describe('IPC_CHANNELS.GET_APP_VERSION (v1.48.1 PATCH T2)', () => {
  beforeEach(() => {
    registeredHandlers.clear();
  });

  it('GET_APP_VERSION handler returns app.getVersion() (not a stale literal)', async () => {
    registerIpcHandlers();
    const registered = registeredHandlers.get(IPC_CHANNELS.GET_APP_VERSION);
    expect(registered).toBeDefined();
    const result = await registered!();

    // Should return the mocked `app.getVersion()` value, NOT the
    // legacy `'0.11.0'` literal that was the F-3 finding.
    expect(result).toBe('9.9.9-test');
    expect(result).not.toBe('0.11.0');
  });

  it('IPC_CHANNELS.GET_APP_VERSION is a stable string identifier', () => {
    // Surface drift early: if the channel name changes, every caller
    // (preload bridge, DcmConfigSuccessDialog menu chip) breaks
    // simultaneously. Tests pin the contract.
    expect(IPC_CHANNELS.GET_APP_VERSION).toBe('app:get-version');
  });

  it('ipcMain.handle received GET_APP_VERSION registration', () => {
    // Same pattern as dcmConfigRegistration.test.ts (v1.30.0): pin
    // that the handler module was imported AND registered, catching
    // a "imported but never wired" regression.
    registerIpcHandlers();
    expect(registeredHandlers.has(IPC_CHANNELS.GET_APP_VERSION)).toBe(true);
  });
});
