import { describe, it, expect } from 'vitest';

import { serializeArxml } from '../serializer.js';
import type { ArxmlDocument } from '../types.js';

describe('serializeArxml', () => {
  it('serializes minimal ArxmlDocument with module + container + 2 params', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'P',
          path: '/P',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'M',
              params: {},
              references: [],
              children: [
                {
                  kind: 'container',
                  tagName: 'ECUC-CONTAINER-VALUE',
                  shortName: 'C',
                  params: {
                    A: { type: 'integer', value: 7 },
                    B: { type: 'enum', value: 'X' },
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('<AUTOSAR');
    expect(r.value).toContain('<SHORT-NAME>P</SHORT-NAME>');
    expect(r.value).toContain('<SHORT-NAME>M</SHORT-NAME>');
    expect(r.value).toContain('<SHORT-NAME>C</SHORT-NAME>');
    expect(r.value).toContain('<VALUE>7</VALUE>');
    expect(r.value).toContain('<VALUE>X</VALUE>');
  });

  it('serializes ArxmlReference with dest attribute', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'P',
          path: '/P',
          elements: [
            {
              kind: 'reference',
              tagName: 'DEFINITION-REF',
              value: '/A/B/M',
              dest: 'ECUC-MODULE-DEF',
            },
          ],
        },
      ],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('DEST="ECUC-MODULE-DEF"');
    expect(r.value).toContain('/A/B/M');
  });

  it('serializes empty document with self-closing AR-PACKAGES', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('<AUTOSAR');
    expect(r.value).toContain('<AR-PACKAGES');
  });
});
