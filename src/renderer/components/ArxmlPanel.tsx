// ArxmlPanel: status footer that shows package / element counts after a
// successful parse. File Open / Save actions now live in `AppHeader`
// (slim top bar); this component only owns the read-only summary line
// that anchors the bottom of the workspace.
//
// Renders nothing when no doc is loaded — keeps the footer from
// contributing empty space when the user has not opened a file yet.

import type { ArxmlElement } from '@core/arxml/types.js';

import { useArxmlStore } from '../store/useArxmlStore';

export function ArxmlPanel(): JSX.Element | null {
  const doc = useArxmlStore((s) => s.doc);
  const dirty = useArxmlStore((s) => s.dirty);

  if (doc === null) return null;

  // Recursive count walks sub-packages too — EB tresos BSWMD files
  // (AUTOSAR > EcucDefs > <modules>) and other nested layouts must count
  // every element under the root, not just the top-level packages.
  const packageCount = countPackages(doc.packages);
  const elementCount = countElementsInPackages(doc.packages);

  return (
    <footer className="status-footer" data-testid="status-footer">
      <span className="status-item">
        Packages: <strong>{packageCount}</strong>
      </span>
      <span className="status-sep">•</span>
      <span className="status-item">
        Elements: <strong>{elementCount}</strong>
      </span>
      <span className="status-sep">•</span>
      <span className="status-item">
        AUTOSAR <strong>{doc.version}</strong>
      </span>
      {dirty && (
        <>
          <span className="status-sep">•</span>
          <span className="status-dirty">unsaved changes</span>
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
