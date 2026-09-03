// renderer/components/editor/modeComponents.tsx
// Runtime ParamEditMode -> component map, extracted from ParamEditor.tsx so
// both the single-instance ParamEditor and the CollectionTableView can
// render per-param cells without a circular import (ParamEditor routes
// `collection:` paths to CollectionTableView; CollectionTableView reuses
// these editors).
//
// The framework-free *string* table lives in modes.ts; this module is the
// React-side counterpart and the only place the mode editors are wired to
// their components.

import type { ParamValue } from '@core/arxml/types';

import { BooleanEditor } from './modes/BooleanEditor';
import { EnumEditor } from './modes/EnumEditor';
import { FloatEditor } from './modes/FloatEditor';
import { IntegerEditor } from './modes/IntegerEditor';
import { MultilineEditor } from './modes/MultilineEditor';
import { ReferenceEditor } from './modes/ReferenceEditor';
import { StringEditor } from './modes/StringEditor';

export interface ModeProps {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

/**
 * Map ParamEditMode -> component. Consumers import each sub-editor
 * indirectly through this map to avoid runtime indirection (RSC / SSR
 * friendly) and to keep `modes.ts` framework-free.
 */
export const MODE_COMPONENT_MAP: Record<
  'string' | 'integer' | 'float' | 'boolean' | 'enum' | 'reference' | 'multiline',
  React.ComponentType<ModeProps>
> = {
  string: StringEditor,
  integer: IntegerEditor,
  float: FloatEditor,
  boolean: BooleanEditor,
  enum: EnumEditor,
  reference: ReferenceEditor,
  multiline: MultilineEditor,
};

/** CSS class per type used for the type badge (single-instance rows and collection column headers). */
export function typeBadgeClass(type: ParamValue['type']): string {
  switch (type) {
    case 'integer':
    case 'float':
      return 'bg-blue-600 text-white';
    case 'boolean':
      return 'bg-emerald-600 text-white';
    case 'enum':
      return 'bg-amber-500 text-white';
    case 'reference':
      return 'bg-purple-600 text-white';
    case 'string':
      return 'bg-slate-500 text-white';
  }
}
