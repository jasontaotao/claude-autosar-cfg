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
import type { AllowedSubElement, MutationError } from '@core/arxml/mutation.js';
import { findByPath } from '@core/arxml/path.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
} from '@core/arxml/types';
import { getContainerDefByPath } from '@core/project/bswmd.js';
import type { BswModuleDef } from '@core/project/bswmd.js';
import { t } from '@shared/i18n.js';
import type { Locale } from '@shared/i18n.js';

import { resolveContainerTarget, useArxmlStore } from '../store/useArxmlStore.js';

import './BswmdPickerDialog.css';

export type PickerKind = 'container' | 'parameter' | 'reference';

/**
 * Mapping from the picker's row kind → the i18n key that drives the dialog
 * title (and the store action that Done dispatches).
 */
const KIND_TO_TITLE_KEY: Readonly<
  Record<
    PickerKind,
    'mutation.action.addContainer' | 'mutation.action.addParameter' | 'mutation.action.addReference'
  >
> = {
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
  _kind: PickerKind,
  state: ReturnType<typeof useArxmlStore.getState>,
): ResolvedPickerSource | null {
  if (state.documents.length === 0) return null;
  // Sprint 17c T8 — use the shared `resolveContainerTarget` helper so
  // the picker's "find the source doc" block matches the store's own
  // action-level dispatch. The helper returns null when no source
  // resolves (unknown basename / [doc:N] / null active doc).
  const target = resolveContainerTarget(state, parentPath);
  if (target === null) return null;
  const sourceDoc: ArxmlDocument = target.doc;
  // The picker doesn't need to strip the combined prefix for the
  // BSWMD lookup because the BSWMD lookup helper resolves by module
  // shortName (segments[1]), not by full path. innerPath mirrors
  // the helper's contract: identical to parentPath in both modes.
  const innerPath: string = target.innerPath;
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
      // v1.4.1 — synthesized def carries the module's own MCC; the
      // picker's chip badge reads it from here. `?? []` so a hand-built
      // module def without the field still type-checks.
      multiplicityConfigClasses: moduleDef.multiplicityConfigClasses ?? [],
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
): {
  readonly moduleDef: BswModuleDef;
  readonly parentContainerDef: ReturnType<typeof getContainerDefByPath>;
} | null {
  const segments = valuePath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const pkgName = segments[0];
  if (pkgName === undefined) return null;
  // Canonical 4-segment walk first (segments[1] is module shortName).
  const moduleShortName = segments[1];
  if (moduleShortName !== undefined) {
    for (const schema of schemas) {
      for (const mod of schema.modules) {
        if (mod.shortName !== moduleShortName) continue;
        const subSegments = segments.slice(2);
        const subPath = subSegments.join('/');
        const parentContainerDef =
          subPath === '' ? null : getContainerDefByPath(mod, subPath);
        if (parentContainerDef !== null || subPath === '') {
          return { moduleDef: mod, parentContainerDef };
        }
      }
    }
  }
  // Compressed 3-segment fallback (companion to `findByPath` in
  // core/arxml/path.ts:78-87): when `<pkg>`'s shortName equals the
  // module shortName (e.g. project `JWQ3399` whose package + module
  // both name themselves `JWQ3399`), `segments[1]` is the top-level
  // container shortName. Treat `segments.slice(1)` as the BSWMD sub-path.
  for (const schema of schemas) {
    for (const mod of schema.modules) {
      if (mod.shortName !== pkgName) continue;
      const subSegments = segments.slice(1);
      const subPath = subSegments.join('/');
      const parentContainerDef = getContainerDefByPath(mod, subPath);
      if (parentContainerDef !== null) {
        return { moduleDef: mod, parentContainerDef };
      }
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
  // Bug 2c (v1.4.1) — delegate to `findByPath` so the picker accepts BOTH
  // canonical 4-segment (`/<pkg>/<module>/<container>/…`) AND compressed
  // 3-segment (`/<pkg>/<container>/…`) paths. The latter is what some user
  // dispatchers produce when `pkg.shortName === module.shortName`.
  const found = findByPath(doc, parentPath);
  if (found === null) return null;
  const { element } = found;
  // The picker only navigates module/container parents — reference and
  // unknown leaves return null even when path-walking succeeded.
  if (element.kind !== 'module' && element.kind !== 'container') return null;
  return element;
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
  const addReference = useArxmlStore((s) => s.addReference);
  // Sprint 17c T9 — subscribe to the document set so the picker
  // re-resolves when a document is loaded or removed while the
  // picker is open. Previously the memo's deps were
  // `[picker.open, picker.parentPath, picker.kind]` and the
  // component only subscribed to `bswmdPicker` / `locale` / the
  // four action callbacks — so an `addDocument` or `removeDocument`
  // did NOT re-render the picker, leaving the memoised resolution
  // pointing at a stale document set. Fine-grained selectors
  // (not the whole `state` object) keep the rules-of-hooks happy
  // and avoid spurious re-renders for unrelated state changes.
  const documents = useArxmlStore((s) => s.documents);
  const documentPaths = useArxmlStore((s) => s.documentPaths);
  // Local form state. Reset implicitly when the picker closes (the
  // host flips `bswmdPicker.open` to false and we re-render at the
  // top of the next open).
  const [search, setSearch] = useState('');
  const [selectedShortName, setSelectedShortName] = useState<string | null>(null);

  const resolution = useMemo(() => {
    if (!picker.open || picker.parentPath === null || picker.kind === null) return null;
    // Read state fresh on each memo run — `useArxmlStore.getState()` is a
    // stable import (not a captured hook value), so it doesn't appear in
    // deps. `documents` + `documentPaths` ARE in deps as intentional
    // triggers: when the document set changes, the memo re-runs and
    // `getState()` returns the fresh state, fixing the T9 stale-seed bug
    // where the picker kept showing the original active-doc resolution.
    const state = useArxmlStore.getState();
    return resolvePickerSource(picker.parentPath, picker.kind, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional triggers; values consumed via getState()
  }, [picker.open, picker.parentPath, picker.kind, documents, documentPaths]);

  if (!picker.open || picker.parentPath === null || picker.kind === null) {
    return null;
  }

  // If the source has a hard error (no BSWMD / path not found) render
  // the body but with an error message instead of a list.
  const isError = resolution !== null && resolution.errorKind !== null;
  const allowed = (resolution?.allowed ?? []).filter((a) => a.kind === picker.kind);
  const lowerSearch = search.toLowerCase();
  const filtered =
    lowerSearch === ''
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
    } else if (picker.kind === 'parameter') {
      addParameter(parentPath, selectedShortName);
    } else if (picker.kind === 'reference') {
      addReference(parentPath, selectedShortName);
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
                placeholder={t(locale, 'picker.search.placeholder')}
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
                      <span className="bspd-row-label">{a.shortName}</span>
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
                      title={
                        a.disabledReason === 'at-max'
                          ? t(locale, 'picker.tooltip.atMax', {
                              current: a.multiplicity.current,
                              max: String(a.multiplicity.upper),
                            })
                          : 'disabled'
                      }
                    >
                      <span className="bspd-row-label">{a.shortName}</span>
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
