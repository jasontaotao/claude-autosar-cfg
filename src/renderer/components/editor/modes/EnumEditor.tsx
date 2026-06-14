// renderer/components/editor/modes/EnumEditor.tsx
// <select> for enum params.
// F2 does not pull the actual enum schema (would require resolving the
// DEFINITION-REF); we expose the current value as the only option and let
// the user re-enter any string. Schema-aware options are planned for a
// later sprint.

import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

export function EnumEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const updateParam = useArxmlStore((s) => s.updateParam);
  if (value.type !== 'enum') return <span className="text-red-500">type mismatch</span>;

  return (
    <input
      type="text"
      value={value.value}
      aria-label={`${paramKey} value (enum)`}
      title="F2 enum editor: schema-aware options land in a later sprint."
      className="w-32 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
      onChange={(e) =>
        updateParam(containerPath, paramKey, { type: 'enum', value: e.target.value })
      }
    />
  );
}
