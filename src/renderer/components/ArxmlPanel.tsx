// ArxmlPanel: status footer that shows package / element counts after a
// successful parse. File Open / Save actions now live in `AppHeader`
// (slim top bar); this component only owns the read-only summary line
// that anchors the bottom of the workspace.
//
// Renders nothing when no doc is loaded — keeps the footer from
// contributing empty space when the user has not opened a file yet.
//
// Sprint 11 Phase 1 (Option A) i18n: every label goes through
// t(locale, key). Keys 'arxmlPanel.packages' / '.elements' / '.unsaved'
// live in the shared Messages bundle so the parity test enforces
// zh-CN / en coverage (an earlier ad-hoc `FOOTER_KEYS` local dict
// bypassed the test; code-review M3).
//
// Sprint 13 Stage 3.5 (Combined Tree View): in combined mode the
// footer renders the document count + aggregate package / element
// counts across every loaded doc, plus an aggregate dirty indicator
// that fires when ANY doc is dirty (not just the active one).

import type { JSX } from 'react';

import type { ArxmlElement } from '@core/arxml/types.js';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

export function ArxmlPanel(): JSX.Element | null {
  const doc = useArxmlStore((s) => s.doc);
  const documents = useArxmlStore((s) => s.documents);
  const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);
  const dirtyPaths = useArxmlStore((s) => s.dirtyPaths);
  const viewMode = useArxmlStore((s) => s.viewMode);
  const locale = useArxmlStore((s) => s.locale);

  if (doc === null) return null;

  // Aggregate counts span every loaded doc in combined mode; single
  // mode only counts the active one (matches the legacy rendering).
  const sourceDocs = viewMode === 'combined' ? documents : [doc];
  const sourceVersion = doc.version;

  let packageCount = 0;
  let elementCount = 0;
  for (const d of sourceDocs) {
    packageCount += countPackages(d.packages);
    elementCount += countElementsInPackages(d.packages);
  }

  // Dirty: combined → any doc; single → only the active doc.
  const isDirty =
    viewMode === 'combined'
      ? dirtyPaths.size > 0
      : activeDocumentPath !== null && dirtyPaths.has(activeDocumentPath);

  return (
    <footer className="status-footer" data-testid="status-footer">
      {viewMode === 'combined' && (
        <>
          <span className="status-item">
            {t(locale, 'arxmlPanel.combinedDocs', { count: sourceDocs.length })}
          </span>
          <span className="status-sep">•</span>
        </>
      )}
      <span className="status-item">
        {t(locale, 'arxmlPanel.packages')}: <strong>{packageCount}</strong>
      </span>
      <span className="status-sep">•</span>
      <span className="status-item">
        {t(locale, 'arxmlPanel.elements')}: <strong>{elementCount}</strong>
      </span>
      <span className="status-sep">•</span>
      <span className="status-item">{t(locale, 'app.docVersion', { version: sourceVersion })}</span>
      {isDirty && (
        <>
          <span className="status-sep">•</span>
          <span className="status-dirty">{t(locale, 'arxmlPanel.unsaved')}</span>
        </>
      )}
    </footer>
  );
}

function countPackages(pkgs: readonly { packages?: readonly unknown[] }[]): number {
  let n = pkgs.length;
  for (const p of pkgs) {
    const subs = p.packages;
    if (subs !== undefined)
      n += countPackages(subs as readonly { packages?: readonly unknown[] }[]);
  }
  return n;
}

function countElementsInPackages(
  pkgs: readonly { elements: readonly ArxmlElement[]; packages?: readonly unknown[] }[],
): number {
  let n = 0;
  for (const p of pkgs) {
    n += p.elements.length + countNestedElements(p.elements);
    const subs = p.packages as
      | readonly { elements: readonly ArxmlElement[]; packages?: readonly unknown[] }[]
      | undefined;
    if (subs !== undefined) n += countElementsInPackages(subs);
  }
  return n;
}

function countNestedElements(elements: readonly ArxmlElement[]): number {
  let n = 0;
  for (const e of elements) {
    if (e.kind === 'module' || e.kind === 'container') {
      const kids = e.children;
      n += kids.length + countNestedElements(kids);
    }
  }
  return n;
}
