// renderer/components/editor/modes/FloatEditor.tsx
// Number input (step=any) for float params.

import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

export function FloatEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const updateParam = useArxmlStore((s) => s.updateParam);
  if (value.type !== 'float') return <span className="text-red-500">type mismatch</span>;

  return (
    <input
      type="number"
      step="any"
      value={value.value}
      aria-label={`${paramKey} value`}
      className="w-32 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
      onChange={(e) => {
        const raw = e.target.value;
        const parsed = raw === '' ? 0 : Number.parseFloat(raw);
        if (Number.isNaN(parsed)) return;
        updateParam(containerPath, paramKey, { type: 'float', value: parsed });
      }}
    />
  );
}
