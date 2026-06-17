// renderer/components/editor/modes/StringEditor.tsx
// Single-line text input for string params.

import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

export function StringEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const updateParam = useArxmlStore((s) => s.updateParam);

  // Type-narrow: this editor only renders for { type: 'string', value: string }.
  if (value.type !== 'string') return <span className="text-red-500">type mismatch</span>;

  return (
    <input
      type="text"
      value={value.value}
      aria-label={`${paramKey} value`}
      className="w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
      onChange={(e) =>
        updateParam(containerPath, paramKey, { type: 'string', value: e.target.value })
      }
    />
  );
}
