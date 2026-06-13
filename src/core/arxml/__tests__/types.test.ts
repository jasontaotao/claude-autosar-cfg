import { describe, it, expect } from 'vitest';

import { SUPPORTED_ARXML_VERSIONS, type ArxmlDocument } from '../types.js';

describe('arxml types', () => {
  it('exposes supported ARXML versions', () => {
    expect(SUPPORTED_ARXML_VERSIONS).toContain('4.6');
    expect(SUPPORTED_ARXML_VERSIONS.length).toBeGreaterThanOrEqual(4);
  });

  it('ArxmlDocument is structurally usable', () => {
    const doc: ArxmlDocument = {
      path: '/tmp/can.arxml',
      version: '4.6',
      packages: [],
    };
    expect(doc.packages).toEqual([]);
    expect(doc.version).toBe('4.6');
  });
});
