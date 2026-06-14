// renderer/components/editor/ParamEditor.tsx
// Right-pane parameter editor for the currently-selected tree node.
// Routes each param to the matching mode-specific sub-editor via selectParamMode.

import { findByPath } from '@core/arxml/path';
import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../store/useArxmlStore';

import { selectParamMode } from './modes';
import { BooleanEditor } from './modes/BooleanEditor';
import { EnumEditor } from './modes/EnumEditor';
import { FloatEditor } from './modes/FloatEditor';
import { IntegerEditor } from './modes/IntegerEditor';
import { MultilineEditor } from './modes/MultilineEditor';
import { ReferenceEditor } from './modes/ReferenceEditor';
import { StringEditor } from './modes/StringEditor';

interface ModeProps {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

/**
 * Map ParamEditMode -> component. ParamEditor imports each sub-editor
 * directly here to avoid runtime indirection (RSC / SSR friendly) and
 * to keep `modes.ts` framework-free.
 */
const MODE_COMPONENT_MAP: Record<
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

/** CSS class per type used for the type badge column. */
function typeBadgeClass(type: ParamValue['type']): string {
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

export function ParamEditor(): JSX.Element {
  const doc = useArxmlStore((s) => s.doc);
  const selectedPath = useArxmlStore((s) => s.selectedPath);

  if (doc === null || selectedPath === null) {
    return (
      <section
        className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        aria-label="Parameter editor"
      >
        Open an ARXML file and select a node in the tree to edit its parameters.
      </section>
    );
  }

  const found = findByPath(doc, selectedPath);
  if (found === null || (found.element.kind !== 'module' && found.element.kind !== 'container')) {
    return (
      <section
        className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        aria-label="Parameter editor"
      >
        Selected node has no editable parameters.
      </section>
    );
  }

  const { element } = found;
  const entries = Object.entries(element.params);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      aria-label="Parameter editor"
    >
      <header className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{element.shortName}</h2>
        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {element.kind}
        </span>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No parameters on this node.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="py-1 pr-2">Param</th>
              <th className="py-1 pr-2">Type</th>
              <th className="py-1">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, val]) => {
              const mode = selectParamMode(val, key);
              const Editor = MODE_COMPONENT_MAP[mode];
              return (
                <tr key={key} className="border-b border-slate-100 dark:border-slate-700">
                  <td className="py-2 pr-2 font-mono text-xs">{key}</td>
                  <td className="py-2 pr-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${typeBadgeClass(val.type)}`}>
                      {val.type}
                    </span>
                  </td>
                  <td className="py-2">
                    <Editor paramKey={key} value={val} containerPath={selectedPath} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
