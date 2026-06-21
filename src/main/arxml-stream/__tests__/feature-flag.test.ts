// arxml-stream/__tests__/feature-flag.test.ts
// Verify that the streaming + IndexedDB cache feature flags default OFF
// and can be turned ON by writing settings.json (per Q6 A in spec).

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetFlagCache,
  _setSettingsPathForTest,
  isIndexedDbEnabled,
  isStreamingEnabled,
  setFlagForTest,
} from '../feature-flag.js';

describe('feature-flag', () => {
  let tempDir: string;

  beforeEach(() => {
    _resetFlagCache();
    setFlagForTest(null);
    tempDir = mkdtempSync(join(tmpdir(), 'arxml-stream-flags-'));
    _setSettingsPathForTest(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    _setSettingsPathForTest(null);
    _resetFlagCache();
    setFlagForTest(null);
  });

  it('defaults to OFF when no settings.json exists', () => {
    expect(isStreamingEnabled()).toBe(false);
    expect(isIndexedDbEnabled()).toBe(false);
  });

  it('reads experimental.streaming=true from settings.json', () => {
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({ experimental: { streaming: true, indexedDb: false } }),
    );
    _resetFlagCache();
    expect(isStreamingEnabled()).toBe(true);
    expect(isIndexedDbEnabled()).toBe(false);
  });

  it('reads experimental.indexedDb=true from settings.json', () => {
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({ experimental: { streaming: false, indexedDb: true } }),
    );
    _resetFlagCache();
    expect(isStreamingEnabled()).toBe(false);
    expect(isIndexedDbEnabled()).toBe(true);
  });

  it('defaults missing keys to OFF', () => {
    writeFileSync(join(tempDir, 'settings.json'), JSON.stringify({ experimental: {} }));
    _resetFlagCache();
    expect(isStreamingEnabled()).toBe(false);
    expect(isIndexedDbEnabled()).toBe(false);
  });

  it('falls back to defaults on malformed settings.json', () => {
    writeFileSync(join(tempDir, 'settings.json'), '{ this is not json');
    _resetFlagCache();
    expect(isStreamingEnabled()).toBe(false);
    expect(isIndexedDbEnabled()).toBe(false);
  });

  it('setFlagForTest overrides settings.json for tests', () => {
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({ experimental: { streaming: true, indexedDb: true } }),
    );
    _resetFlagCache();
    setFlagForTest('streaming', false);
    expect(isStreamingEnabled()).toBe(false);
    expect(isIndexedDbEnabled()).toBe(true); // unchanged
  });

  it('setFlagForTest(null) clears the override', () => {
    setFlagForTest('streaming', true);
    expect(isStreamingEnabled()).toBe(true);
    setFlagForTest(null);
    expect(isStreamingEnabled()).toBe(false);
  });
});
