import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';

const SAMPLES = ['Det_Det', 'EcuC_EcuC', 'Com_Com', 'PduR_PduR', 'WdgIf_WdgIf'] as const;

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'arxml');

describe('arxml round-trip on S32K148 samples', () => {
  it.each(SAMPLES)('round-trip preserves ArxmlDocument fields: %s', async (name) => {
    const path = join(FIXTURE_DIR, `${name}.arxml`);
    const original = await readFile(path, 'utf8');
    const p1 = parseArxml(original);
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    const s1 = serializeArxml(p1.value);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;
    expect(p2.value).toEqual(p1.value);
  });

  it.each(SAMPLES)('serialized XML re-parses cleanly: %s', async (name) => {
    const path = join(FIXTURE_DIR, `${name}.arxml`);
    const original = await readFile(path, 'utf8');
    const p1 = parseArxml(original);
    if (!p1.ok) return;
    const s1 = serializeArxml(p1.value);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (p2.ok) {
      expect(p2.value.packages.length).toBe(p1.value.packages.length);
      expect(p2.value.version).toBe(p1.value.version);
    }
  });
});