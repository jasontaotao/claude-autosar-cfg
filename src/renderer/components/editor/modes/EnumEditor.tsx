// renderer/components/editor/modes/EnumEditor.tsx
// S3-T9: schema-aware enum editor.
// When ECUC_SUBSET_SCHEMA has enumLiterals for this exact param path,
// render a <select> with those literals. Otherwise fall back to the
// free-form text input (preserves the Sprint 2 behaviour for unknown
// enum params that aren't in our 46-entry subset).

import { useMemo, type JSX } from 'react';

import type { ParamValue } from '@core/arxml/types';
import { lookupSchema } from '@core/validation';

import { useArxmlStore } from '../../../store/useArxmlStore';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

export function EnumEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const doc = useArxmlStore((s) => s.doc);
  const updateParam = useArxmlStore((s) => s.updateParam);

  // Look up enum literals from the ECUC subset schema for this exact
  // container.path + '/' + paramKey. useMemo so we don't rescan the
  // 46-entry array on every keystroke.
  const literals = useMemo<readonly string[] | null>(() => {
    if (!doc) return null;
    const paramPath = `${containerPath}/${paramKey}`;
    const entry = lookupSchema(paramPath);
    return entry?.enumLiterals ?? null;
  }, [doc, containerPath, paramKey]);

  if (value.type !== 'enum') return <span className="text-red-500">type mismatch</span>;

  // Schema hit: render <select> dropdown with the known literals.
  if (literals !== null && literals.length > 0) {
    return (
      <select
        className="enum-editor"
        value={value.value}
        aria-label={`${paramKey} value (enum)`}
        onChange={(e) =>
          updateParam(containerPath, paramKey, {
            type: 'enum',
            value: e.target.value,
          })
        }
        data-testid={`enum-editor-${paramKey}`}
      >
        {literals.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    );
  }

  // Fallback: free-form text input (preserves Sprint 2 behaviour for
  // enum params not yet in the 46-entry ECUC_SUBSET_SCHEMA subset).
  return (
    <input
      className="enum-editor"
      type="text"
      value={value.value}
      aria-label={`${paramKey} value (enum)`}
      title="No schema entry for this param — free-form text input."
      onChange={(e) =>
        updateParam(containerPath, paramKey, {
          type: 'enum',
          value: e.target.value,
        })
      }
      data-testid={`enum-editor-text-${paramKey}`}
    />
  );
}
