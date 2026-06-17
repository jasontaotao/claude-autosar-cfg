// renderer/components/editor/ParamEditor.tsx
// Right-pane parameter editor for the currently-selected tree node.
// Routes each param to the matching mode-specific sub-editor via selectParamMode.
//
// Sprint 11 Phase 1 (Option A) i18n: empty-state and column headers
// pass through t(locale, key). Param type names (integer / float / etc.)
// are technical identifiers and stay untranslated — they map directly
// to BSWMD/ECUC standard names that engineers read in English.
//
// Sprint 13 Stage 3.5 (Combined Tree View): in combined mode the
// store's `selectedPath` is prefixed with the source file's basename
// (or `[doc:N]` for same-basename duplicates). We resolve the basename
// via `findByPathMultiDoc` so the editor renders the correct source
// element. `updateParam` already routes via the basename prefix in
// the store, so the per-row Editor components keep emitting the
// unchanged `containerPath` and the store handles the prefix.

import { findByPath, findByPathMultiDoc } from '@core/arxml/path';
import type { ArxmlElement, ParamValue } from '@core/arxml/types';
import { t } from '@shared/i18n';

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
  const documents = useArxmlStore((s) => s.documents);
  const documentPaths = useArxmlStore((s) => s.documentPaths);
  const viewMode = useArxmlStore((s) => s.viewMode);
  const selectedPath = useArxmlStore((s) => s.selectedPath);
  const locale = useArxmlStore((s) => s.locale);

  if ((doc === null && viewMode === 'single') || selectedPath === null) {
    return (
      <section
        className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        aria-label="Parameter editor"
      >
        {t(locale, 'editor.noSelection')}
      </section>
    );
  }
  if (viewMode === 'combined' && documents.length === 0) {
    return (
      <section
        className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        aria-label="Parameter editor"
      >
        {t(locale, 'editor.noSelection')}
      </section>
    );
  }

  // Sprint 13 Stage 3.5 — combined-mode lookup. The selectedPath is
  // prefixed with the source file's basename; findByPathMultiDoc
  // strips the prefix and returns the source document's element.
  let element: ArxmlElement | null = null;
  if (viewMode === 'combined') {
    const hit = findByPathMultiDoc(documents, documentPaths, selectedPath);
    element = hit === null ? null : hit.element;
  } else {
    const found = findByPath(doc!, selectedPath);
    element = found === null ? null : found.element;
  }
  if (element === null || (element.kind !== 'module' && element.kind !== 'container')) {
    return (
      <section
        className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        aria-label="Parameter editor"
      >
        {/* "Selected node has no editable parameters" — same meaning in
            both locales so we reuse the empty-state key from the tree
            (matches the "no entries" voice users already see). */}
        {t(locale, 'tree.empty')}
      </section>
    );
  }

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
              <th className="py-1 pr-2">{t(locale, 'editor.col.param')}</th>
              <th className="py-1 pr-2">{t(locale, 'editor.col.type')}</th>
              <th className="py-1">{t(locale, 'editor.col.value')}</th>
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
