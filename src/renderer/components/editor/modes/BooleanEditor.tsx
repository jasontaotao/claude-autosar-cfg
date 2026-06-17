// renderer/components/editor/modes/BooleanEditor.tsx
// Checkbox for boolean params.

import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';

import './BooleanEditor.css';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

export function BooleanEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const updateParam = useArxmlStore((s) => s.updateParam);
  if (value.type !== 'boolean') return <span className="text-red-500">type mismatch</span>;

  return (
    <input
      type="checkbox"
      checked={value.value}
      aria-label={`${paramKey} value`}
      className="boolean-editor"
      onChange={(e) =>
        updateParam(containerPath, paramKey, { type: 'boolean', value: e.target.checked })
      }
    />
  );
}
