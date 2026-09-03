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
import { hasBswmdForModule } from '@core/ecuc/moduleMatch';
import { t } from '@shared/i18n/index.js';

import { useArxmlStore } from '../../store/useArxmlStore';
import { prompt } from '../PromptDialog';
import { COLLECTION_PATH_PREFIX } from '../tree/collections.js';

import { CollectionTableView } from './CollectionTableView.js';
import { ParamEditorEmptyState } from './ParamEditorEmptyState.js';
import { MODE_COMPONENT_MAP, typeBadgeClass } from './modeComponents.js';
import { selectParamMode } from './modes';

export interface ParamEditorProps {
  /** Wired by App from useProjectActions().openProjectFromDialog. */
  readonly onOpenProject?: () => void;
  /** Wired by App from useProjectActions().newProject. */
  readonly onNewProject?: () => void;
}

export function ParamEditor({ onOpenProject, onNewProject }: ParamEditorProps = {}): JSX.Element {
  const doc = useArxmlStore((s) => s.doc);
  const documents = useArxmlStore((s) => s.documents);
  const documentPaths = useArxmlStore((s) => s.documentPaths);
  const viewMode = useArxmlStore((s) => s.viewMode);
  const selectedPath = useArxmlStore((s) => s.selectedPath);
  const locale = useArxmlStore((s) => s.locale);
  // Sprint 15 Phase 3.5 — mutation surface. The two `+ Add` buttons call
  // `openBswmdPicker` (which the BswmdPickerDialog root mounted in
  // `App.tsx` picks up via a selector). The `×` delete button on each
  // row calls `deleteParameter` directly — single-action, no cascade
  // confirm (references are not allowed to point at primitive params).
  const openBswmdPicker = useArxmlStore((s) => s.openBswmdPicker);
  const deleteParameter = useArxmlStore((s) => s.deleteParameter);

  if ((doc === null && viewMode === 'single') || selectedPath === null) {
    // P2 (spec §4.2) — guided empty state replaces the bare hint line.
    return (
      <ParamEditorEmptyState
        locale={locale}
        onOpenProject={onOpenProject}
        onNewProject={onNewProject}
      />
    );
  }
  if (viewMode === 'combined' && documents.length === 0) {
    return (
      <section
        className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500"
        aria-label="Parameter editor"
      >
        {t(locale, 'editor.noSelection')}
      </section>
    );
  }

  // Collection table route — a `collection:` selectedPath names a synthetic
  // tree group, not a real node, so it must be intercepted before the
  // findByPath lookup below (which would return null and mis-render the
  // "no editable parameters" empty state).
  if (selectedPath.startsWith(COLLECTION_PATH_PREFIX)) {
    return <CollectionTableView />;
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
        className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500"
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

  // Sprint 13+ Q2 — EcuC-style two-segment grouping. Params are
  // sorted into a "value" bucket (all non-reference types) and a
  // "reference" bucket. Each bucket renders its own heading with a
  // count badge and a table; an empty bucket still renders the
  // heading + a localised "(none)" row so the layout does not jump
  // when the user navigates between nodes with different param mixes.
  const valueEntries = entries.filter(([, v]) => v.type !== 'reference');
  const referenceEntries = entries.filter(([, v]) => v.type === 'reference');

  // Sprint post-v1.0.0 — extracted to core/ecuc/moduleMatch so the
  // `sourceBswmdPath` priority (A) can override the path-segment fallback
  // (B) for ECUC files created via the BSWMD picker. The button stays
  // disabled when neither source nor path-segment match any loaded BSWMD
  // schema; the tooltip mirrors `mutation.error.no-bswmd-for-module`.
  const hasBswmdForModuleValue = hasBswmdForModule(useArxmlStore.getState(), selectedPath);

  const handleRenameContainer = (): void => {
    if (element.kind !== 'container') return;
    void prompt({
      message: t(locale, 'mutation.prompt.instanceName'),
      defaultValue: element.shortName,
    }).then((newShortName) => {
      if (newShortName === null) return;
      useArxmlStore.getState().renameContainer(selectedPath, newShortName);
    });
  };

  return (
    <section
      className="param-editor h-full min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Parameter editor"
    >
      <header className="mb-4 flex items-center gap-2">
        {/* Sprint 13+ Q2 — explicit text-slate-900 so the element
            shortName is unambiguously visible. The previous
            `text-lg font-semibold` left the color to inherit, which
            could collapse to a low-contrast tone in certain
            light-mode backgrounds. */}
        <h2 className="text-lg font-semibold text-slate-900">{element.shortName}</h2>
        {element.kind === 'container' && (
          <button
            type="button"
            data-testid="param-editor-rename"
            aria-label={t(locale, 'mutation.action.renameContainer')}
            title={t(locale, 'mutation.action.renameContainer')}
            onClick={handleRenameContainer}
            className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            ✎
          </button>
        )}
        <span
          className="rounded bg-slate-200 px-2 py-0.5 text-sm font-medium text-slate-700"
          data-testid="editor-kind-badge"
        >
          {element.kind}
        </span>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">{t(locale, 'editor.params.empty')}</p>
      ) : (
        <div className="space-y-5">
          <ParamCategorySection
            label={t(locale, 'params.category.value', { count: valueEntries.length })}
            emptyLabel={t(locale, 'params.category.empty')}
            entries={valueEntries}
            selectedPath={selectedPath}
            columnHeaders={{
              param: t(locale, 'editor.col.param'),
              type: t(locale, 'editor.col.type'),
              value: t(locale, 'editor.col.value'),
            }}
            onDeleteParameter={deleteParameter}
            testId="editor-category-value"
          />
          <ParamCategorySection
            label={t(locale, 'params.category.reference', { count: referenceEntries.length })}
            emptyLabel={t(locale, 'params.category.empty')}
            entries={referenceEntries}
            selectedPath={selectedPath}
            columnHeaders={{
              param: t(locale, 'editor.col.param'),
              type: t(locale, 'editor.col.type'),
              value: t(locale, 'editor.col.value'),
            }}
            onDeleteParameter={deleteParameter}
            testId="editor-category-reference"
          />
        </div>
      )}

      {/* Sprint 15 Phase 3.5 — mutation footer. Two `+ Add` buttons
          that open the BSWMD-driven picker (handled by
          BswmdPickerDialog root in App.tsx). The buttons are
          disabled when no BSWMD is loaded for the current module —
          the tooltip mirrors `mutation.error.no-bswmd-for-module`
          so the user understands the gate. The footer is only
          rendered when a module/container is selected (the early
          return above handles the reference / no-selection cases). */}
      <footer
        className="mt-4 flex gap-2 border-t border-slate-200 pt-3"
        data-testid="param-editor-footer"
      >
        <button
          type="button"
          onClick={() => openBswmdPicker({ parentPath: selectedPath, kind: 'parameter' })}
          data-testid="param-editor-add-parameter"
          disabled={!hasBswmdForModuleValue}
          title={
            hasBswmdForModuleValue ? undefined : t(locale, 'mutation.error.no-bswmd-for-module')
          }
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t(locale, 'mutation.action.addParameter')}
        </button>
        <button
          type="button"
          onClick={() => openBswmdPicker({ parentPath: selectedPath, kind: 'reference' })}
          data-testid="param-editor-add-reference"
          disabled={!hasBswmdForModuleValue}
          title={
            hasBswmdForModuleValue ? undefined : t(locale, 'mutation.error.no-bswmd-for-module')
          }
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t(locale, 'mutation.action.addReference')}
        </button>
      </footer>
    </section>
  );
}

interface ParamCategorySectionProps {
  readonly label: string;
  readonly emptyLabel: string;
  readonly entries: ReadonlyArray<readonly [string, ParamValue]>;
  readonly selectedPath: string;
  readonly columnHeaders: { readonly param: string; readonly type: string; readonly value: string };
  readonly testId: string;
  // Sprint 15 Phase 3.5 — per-row delete handler. The parent component
  // closes over `deleteParameter` from the store and passes it down so
  // each row's × button can fire `deleteParameter(containerPath, key)`
  // without the section knowing about the store directly.
  readonly onDeleteParameter: (containerPath: string, paramKey: string) => void;
}

/** Render one EcuC-style category section: a heading with a count
 *  badge, and a table of (param, type, value, action) rows. When the category
 *  is empty the heading still appears and the table is replaced with a
 *  single "(none)" row so the surrounding layout does not shift. */
function ParamCategorySection({
  label,
  emptyLabel,
  entries,
  selectedPath,
  columnHeaders,
  testId,
  onDeleteParameter,
}: ParamCategorySectionProps): JSX.Element {
  return (
    <section data-testid={testId} aria-label={label}>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">{label}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-2 text-slate-700">{columnHeaders.param}</th>
            <th className="py-1 pr-2 text-slate-700">{columnHeaders.type}</th>
            <th className="py-1 text-slate-700">{columnHeaders.value}</th>
            {/* Sprint 15 Phase 3.5 — Action column. The header stays
                empty (visually a thin column) so the per-row × buttons
                align in a dedicated lane; the aria-label still calls
                it the "Action" column for screen readers. */}
            <th className="w-8 py-1 text-slate-700" aria-label="Action" />
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-2 text-center text-xs italic text-slate-400">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            entries.map(([key, val]) => {
              const mode = selectParamMode(val, key);
              const Editor = MODE_COMPONENT_MAP[mode];
              return (
                <tr key={key} className="border-b border-slate-100 text-slate-900">
                  <td className="py-2 pr-2 font-mono text-xs text-slate-900">{key}</td>
                  <td className="py-2 pr-2 text-slate-900">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${typeBadgeClass(val.type)}`}>
                      {val.type}
                    </span>
                  </td>
                  <td className="py-2 text-slate-900">
                    <Editor paramKey={key} value={val} containerPath={selectedPath} />
                  </td>
                  {/* Sprint 15 Phase 3.5 — per-row × delete button. No
                      confirm dialog (deleteParameter is a low-risk
                      single action — references are not allowed to
                      point at primitive params per the spec, so there
                      is no cascade to worry about). The testid is
                      keyed by param name so tests can target a
                      specific row. */}
                  <td className="py-2 text-slate-900">
                    <button
                      type="button"
                      onClick={() => onDeleteParameter(selectedPath, key)}
                      data-testid={`param-row-delete-${key}`}
                      aria-label={t(
                        useArxmlStore.getState().locale,
                        'mutation.action.deleteParameter',
                        { name: key },
                      )}
                      title={t(useArxmlStore.getState().locale, 'mutation.action.deleteParameter')}
                      className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
