import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  DbcFullImportPreview,
  DbcImportDecision,
  DbcImportError,
  DbcImportRow,
} from '../dbc-import.js';

describe('DBC full-import shared DTOs', () => {
  it('keeps decisions reusable and errors closed', () => {
    expectTypeOf<DbcImportDecision>().toEqualTypeOf<'import' | 'keep-local' | 'delete'>();
    const row: DbcImportRow = {
      module: 'Com',
      path: '/Com/ComConfig/ComIPdu/EngineMsg',
      shortName: 'EngineMsg',
      category: 'added',
      defaultDecision: 'import',
      fieldDiffs: [],
    };
    expect(row.category).toBe('added');

    const value: DbcFullImportPreview['stats'] = {
      messages: 1,
      signals: 2,
      skippedIrrelevantMessages: 0,
      skippedMultiplexedSignals: 1,
    };
    expect(value.skippedMultiplexedSignals).toBe(1);

    const error: DbcImportError = { kind: 'dbc-target-dirty', message: 'save first' };
    expect(error.kind).toBe('dbc-target-dirty');
  });
});
