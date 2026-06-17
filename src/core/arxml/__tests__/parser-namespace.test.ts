import { describe, it, expect } from 'vitest';

describe('XSD_PATTERN namespace detection', () => {
  it('matches the legacy dashed form AUTOSAR_4-2-2.xsd', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion({
      '@_xmlns': 'http://autosar.org/schema/r4.2',
      '@_xsi:schemaLocation':
        'http://autosar.org/schema/r4.2 AUTOSAR_4-2-2.xsd',
    });
    expect(r).toBe('4.2');
  });

  it('matches the 5-digit form AUTOSAR_00046.xsd', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion({
      '@_xmlns': 'http://autosar.org/schema/r4.0',
      '@_xsi:schemaLocation':
        'http://autosar.org/schema/r4.0 AUTOSAR_00046.xsd',
    });
    expect(r).toBe('00046');
  });

  it('matches the 5-digit form AUTOSAR_00049.xsd (R20-11)', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion({
      '@_xmlns': 'http://autosar.org/schema/r4.0',
      '@_xsi:schemaLocation':
        'http://autosar.org/schema/r4.0 AUTOSAR_00049.xsd',
    });
    expect(r).toBe('00049');
  });
});