// arxml-stream/__tests__/router.test.ts
// Verify that the router dispatches DOM vs streaming based on file size
// and feature flags. CRITICAL: when both flags are OFF (default), the
// router must use the DOM path regardless of file size — v1.5.0
// behavior must be preserved.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { _resetFlagCache, _setSettingsPathForTest, setFlagForTest } from '../feature-flag.js';
import { routeArxmlReader } from '../router.js';

const DET_FIXTURE = readFileSync(
  join(process.cwd(), 'tests/fixtures/arxml/Det_Det.arxml'),
  'utf-8',
);
const COM_FIXTURE = readFileSync(
  join(process.cwd(), 'tests/fixtures/arxml/Com_Com.arxml'),
  'utf-8',
);
// Pad to ~3 MiB so we cross the streaming threshold (default 2 MiB).
// We pad the COM fixture with comment whitespace — comments are skipped
// by the parser, but `Buffer.byteLength` still counts the bytes.
const PADDED_3MB = COM_FIXTURE + '<!-- ' + 'x'.repeat(3 * 1024 * 1024) + ' -->';

describe('router — feature-flag default OFF', () => {
  beforeEach(() => {
    setFlagForTest(null);
    _setSettingsPathForTest(null);
    _resetFlagCache();
  });

  afterEach(() => {
    setFlagForTest(null);
    _resetFlagCache();
  });

  it('uses DOM path for small file when both flags are OFF', async () => {
    const result = await routeArxmlReader(DET_FIXTURE, { streamingThresholdBytes: 1024 * 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.path).toBe('dom');
  });

  it('uses DOM path for large file when both flags are OFF (v1.5.0 regression)', async () => {
    const result = await routeArxmlReader(PADDED_3MB, { streamingThresholdBytes: 1024 * 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.path).toBe('dom');
  });

  it('falls back to DOM when flags are OFF even if cache is theoretically enabled', async () => {
    setFlagForTest('indexedDb', false);
    setFlagForTest('streaming', false);
    const result = await routeArxmlReader(DET_FIXTURE, { streamingThresholdBytes: 1024 * 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.path).toBe('dom');
  });
});

describe('router — streaming flag ON', () => {
  beforeEach(() => {
    setFlagForTest(null);
    _setSettingsPathForTest(null);
    _resetFlagCache();
  });

  afterEach(() => {
    setFlagForTest(null);
    _resetFlagCache();
  });

  it('uses DOM path for small file even when streaming flag is ON', async () => {
    setFlagForTest('streaming', true);
    const result = await routeArxmlReader(DET_FIXTURE, { streamingThresholdBytes: 1024 * 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.path).toBe('dom');
  });

  it('uses streaming path for large file when streaming flag is ON', async () => {
    setFlagForTest('streaming', true);
    const result = await routeArxmlReader(PADDED_3MB, { streamingThresholdBytes: 1024 * 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.path).toBe('stream');
  });
});

describe('router — error envelope', () => {
  it('returns Result.err on malformed XML', async () => {
    setFlagForTest('streaming', true);
    const result = await routeArxmlReader('<not closed>', { streamingThresholdBytes: 1024 * 1024 });
    expect(result.ok).toBe(false);
  });
});
