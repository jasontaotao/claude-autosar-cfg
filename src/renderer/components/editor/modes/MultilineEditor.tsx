// renderer/components/editor/modes/MultilineEditor.tsx
// Textarea for multi-line string params (Description / Comment keys).

import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

export function MultilineEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const updateParam = useArxmlStore((s) => s.updateParam);
  if (value.type !== 'string') return <span className="text-red-500">type mismatch</span>;

  return (
    <textarea
      rows={3}
      value={value.value}
      aria-label={`${paramKey} value`}
      className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
      onChange={(e) =>
        updateParam(containerPath, paramKey, { type: 'string', value: e.target.value })
      }
    />
  );
}
