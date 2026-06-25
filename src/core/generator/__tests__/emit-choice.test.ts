import { describe, it, expect } from 'vitest';

import { emitChoiceBranch } from '../emit/choice.js';

describe('emitChoiceBranch', () => {
  it('emits #if MACRO ... #else ... #endif block', () => {
    const s = emitChoiceBranch({
      macroName: 'EcuC_USE_OS_PARTITION',
      ifBranch: 'CONST(EcuC_OsPartitionType, AUTOMATIC) EcuC_OsPartition = { 0 };',
      elseBranch: 'CONST(EcuC_RomPartitionType, AUTOMATIC) EcuC_RomPartition = { 0 };',
    });
    expect(s).toBe(
      [
        '#ifdef EcuC_USE_OS_PARTITION',
        'CONST(EcuC_OsPartitionType, AUTOMATIC) EcuC_OsPartition = { 0 };',
        '#else',
        'CONST(EcuC_RomPartitionType, AUTOMATIC) EcuC_RomPartition = { 0 };',
        '#endif',
      ].join('\n'),
    );
  });

  it('emits #ifndef-only block when elseBranch is null', () => {
    const s = emitChoiceBranch({
      macroName: 'EcuC_USE_OPTIONAL',
      ifBranch: 'uint8 EcuC_Flag = 1;',
      elseBranch: null,
    });
    expect(s).toBe(['#ifndef EcuC_USE_OPTIONAL', 'uint8 EcuC_Flag = 1;', '#endif'].join('\n'));
  });
});
