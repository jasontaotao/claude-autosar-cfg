// renderer/components/editor/modes/IntegerEditor.tsx
// Number input (step=1) for integer params.

import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

export function IntegerEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const updateParam = useArxmlStore((s) => s.updateParam);
  if (value.type !== 'integer') return <span className="text-red-500">type mismatch</span>;

  return (
    <input
      type="number"
      step={1}
      value={value.value}
      aria-label={`${paramKey} value`}
      className="w-32 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
      onChange={(e) => {
        const raw = e.target.value;
        const parsed = raw === '' ? 0 : Number.parseInt(raw, 10);
        // Number.parseInt('foo', 10) === NaN — guard to avoid NaN silently
        // polluting the store.
        if (Number.isNaN(parsed)) return;
        updateParam(containerPath, paramKey, { type: 'integer', value: parsed });
      }}
    />
  );
}
