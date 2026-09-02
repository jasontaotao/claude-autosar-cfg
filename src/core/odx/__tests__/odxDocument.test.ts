import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseOdxDocument } from '../odxDocument.js';

const realXml = readFileSync('samples/odx/Demo_Cdd.odx-d', 'utf8');

describe('parseOdxDocument', () => {
  it('indexes the real Vector CANdela fixture', () => {
    const doc = parseOdxDocument(realXml);
    expect(doc.importableVariants).toHaveLength(1);
    expect(doc.importableVariants[0]?.kind).toBe('BASE-VARIANT');
    expect(doc.idIndex.size).toBeGreaterThan(0);
    expect(doc.layers.map((x) => x.tag)).toContain('BASE-VARIANT');
  });

  it('preserves repeated child tags in document order', () => {
    const doc = parseOdxDocument(realXml);
    const base = doc.importableVariants[0]!;
    const layer = doc.idIndex.get(base.odxId)!;
    const services = layer.children['DIAG-COMMS']?.[0]?.children['DIAG-SERVICE'] ?? [];
    expect(services.length).toBe(95);
  });

  it('rejects malformed XML', () => {
    expect(() => parseOdxDocument('<ODX>')).toThrowError(/ODX parse failed|XML/);
  });
});

it('extracts document metadata and variant short names', () => {
  const doc = parseOdxDocument(realXml);
  expect(doc.modelVersion).toBe('2.2.0');
  expect(doc.adminRevision).toBe('1.0.2');
  expect(doc.importableVariants[0]?.shortName).toBe('Demo');
});
