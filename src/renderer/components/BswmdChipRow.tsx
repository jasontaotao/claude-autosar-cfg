// BswmdChipRow — Sprint 13+ Stage 3.4.
//
// Container for the BSWMD multi-select chip row that appears
// inside `NewProjectDialog` when the user picks a template that
// ships BSWMDs (currently Classic). The row renders:
//   - a section label (`newProject.bswmdLabel`)
//   - a one-line hint (`newProject.bswmdHint`) explaining multi-
//     select semantics
//   - one `BswmdChip` per absolute BSWMD path in `bswmdPaths`,
//     labelled with the path's basename (the renderer does not
//     import `node:path` — `lastSegment` does the same job in two
//     lines).
//   - an empty-state slot (`newProject.noBswmd`) when the row is
//     reached with zero BSWMDs (e.g. a template whose `bswmd/`
//     dir was removed on disk; the dialog normally suppresses the
//     row entirely in that case, but the field is here for the
//     rare race during the IPC fetch).
//
// `BswmdChipRow` is purely a view — it owns no state. The dialog
// holds the `selectedBswmdPaths` set and passes it down as
// `selectedPaths`; on chip toggle the dialog receives the full
// absolute path and decides whether to add or remove it. This
// keeps the chip row's behaviour deterministic and unit-testable.

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore.js';

import { BswmdChip } from './BswmdChip.js';

import './BswmdChip.css';

interface BswmdChipRowProps {
  /** Absolute on-disk paths of the BSWMDs the template ships with. */
  readonly bswmdPaths: readonly string[];
  /** Absolute paths of the BSWMDs the user has currently selected. */
  readonly selectedPaths: readonly string[];
  /** Called with the toggled absolute path. The host decides
   *  whether to add or remove it from its selection. */
  readonly onToggle: (absolutePath: string) => void;
}

export function BswmdChipRow({
  bswmdPaths,
  selectedPaths,
  onToggle,
}: BswmdChipRowProps): JSX.Element {
  const locale: Locale = useArxmlStore((s) => s.locale);

  if (bswmdPaths.length === 0) {
    return (
      <div className="npd-bswmd-empty" data-testid="bswmd-chip-empty">
        {t(locale, 'newProject.noBswmd')}
      </div>
    );
  }

  return (
    <div className="npd-bswmd-row" data-testid="bswmd-chip-row">
      <div className="npd-bswmd-label">{t(locale, 'newProject.bswmdLabel')}</div>
      <div className="npd-bswmd-hint">{t(locale, 'newProject.bswmdHint')}</div>
      <div className="npd-bswmd-chips">
        {bswmdPaths.map((p) => {
          const basename = lastSegment(p);
          return (
            <BswmdChip
              key={p}
              label={basename}
              selected={selectedPaths.includes(p)}
              onToggle={() => onToggle(p)}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Return the last segment of a file path. Mirrors `@shared/path#basename`
 * semantics but is inlined here so the renderer does not have to import
 * a node:path wrapper just to extract a file name. Accepts both POSIX
 * and Windows separators so the same code path works regardless of host.
 */
function lastSegment(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
