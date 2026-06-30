import { describe, expect, it } from 'vitest';

import type { BswModuleDef } from '../bswmd.js';

describe('BswModuleDef.derivedFrom (C9)', () => {
  it('accepts module without derivedFrom (back-compat)', () => {
    const mod: BswModuleDef = {
      shortName: 'Adc',
      path: '/Vendor/Adc',
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
    };
    expect(mod.derivedFrom).toBeUndefined();
  });

  it('accepts module with derivedFrom path', () => {
    const mod: BswModuleDef = {
      shortName: 'AdcExt',
      path: '/Vendor/AdcExt',
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      derivedFrom: '/Vendor/Base/Adc',
    };
    expect(mod.derivedFrom).toBe('/Vendor/Base/Adc');
  });
});
