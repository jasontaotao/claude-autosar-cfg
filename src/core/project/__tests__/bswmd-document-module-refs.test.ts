import { describe, expect, it } from 'vitest';

import type { BswmdDocument, ModuleRefEntry } from '../bswmd.js';

describe('BswmdDocument.moduleRefs (C11)', () => {
  it('accepts document without moduleRefs (back-compat)', () => {
    const doc: BswmdDocument = {
      version: '4.6',
      modules: [],
      warnings: [],
    };
    expect(doc.moduleRefs).toBeUndefined();
  });

  it('accepts document with explicit MODULE-REF entries', () => {
    const entries: ReadonlyArray<ModuleRefEntry> = [
      { target: '/Vendor/Adc', source: '/Vendor/MyCollection' },
      { target: '/Vendor/Pwm', source: '/Vendor/MyCollection' },
    ];
    const doc: BswmdDocument = {
      version: '4.6',
      modules: [],
      warnings: [],
      moduleRefs: entries,
    };
    expect(doc.moduleRefs).toEqual(entries);
  });
});
