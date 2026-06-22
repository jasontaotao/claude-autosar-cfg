// ProjectPanel — Sprint 11 Phase 1 + Sprint 12 #2 Task 5.
//
// Sidebar section that surfaces project metadata when a project is open.
// Lives above the Tree in the left-column. Shows:
//   - project name + manifest path (tooltip)
//   - list of value-side ARXMLs (basename + remove button)
//   - list of BSWMDs (basename + remove button, Sprint 12 #2)
//   - Close Project button
//
// Sprint 13 refactor: this file now ONLY exports `ProjectPanelInfo` —
// the open-mode render. Loose mode (no project open) is handled by
// `FileListTab` which renders its own compact New/Open header inline.
// The top-level `ProjectPanel` switch was removed because the new
// `LeftPanel` decides which tab to show; the "project" tab is hidden
// in loose mode, so ProjectPanel only needs the open branch.
//
// Sprint 11 Phase 1 (Option A) i18n: every visible string goes through
// t(locale, key) so the panel flips between zh-CN and en with the
// AppHeader locale toggle.

import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';

import type { BswmdDocument } from '@core/project/bswmd.js';
import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';
import { basename, bswmdKeyFor } from '@shared/path';
import type { ProjectManifest } from '@shared/project';

import { useArxmlStore } from '../store/useArxmlStore';

import { openContextMenu } from './ContextMenu';

import './ProjectPanel.css';

interface FileListProps {
  readonly title: string;
  readonly paths: readonly string[];
  readonly emptyHint: string;
  readonly testIdPrefix: string;
  readonly onAdd?: () => void;
  readonly addLabel?: string;
  readonly addAriaLabel?: string;
  readonly onRemove?: (path: string) => void;
  /**
   * Sprint 17 P3 T3.1 — optional row-level right-click handler. When set,
   * FileList attaches an `onContextMenu` to each `<li>` that calls
   * `openContextMenu` with `{path, kind, shortName}` so the global
   * ContextMenu opens with the right target. P3 only enables this for
   * the BSWMD row section (the kind discriminator is `'bswmd'`); ARXML
   * rows keep their existing click-only behavior.
   */
  readonly onContextMenuRow?: (
    path: string,
    e: { readonly clientX: number; readonly clientY: number },
  ) => void;
  /**
   * Sprint 14 / Task 11 — optional row-trailing render prop. When set,
   * FileList renders the returned nodes after the row's remove button
   * (so the trailing widgets sit to the right of `×`). Used by the
   * BSWMD section to inject the `📋 N/M` chip + "+" add-ECUC button.
   *
   * Index is provided so the caller can look up parallel-array data
   * (`bswmdSchemas` against `manifest.bswmdPaths`) without re-computing
   * position itself.
   */
  readonly renderTrailing?: (path: string, index: number) => ReactNode;
}

function FileList({
  title,
  paths,
  emptyHint,
  testIdPrefix,
  onAdd,
  addLabel,
  addAriaLabel,
  onRemove,
  onContextMenuRow,
  renderTrailing,
}: FileListProps): JSX.Element {
  // Read locale on demand so re-renders track the store-level flip
  // without subscribing here (FileList is a small leaf component).
  const locale = useArxmlStore.getState().locale;
  return (
    <div className="project-panel-section">
      <div className="project-panel-section-title-row">
        <div className="project-panel-section-title">{title}</div>
        {onAdd !== undefined && addLabel !== undefined && (
          <button
            type="button"
            className="project-panel-section-add"
            data-testid={`${testIdPrefix}-add`}
            aria-label={addAriaLabel}
            onClick={onAdd}
          >
            {addLabel}
          </button>
        )}
      </div>
      {paths.length === 0 ? (
        <div className="project-panel-empty">{emptyHint}</div>
      ) : (
        <ul className="project-panel-list" data-testid={`${testIdPrefix}-list`}>
          {paths.map((p, idx) => (
            <li
              key={p}
              className="project-panel-list-item"
              // Sprint 17 P3 T3.1 — row-level right-click handler. We
              // preventDefault so the browser's native context menu
              // does not also appear (same UX pattern as the Tree's
              // TreeNode onContextMenu in Sprint 15). The host
              // (ProjectPanelInfo) wires onContextMenuRow only for
              // the BSWMD section; the ARXML section leaves the prop
              // undefined so this handler no-ops.
              onContextMenu={
                onContextMenuRow === undefined
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      onContextMenuRow(p, { clientX: e.clientX, clientY: e.clientY });
                    }
              }
            >
              <span className="project-panel-list-name" title={p}>
                {basename(p)}
              </span>
              {onRemove !== undefined && (
                <button
                  type="button"
                  className="project-panel-list-remove"
                  aria-label={t(locale, 'projectPanel.removeBswmdAria', {
                    name: basename(p),
                  })}
                  data-testid={`${testIdPrefix}-remove-${p}`}
                  onClick={() => onRemove(p)}
                >
                  ×
                </button>
              )}
              {renderTrailing !== undefined && renderTrailing(p, idx)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Props for `ProjectPanelInfo`. The parent (`LeftPanel` in Sprint 13)
 * is responsible for the `project === null` gate and only mounts
 * `ProjectPanelInfo` when both `manifest` and `manifestPath` are
 * non-null. Keeping this component pure (no null guards inside) makes
 * the render path simple and the props contract obvious.
 */
export interface ProjectPanelInfoProps {
  readonly locale: Locale;
  readonly manifest: ProjectManifest;
  readonly manifestPath: string;
  readonly onClose: () => void;
  readonly onRemoveArxml: (path: string) => void;
  readonly onAddBswmd: () => void;
  readonly onRemoveBswmd: (path: string) => void;
  /**
   * Sprint 14 / Task 11 — invoked when the user clicks the "+" button
   * trailing a BSWMD row. The host (App.tsx) opens the picker with
   * `preSelectedBswmdPath={path}` so the user lands inside the right
   * BSWMD without having to scroll. Optional so the existing ProjectPanel
   * tests (which don't pass it) stay green.
   */
  readonly onAddEcuc?: (bswmdPath: string) => void;
  /**
   * Sprint 14 / Task 11 — invoked when the user clicks the `📋 N/M` chip
   * trailing a BSWMD row. The host opens the picker (no pre-selection)
   * so the user can pick which modules to instantiate. Currently the
   * chip-click opens the same picker as the "+" button but without a
   * pre-selection — wired separately so future UX can diverge (e.g.
   * open a module-configure side-panel instead).
   */
  readonly onConfigureModules?: (bswmdPath: string) => void;
}

/**
 * Sprint 13 refactor — renamed from the private `OpenView` and
 * exported. Mounted by `LeftPanel` as the body of the "project" tab
 * when a project is open.
 *
 * Sprint 13+ Q5 — picks up `dirtyPaths` from the store so the meta
 * block can show a localized dirty count. The other store reads
 * (documentPaths / bswmdPaths) are intentionally not used here —
 * the ARXML and BSWMD list bodies mirror `manifest.valueArxmlPaths`
 * / `manifest.bswmdPaths`, which are the source of truth when a
 * project is open.
 * beyond i18n lookups inside the leaf `FileList`.
 */
export function ProjectPanelInfo({
  locale,
  manifest,
  manifestPath,
  onClose,
  onRemoveArxml,
  onAddBswmd,
  onRemoveBswmd,
  onAddEcuc,
  onConfigureModules,
}: ProjectPanelInfoProps): JSX.Element {
  // Sprint 13+ Q5 — pull dirty count from the store. Subscribed via
  // a selector so re-renders track dirty flips. The Set is the
  // canonical dirty representation (per-file path); we only need the
  // size for the meta block.
  const dirtyCount = useArxmlStore((s) => s.dirtyPaths.size);
  // Sprint 14 / Task 11 — read BSWMD schemas + paths so each BSWMD row
  // can surface its active/total module count (`📋 N/M` chip). The two
  // arrays are parallel (T7 contract); we pair by index. When a BSWMD
  // path is in `manifest.bswmdPaths` but its schema hasn't been parsed
  // yet (still loading), we fall back to `total=0 / active=0` rather
  // than crashing — the chip will just read `0/0` until the schema
  // lands.
  const bswmdSchemas = useArxmlStore((s) => s.bswmdSchemas);
  const bswmdPathsInStore = useArxmlStore((s) => s.bswmdPaths);
  // v1.8.4 Bug 3 — subscribe to documents so the chip count tracks
  // ECUC-instantiated docs (filtered by sourceBswmdPath in the render
  // callback below). Selector-scoped to keep re-renders targeted.
  const documents = useArxmlStore((s) => s.documents);
  // Precompute the canonical-key set of every document's sourceBswmdPath
  // so the render callback can do an O(1) `Set.has(bswmdKeyFor(...))`
  // match against the manifest-side bswmdPath (same shape-mismatch
  // problem the bswmdKeyToSchema map above solves for schemas).
  const instantiatedKeys = useMemo<ReadonlySet<string>>(() => {
    const out = new Set<string>();
    for (const d of documents) {
      if (d.sourceBswmdPath !== undefined) {
        out.add(bswmdKeyFor(d.sourceBswmdPath));
      }
    }
    return out;
  }, [documents]);

  // Sprint A (P0-A1) — derive a `bswmdKey → schema` lookup so the
  // trailing chip can pair a manifest row (relative POSIX path) to
  // its schema in the store (absolute Windows path) even when the
  // two strings never compare equal. The key is the last 2
  // path segments, lowercased + forward-slashed; see
  // `shared/path.bswmdKeyFor` for the full contract.
  //
  // We materialise this map inside the component (rather than adding
  // a selector to the store) so the store's interface stays focused
  // on state, not on derived render helpers. `useMemo` keeps the map
  // stable across re-renders as long as the underlying arrays don't
  // change.
  const bswmdKeyToSchema = useMemo<ReadonlyMap<string, BswmdDocument>>(() => {
    const map = new Map<string, BswmdDocument>();
    bswmdPathsInStore.forEach((path, idx) => {
      const schema = bswmdSchemas[idx];
      if (schema === undefined) return;
      map.set(bswmdKeyFor(path), schema);
    });
    return map;
  }, [bswmdSchemas, bswmdPathsInStore]);

  return (
    <div className="project-panel project-panel-open" data-testid="project-panel-open">
      <header className="project-panel-header">
        <div className="project-panel-header-text">
          <div className="project-panel-title" title={manifestPath}>
            {manifest.name}
          </div>
          <div className="project-panel-subtitle">
            {t(locale, 'projectPanel.subtitle', {
              arxmlCount: manifest.valueArxmlPaths.length,
              bswmdCount: manifest.bswmdPaths.length,
            })}
          </div>
        </div>
        <button
          type="button"
          className="project-panel-close"
          onClick={onClose}
          data-testid="project-panel-close-btn"
          aria-label={t(locale, 'projectPanel.closeAria', { name: manifest.name })}
        >
          ×
        </button>
      </header>
      {/* Sprint 13+ Q5 — project meta block. Localized, with the
          dirty count bound to the store so it tracks the live
          save-state. The createdAt field is not part of the current
          manifest shape (manifest has no timestamp) so we fall back
          to an empty string — the path and stats lines are
          load-bearing. */}
      <div className="project-panel-meta" data-testid="project-meta">
        <div className="project-panel-meta-line">
          {t(locale, 'project.meta.path', { path: manifestPath })}
        </div>
        <div className="project-panel-meta-line">
          {t(locale, 'project.meta.createdAt', { date: '—' })}
        </div>
        <div className="project-panel-meta-line">
          {t(locale, 'project.meta.stats', {
            arxmlCount: manifest.valueArxmlPaths.length,
            bswmdCount: manifest.bswmdPaths.length,
            dirtyCount,
          })}
        </div>
      </div>
      <FileList
        title={t(locale, 'projectPanel.arxml.title')}
        paths={manifest.valueArxmlPaths}
        emptyHint={t(locale, 'projectPanel.arxml.empty')}
        testIdPrefix="project-panel-arxml"
        onRemove={onRemoveArxml}
      />
      <FileList
        title={t(locale, 'projectPanel.bswmd.title')}
        paths={manifest.bswmdPaths}
        emptyHint={t(locale, 'projectPanel.bswmd.empty')}
        testIdPrefix="project-panel-bswmd"
        onAdd={onAddBswmd}
        addLabel={t(locale, 'projectPanel.bswmd.add')}
        addAriaLabel={t(locale, 'projectPanel.bswmd.addAria', { name: '' })}
        onRemove={onRemoveBswmd}
        // Sprint 17 P3 T3.1 — wire right-click on the BSWMD row to
        // open the global ContextMenu with `kind: 'bswmd'`. The menu
        // renders the "Remove module" item (added in T3.3) which
        // dispatches `removeBswmdWithFullFlow(path)`. The ARXML row
        // does NOT get this wiring — ARXML removal is handled by
        // the existing × button + the ECUC add/delete flow.
        onContextMenuRow={(p, e) => {
          openContextMenu({ path: p, kind: 'bswmd', shortName: basename(p) }, e.clientX, e.clientY);
        }}
        // Sprint 14 / Task 11 — trailing widgets per BSWMD row. Each
        // row gets:
        //   - 📋 N/M chip — uses `getActiveModules` (T4) to surface
        //     active vs total module count. Hover-title is the
        //     localized `ecuc.fromBswmd.modulesActive` string. Click
        //     opens the picker via `onConfigureModules`.
        //   - "+" button — opens the picker with this BSWMD
        //     pre-selected via `onAddEcuc`.
        //
        // We look up the schema by matching `manifest.bswmdPaths[idx]`
        // against `bswmdPathsInStore` (parallel arrays). The match may
        // fail transiently while a BSWMD is mid-parse; in that case we
        // fall back to 0/0 and skip the buttons (no schema = no
        // modules to instantiate).
        //
        // Sprint A (P0-A1) — the two arrays hold different path shapes
        // (manifest.bswmdPaths = relative POSIX, store.bswmdPaths =
        // absolute Windows), so a strict `indexOf` never hits. The
        // `bswmdKeyToSchema` map built above collapses both shapes
        // to a single canonical key.
        renderTrailing={(bswmdPath, idx) => {
          const schema = bswmdKeyToSchema.get(bswmdKeyFor(bswmdPath));
          const totalCount = schema !== undefined ? schema.modules.length : 0;
          // v1.8.4 Bug 3 — the chip count must reflect ECUC-instantiated
          // docs (derived from `documents` whose `sourceBswmdPath` matches
          // this row's BSWMD), not BSWMD-side module enable/disable state.
          // The old `getActiveModules` reading gave a misleading "100/100"
          // on load because it counts non-disabled BSWMD modules, which has
          // nothing to do with whether any ECUC doc was generated.
          // Match via the canonical `bswmdKeyFor` to bridge the
          // manifest-relative POSIX vs store-absolute Windows shape mismatch
          // (same approach as `bswmdKeyToSchema` above).
          const instantiatedCount = Array.from(documents).filter(
            (d) =>
              d.sourceBswmdPath !== undefined &&
              bswmdKeyFor(d.sourceBswmdPath) === bswmdKeyFor(bswmdPath),
          ).length;
          return (
            <>
              <button
                type="button"
                className="project-panel-bswmd-chip"
                onClick={() => onConfigureModules?.(bswmdPath)}
                title={t(locale, 'ecuc.fromBswmd.modulesActive', {
                  active: instantiatedCount,
                  total: totalCount,
                })}
                data-testid={`project-panel-bswmd-chip-${idx}`}
              >
                <span aria-hidden="true">📋</span> {instantiatedCount}/{totalCount}
              </button>
              <button
                type="button"
                className="project-panel-bswmd-add-ecuc"
                onClick={() => onAddEcuc?.(bswmdPath)}
                title={t(locale, 'ecuc.fromBswmd.menu')}
                data-testid={`project-panel-bswmd-add-ecuc-${idx}`}
                aria-label={t(locale, 'ecuc.fromBswmd.menu')}
                disabled={schema === undefined || totalCount === 0}
              >
                +
              </button>
            </>
          );
        }}
      />
    </div>
  );
}
