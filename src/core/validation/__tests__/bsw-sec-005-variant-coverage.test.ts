import { describe, expect, it } from 'vitest';

import type { BswModuleDef } from '../../project/bswmd.js';
import { validateVariantCoverage } from '../validate.js';

describe('BSW-SEC-005: POST-BUILD parameter without variant coverage', () => {
  it('reports error for POST-BUILD param without variant coverage', () => {
    const bswmd: BswModuleDef = {
      shortName: 'Adc',
      path: '/Vendor/Adc',
      dialect: 'ecuc-module-def',
      moduleId: null,
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      containers: [
        {
          shortName: 'Cfg',
          path: '/Vendor/Adc/Cfg',
          lowerMultiplicity: 0,
          upperMultiplicity: 1,
          subContainers: [],
          parameters: [
            {
              shortName: 'Calibration',
              path: '/Vendor/Adc/Cfg/Calibration',
              kind: 'integer',
              defaultValue: 0,
              minValue: 0,
              maxValue: 100,
              minLength: null,
              maxLength: null,
              enumerationLiterals: [],
            },
          ],
          references: [],
          choices: [],
          multiplicityConfigClasses: [
            { configClass: 'POST-BUILD', configVariant: 'VARIANT-POST-BUILD' },
          ],
        },
      ],
    };
    const values: ReadonlyArray<{ paramPath: string; variantRef?: string }> = [];

    const warnings = validateVariantCoverage(values, bswmd);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        kind: 'BSW-SEC-005',
        severity: 'error',
        path: expect.stringContaining('Calibration'),
      }),
    );
  });

  it('passes when POST-BUILD param has variant coverage', () => {
    const bswmd: BswModuleDef = {
      shortName: 'Adc',
      path: '/Vendor/Adc',
      dialect: 'ecuc-module-def',
      moduleId: null,
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      containers: [
        {
          shortName: 'Cfg',
          path: '/Vendor/Adc/Cfg',
          lowerMultiplicity: 0,
          upperMultiplicity: 1,
          subContainers: [],
          parameters: [
            {
              shortName: 'Calibration',
              path: '/Vendor/Adc/Cfg/Calibration',
              kind: 'integer',
              defaultValue: 0,
              minValue: 0,
              maxValue: 100,
              minLength: null,
              maxLength: null,
              enumerationLiterals: [],
            },
          ],
          references: [],
          choices: [],
          multiplicityConfigClasses: [
            { configClass: 'POST-BUILD', configVariant: 'VARIANT-POST-BUILD' },
          ],
        },
      ],
    };
    const values = [
      { paramPath: '/Vendor/Adc/Cfg/Calibration', variantRef: 'VARIANT-PRE-COMPILE' },
    ];

    const warnings = validateVariantCoverage(values, bswmd);
    expect(warnings).toEqual([]);
  });
});
