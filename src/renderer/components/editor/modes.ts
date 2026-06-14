// renderer/components/editor/modes.ts
// Pure helpers for choosing the right per-param editor UI for a given ParamValue.
// Kept side-effect-free so it can be unit-tested without jsdom.
//
// NOTE: The runtime component map (MODE_COMPONENT_MAP) is a *string* table.
// The actual JSX components live in `./modes/*Editor.tsx` and are imported
// directly by ParamEditor.tsx — this module intentionally avoids importing
// React so it can run in any environment.

import type { ParamEditMode, ParamValue } from '@core/arxml/types';

/**
 * Decide which ParamEditMode a given ParamValue should use.
 * Strings whose key starts with "Description" or contains "Comment" are
 * treated as multi-line (textarea) rather than single-line text input.
 */
export function selectParamMode(value: ParamValue, key: string): ParamEditMode {
  if (value.type === 'string') {
    return key.startsWith('Description') || key.includes('Comment') ? 'multiline' : 'string';
  }
  if (value.type === 'integer') return 'integer';
  if (value.type === 'float') return 'float';
  if (value.type === 'boolean') return 'boolean';
  if (value.type === 'enum') return 'enum';
  if (value.type === 'reference') return 'reference';
  // Exhaustive guard: ParamValue union is closed above.
  return 'string';
}

/**
 * Static table mapping ParamEditMode -> component file name.
 * ParamEditor.tsx imports each editor by name and indexes by mode.
 */
export const MODE_COMPONENT_MAP = {
  string: 'StringEditor',
  integer: 'IntegerEditor',
  float: 'FloatEditor',
  boolean: 'BooleanEditor',
  enum: 'EnumEditor',
  reference: 'ReferenceEditor',
  multiline: 'MultilineEditor',
} as const;
