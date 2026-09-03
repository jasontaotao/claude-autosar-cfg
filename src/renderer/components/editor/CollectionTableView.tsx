// renderer/components/editor/CollectionTableView.tsx
// Right-pane table view for a selected tree collection (`collection:` path).
// Transposes the single-instance ParamEditor: rows = collection instances,
// columns = union of the group's param keys, cells = the same mode editors
// (MODE_COMPONENT_MAP) so every edit flows through the existing
// store.updateParam path with the instance's own containerPath — no new
// mutation surface.
//
// Layout: first column (instance shortName) is sticky so wide param sets
// scroll horizontally without losing row identity; clicking the instance
// name selects the instance path and jumps back to the single-instance
// editor.

import { memo, type JSX } from 'react';

import { findByPath, findByPathMultiDoc } from '@core/arxml/path';
import type { ArxmlElement, ParamValue } from '@core/arxml/types';
import { t } from '@shared/i18n/index.js';

import { useArxmlStore } from '../../store/useArxmlStore';
import {
  collectUnionColumns,
  groupSiblingsForCollection,
  parseCollectionKey,
  type CollectionColumn,
} from '../tree/collections.js';

import { MODE_COMPONENT_MAP, typeBadgeClass } from './modeComponents.js';
import { selectParamMode } from './modes';

import './CollectionTableView.css';

/** shortName for the row label / instance path, tolerating non-container kinds. */
function rowShortName(element: ArxmlElement): string {
  if (element.kind === 'reference') return element.shortName ?? element.value;
  if (element.kind === 'unknown') return element.tagName;
  return element.shortName;
}

interface InstanceRowProps {
  readonly element: ArxmlElement;
  readonly columns: readonly CollectionColumn[];
  /** Full tree path of this instance — the editors' containerPath. */
  readonly instancePath: string;
  readonly onSelectInstance: (path: string) => void;
}

/**
 * Custom equality: a row re-renders only when its own element identity
 * changes (immutable updateParam rebuilds the edited instance only) or when
 * the column *set* actually changes (param added/removed). Column arrays are
 * rebuilt on every parent render, so compare contents, not references.
 */
function instanceRowPropsEqual(prev: InstanceRowProps, next: InstanceRowProps): boolean {
  if (prev.element !== next.element) return false;
  if (prev.instancePath !== next.instancePath) return false;
  if (prev.columns.length !== next.columns.length) return false;
  return prev.columns.every((col, i) => {
    const other = next.columns[i];
    return other !== undefined && col.key === other.key && col.type === other.type;
  });
}

const InstanceRow = memo(function InstanceRow({
  element,
  columns,
  instancePath,
  onSelectInstance,
}: InstanceRowProps): JSX.Element {
  const params: Record<string, ParamValue> =
    element.kind === 'module' || element.kind === 'container' ? element.params : {};
  return (
    <tr>
      <th scope="row" className="collection-table__sticky-col">
        <button
          type="button"
          className="collection-table__instance-btn"
          onClick={() => onSelectInstance(instancePath)}
        >
          {rowShortName(element)}
        </button>
      </th>
      {columns.map((col) => {
        const value = params[col.key];
        if (value === undefined) {
          return (
            <td key={col.key}>
              <span
                className="collection-table__empty-cell"
                data-testid={`collection-cell-empty-${col.key}`}
              >
                —
              </span>
            </td>
          );
        }
        const Editor = MODE_COMPONENT_MAP[selectParamMode(value, col.key)];
        return (
          <td key={col.key}>
            <Editor paramKey={col.key} value={value} containerPath={instancePath} />
          </td>
        );
      })}
    </tr>
  );
}, instanceRowPropsEqual);

export function CollectionTableView(): JSX.Element {
  const doc = useArxmlStore((s) => s.doc);
  const documents = useArxmlStore((s) => s.documents);
  const documentPaths = useArxmlStore((s) => s.documentPaths);
  const viewMode = useArxmlStore((s) => s.viewMode);
  const selectedPath = useArxmlStore((s) => s.selectedPath);
  const locale = useArxmlStore((s) => s.locale);
  const select = useArxmlStore((s) => s.select);

  const parsed = selectedPath === null ? null : parseCollectionKey(selectedPath);

  // Resolve the collection's parent container, mirroring ParamEditor's
  // single/combined-mode lookup (combined paths carry a basename prefix).
  let parent: ArxmlElement | null = null;
  if (parsed !== null) {
    if (viewMode === 'combined') {
      const hit = findByPathMultiDoc(documents, documentPaths, parsed.parentPath);
      parent = hit === null ? null : hit.element;
    } else if (doc !== null) {
      const found = findByPath(doc, parsed.parentPath);
      parent = found === null ? null : found.element;
    }
  }

  const group =
    parsed !== null && parent !== null && (parent.kind === 'module' || parent.kind === 'container')
      ? groupSiblingsForCollection(parent.children).get(parsed.groupKey)
      : undefined;
  const elements = group?.elements ?? [];
  const columns = collectUnionColumns(elements);

  if (parsed === null || elements.length === 0) {
    return (
      <section
        className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500"
        aria-label="Parameter editor"
        data-testid="collection-table-empty"
      >
        {t(locale, 'editor.collection.notFound')}
      </section>
    );
  }

  return (
    <section
      className="collection-table-view"
      aria-label="Parameter editor"
      data-testid="collection-table-view"
    >
      <header className="collection-table-view__header">
        <h2 className="text-lg font-semibold text-slate-900">{group?.label}</h2>
        <span className="rounded bg-slate-200 px-2 py-0.5 text-sm font-medium text-slate-700">
          ×{elements.length}
        </span>
      </header>
      <table className="collection-table">
        <thead>
          <tr>
            <th className="collection-table__sticky-col">
              {t(locale, 'editor.collection.instance')}
            </th>
            {columns.map((col) => (
              <th key={col.key}>
                <code>{col.key}</code>{' '}
                <span className={`rounded px-1.5 py-0.5 text-xs ${typeBadgeClass(col.type)}`}>
                  {col.type}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {elements.map((el) => {
            const instancePath = `${parsed.parentPath}/${rowShortName(el)}`;
            return (
              <InstanceRow
                key={instancePath}
                element={el}
                columns={columns}
                instancePath={instancePath}
                onSelectInstance={select}
              />
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
