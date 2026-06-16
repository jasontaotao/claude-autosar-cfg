// renderer/components/editor/modes/ReferenceEditor.tsx
// Reference path input with a DEST badge.
// F2 keeps the editor as a plain text input — autocomplete against the
// package index is a later-sprint feature.

import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

export function ReferenceEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const updateParam = useArxmlStore((s) => s.updateParam);
  if (value.type !== 'reference') return <span className="text-red-500">type mismatch</span>;

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value.value}
        aria-label={`${paramKey} reference path`}
        placeholder="/EAS/Com/SomeSignal"
        className="flex-1 rounded border border-slate-300 px-2 py-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-800"
        onChange={(e) =>
          updateParam(containerPath, paramKey, {
            type: 'reference',
            value: e.target.value,
            // Sprint 10 #3 — preserve the ECUC DEST attribute
            // (CONTAINER-VALUE / REFERENCE-DEF / FOREIGN-REFERENCE-DEF)
            // across edits. Pre-fix, the spread was missing `dest`, so
            // the first user edit dropped the attribute, disabling
            // checkRefDests (Sprint 9 #2) for that site and corrupting
            // round-tripped ARXML.
            ...(value.dest !== undefined ? { dest: value.dest } : {}),
          })
        }
      />
      <span className="rounded bg-purple-600 px-2 py-0.5 text-xs text-white">REF</span>
    </div>
  );
}
