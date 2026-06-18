// BswmdPickerDialog — Sprint 15 / Phase 3.2.
//
// BSWMD-driven picker for adding sub-containers / parameters / references.
// Renders a search input + a per-element list grouped by kind. Single-pick +
// Done model: clicking a row highlights it; clicking "Done" commits via the
// matching store action and closes the dialog.
//
// State is store-driven: the dialog reads `useArxmlStore.bswmdPicker` and
// reacts to `openBswmdPicker` / `closeBswmdPicker`. No module-level
// externalSetState pattern is used (unlike ConfirmDialog / CascadeDialog)
// because the picker is opened from a context-menu action and the host
// (Tree → ContextMenu → store) already owns the visibility flag.
//
// Resolution flow when the picker opens:
//   1. Read `bswmdPicker.parentPath` and `bswmdPicker.kind` from the store.
//   2. Find the source document (active doc in single mode; routed via
//      `findByPathMultiDoc` in combined mode).
//   3. Find the parent element in the doc (locate by path).
//   4. Find the matching BSWMD module + parent ContainerDef via
//      `resolveModuleAndParentContainer` (mirrors the store's own helper).
//   5. Call `listAllowedSubElements(moduleDef, parentContainerDef, parentElement)`.
//   6. Filter by kind + search substring; render rows.
//
// z-index 9995 — sits BELOW CascadeConfirmDialog (9996) and
// ConfirmDialog (9998) so a dirty-guard or cascade dialog can override
// an open picker.

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { listAllowedSubElements } from '@core/arxml/mutation.js';
import type {
  AllowedSubElement,
  MutationError,
} from '@core/arxml/mutation.js';
import { findByPathMultiDoc } from '@core/arxml/path.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
} from '@core/arxml/types';
import { getContainerDefByPath } from '@core/project/bswmd.js';
import type { BswModuleDef } from '@core/project/bswmd.js';
import { t } from '@shared/i18n.js';
import type { Locale } from '@shared/i18n.js';

import { useArxmlStore } from '../store/useArxmlStore.js';

import './BswmdPickerDialog.css';

export type PickerKind = 'container' | 'parameter' | 'reference';

/**
 * Mapping from the picker's row kind → the i18n key that drives the dialog
 * title (and the store action that Done dispatches).
 */
const KIND_TO_TITLE_KEY: Readonly<Record<PickerKind, 'mutation.action.addContainer' | 'mutation.action.addParameter' | 'mutation.action.addReference'>> = {
  container: 'mutation.action.addContainer',
  parameter: 'mutation.action.addParameter',
  reference: 'mutation.action.addReference',
};

interface ResolvedPickerSource {
  readonly moduleDef: BswModuleDef;
  readonly parentContainerDef: ReturnType<typeof getContainerDefByPath>;
  readonly parentElement: ArxmlContainer | ArxmlModule;
  readonly allowed: readonly AllowedSubElement[];
  readonly errorKind: 'no-bswmd-for-module' | 'path-not-found' | 'no-type-info' | null;
}

/**
 * Walk the documents + BSWMD schemas to produce the allowed-element list
 * for the given parent path. Returns a tagged result so the dialog can
 * render an error / empty state without throwing.
 */
function resolvePickerSource(
  parentPath: string,
  kind: PickerKind,
  state: ReturnType<typeof useArxmlStore.getState>,
): ResolvedPickerSource | null {
  if (state.documents.length === 0) return null;
  let sourceDoc: ArxmlDocument | null = null;
  let innerPath = parentPath;
  if (state.viewMode === 'combined') {
    const hit = findByPathMultiDoc(state.documents, state.documentPaths, parentPath);
    if (hit === null) return null;
    sourceDoc = hit.doc;
    // The picker doesn't need to strip the combined prefix for the
    // BSWMD lookup because the BSWMD lookup helper resolves by
    // module shortName (segments[1]), not by full path.
    innerPath = parentPath;
  } else {
    if (state.doc === null) return null;
    sourceDoc = state.doc;
  }
  // Find parent element by walking the value-side path.
  const parentElement = locateParentElement(sourceDoc, innerPath);
  if (parentElement === null) {
    return {
      moduleDef: null as never,
      parentContainerDef: null,
      parentElement: null as never,
      allowed: [],
      errorKind: 'path-not-found',
    };
  }
  // Find the module def. The BSWMD lookup is "module shortName" → the
  // second segment of the path. We delegate the same lookup the store
  // does (resolveModuleAndParentContainer is private), so we duplicate
  // the shape here.
  const lookup = resolveModuleAndParentContainerLocal(state.bswmdSchemas, parentPath);
  if (lookup === null) {
    return {
      moduleDef: null as never,
      parentContainerDef: null,
      parentElement,
      allowed: [],
      errorKind: 'no-bswmd-for-module',
    };
  }
  const { moduleDef, parentContainerDef } = lookup;
  // No parentContainerDef means the parent IS the module root; in that
  // case we still want the module's top-level containers, but
  // `listAllowedSubElements` needs a ContainerDef. Fall back to
  // synthesising one from the module's top-level containers + params.
  let containerDefForList = parentContainerDef;
  if (containerDefForList === null) {
    if (parentElement.kind !== 'module') {
      return {
        moduleDef,
        parentContainerDef: null,
        parentElement,
        allowed: [],
        errorKind: 'no-type-info',
      };
    }
    // Synthesise a synthetic container def from the module's top-level
    // shape so `listAllowedSubElements` can be called uniformly. The
    // synthesised def has the module's own containers / parameters /
    // references flattened in.
    containerDefForList = {
      shortName: moduleDef.shortName,
      path: moduleDef.path,
      lowerMultiplicity: moduleDef.lowerMultiplicity,
      upperMultiplicity: moduleDef.upperMultiplicity,
      subContainers: moduleDef.containers,
      parameters: [],
      references: [],
      choices: [],
    };
  }
  const allowed = listAllowedSubElements(moduleDef, containerDefForList, parentElement);
  return {
    moduleDef,
    parentContainerDef,
    parentElement,
    allowed,
    errorKind: null,
  };
}

/**
 * Inlined version of the store's `resolveModuleAndParentContainer`
 * helper — duplicated here to avoid widening the store's import
 * surface (the store doesn't export the helper). Same algorithm,
 * same return shape.
 */
function resolveModuleAndParentContainerLocal(
  schemas: readonly { readonly modules: readonly BswModuleDef[] }[],
  valuePath: string,
): { readonly moduleDef: BswModuleDef; readonly parentContainerDef: ReturnType<typeof getContainerDefByPath> } | null {
  const segments = valuePath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const moduleShortName = segments[1];
  if (moduleShortName === undefined) return null;
  for (const schema of schemas) {
    for (const mod of schema.modules) {
      if (mod.shortName !== moduleShortName) continue;
      const subSegments = segments.slice(2);
      const subPath = subSegments.join('/');
      const parentContainerDef = subPath === '' ? null : getContainerDefByPath(mod, subPath);
      return { moduleDef: mod, parentContainerDef };
    }
  }
  return null;
}

/**
 * Walk the doc to find the parent module / container at `parentPath`.
 * Returns `null` if the path doesn't resolve.
 */
function locateParentElement(
  doc: ArxmlDocument,
  parentPath: string,
): ArxmlContainer | ArxmlModule | null {
  const segments = parentPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [pkgName, ...rest] = segments;
  if (pkgName === undefined) return null;
  const rootPkg = doc.packages.find((p) => p.shortName === pkgName);
  if (rootPkg === undefined) return null;
  let cursor: ArxmlElement | ArxmlPackage = rootPkg;
  for (const name of rest) {
    if ('kind' in cursor) {
      if (cursor.kind === 'reference') return null;
      const child = (cursor as ArxmlContainer | ArxmlModule).children.find(
        (c) => c.shortName === name,
      );
      if (child === undefined || child.kind === 'reference') return null;
      cursor = child;
      continue;
    }
    // Package: look in elements.
    const child = cursor.elements.find((e) => e.shortName === name);
    if (child === undefined || child.kind === 'reference') return null;
    cursor = child;
  }
  if ('kind' in cursor && (cursor.kind === 'module' || cursor.kind === 'container')) {
    return cursor;
  }
  return null;
}

/**
 * Localized error message for the no-bswmd / path-not-found cases the
 * picker can hit. We surface these in the dialog body so the user
 * understands why nothing is selectable.
 */
function errorMessage(locale: Locale, kind: MutationError['kind']): string {
  switch (kind) {
    case 'no-bswmd-for-module':
      return t(locale, 'mutation.error.no-bswmd-for-module');
    case 'path-not-found':
      return t(locale, 'mutation.error.path-not-found');
    default:
      return '';
  }
}

/**
 * BswmdPickerRoot — mount once at the app root. Returns `null` when no
 * picker is active so the host doesn't pay a render cost on every
 * frame.
 */
export function BswmdPickerRoot(): JSX.Element | null {
  const picker = useArxmlStore((s) => s.bswmdPicker);
  const locale = useArxmlStore((s) => s.locale);
  const closePicker = useArxmlStore((s) => s.closeBswmdPicker);
  const addContainer = useArxmlStore((s) => s.addContainer);
  const addParameter = useArxmlStore((s) => s.addParameter);
  // Local form state. Reset implicitly when the picker closes (the
  // host flips `bswmdPicker.open` to false and we re-render at the
  // top of the next open).
  const [search, setSearch] = useState('');
  const [selectedShortName, setSelectedShortName] = useState<string | null>(null);

  const resolution = useMemo(() => {
    if (!picker.open || picker.parentPath === null || picker.kind === null) return null;
    // Pull the latest state on every render so the resolution tracks
    // document / bswmd updates between opens.
    const state = useArxmlStore.getState();
    return resolvePickerSource(picker.parentPath, picker.kind, state);
  }, [picker.open, picker.parentPath, picker.kind]);

  if (!picker.open || picker.parentPath === null || picker.kind === null) {
    return null;
  }

  // If the source has a hard error (no BSWMD / path not found) render
  // the body but with an error message instead of a list.
  const isError = resolution !== null && resolution.errorKind !== null;
  const allowed = (resolution?.allowed ?? []).filter((a) => a.kind === picker.kind);
  const lowerSearch = search.toLowerCase();
  const filtered = lowerSearch === ''
    ? allowed
    : allowed.filter((a) => a.shortName.toLowerCase().includes(lowerSearch));
  const enabledRows = filtered.filter((a) => !a.disabled);
  const disabledRows = filtered.filter((a) => a.disabled);
  const allAtMax = filtered.length > 0 && enabledRows.length === 0;
  const titleKey = KIND_TO_TITLE_KEY[picker.kind];

  const handleCancel = (): void => {
    setSearch('');
    setSelectedShortName(null);
    closePicker();
  };

  const handleBackdropClick = (): void => {
    handleCancel();
  };

  const handleDialogClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleRowClick = (a: AllowedSubElement): void => {
    if (a.disabled) return;
    setSelectedShortName((prev) => (prev === a.shortName ? null : a.shortName));
  };

  const handleDone = (): void => {
    if (selectedShortName === null) return;
    const parentPath = picker.parentPath;
    if (parentPath === null) return;
    // Snapshot the current error so we can tell whether the action
    // succeeded (clears error) or failed (sets a new error). We
    // close the dialog only on success — a failure keeps the picker
    // open so the user can adjust the pick.
    const errorBefore = useArxmlStore.getState().error;
    if (picker.kind === 'container') {
      addContainer(parentPath, selectedShortName);
    } else if (picker.kind === 'parameter' || picker.kind === 'reference') {
      addParameter(parentPath, selectedShortName);
    }
    const errorAfter = useArxmlStore.getState().error;
    if (errorAfter === null || errorAfter === errorBefore) {
      // Action succeeded (no new error surfaced) — close the dialog.
      closePicker();
    }
    setSearch('');
    setSelectedShortName(null);
  };

  const formatMultiplicity = (a: AllowedSubElement): string => {
    const { lower, upper, current } = a.multiplicity;
    const upperStr = upper === 'infinite' ? '*' : String(upper);
    return `${lower}..${upperStr}  (${current})`;
  };

  return createPortal(
    <div
      className="bspd-overlay"
      data-testid="bspd-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <div
        className="bspd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bspd-title"
        onClick={handleDialogClick}
      >
        <div className="bspd-header">
          <h2 id="bspd-title" data-testid="bspd-title" className="bspd-title">
            {t(locale, titleKey)}
          </h2>
          <div className="bspd-parent" data-testid="bspd-parent">
            {picker.parentPath}
          </div>
        </div>
        <div className="bspd-body">
          {isError && resolution !== null ? (
            <div className="bspd-error" data-testid="bspd-error">
              {errorMessage(locale, resolution.errorKind as MutationError['kind'])}
            </div>
          ) : (
            <>
              <input
                type="text"
                className="bspd-search"
                data-testid="bspd-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                autoComplete="off"
                spellCheck={false}
              />
              {filtered.length === 0 ? (
                <div className="bspd-empty" data-testid="bspd-empty">
                  {allAtMax
                    ? t(locale, 'mutation.error.multiplicity-exceeded', { current: 0, max: 0 })
                    : t(locale, 'common.cancel')}
                </div>
              ) : (
                <ul className="bspd-list" role="listbox">
                  {enabledRows.map((a) => (
                    <li
                      key={`enabled-${a.shortName}`}
                      data-testid={`bspd-row-${a.shortName}`}
                      data-shortname={a.shortName}
                      className={`bspd-row${selectedShortName === a.shortName ? ' bspd-row-selected' : ''}`}
                      onClick={() => handleRowClick(a)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowClick(a);
                        }
                      }}
                      tabIndex={0}
                      role="option"
                      aria-selected={selectedShortName === a.shortName}
                    >
                      <span className="bspd-row-label">
                        {a.shortName}
                      </span>
                      <span className="bspd-row-mult">{formatMultiplicity(a)}</span>
                    </li>
                  ))}
                  {disabledRows.map((a) => (
                    <li
                      key={`disabled-${a.shortName}`}
                      data-testid={`bspd-row-${a.shortName}`}
                      data-shortname={a.shortName}
                      className="bspd-row bspd-row-disabled"
                      aria-disabled="true"
                      title={a.disabledReason === 'at-max' ? 'max reached' : 'disabled'}
                    >
                      <span className="bspd-row-label">
                        {a.shortName}
                      </span>
                      <span className="bspd-row-mult">{formatMultiplicity(a)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="bspd-footer">
          <button
            type="button"
            className="bspd-btn bspd-btn-cancel"
            data-testid="bspd-cancel"
            onClick={handleCancel}
          >
            {t(locale, 'common.cancel')}
          </button>
          <button
            type="button"
            className="bspd-btn bspd-btn-done"
            data-testid="bspd-done"
            onClick={handleDone}
            disabled={selectedShortName === null}
          >
            {t(locale, 'common.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Imperative open/close helpers. Mirrors the `openBswmdPicker` /
 * `closeBswmdPicker` store actions so callers can pick the
 * function-style API or the store-style API.
 */
export function openBswmdPicker(target: {
  readonly parentPath: string;
  readonly kind: PickerKind;
}): void {
  useArxmlStore.getState().openBswmdPicker(target);
}

export function closeBswmdPicker(): void {
  useArxmlStore.getState().closeBswmdPicker();
}
