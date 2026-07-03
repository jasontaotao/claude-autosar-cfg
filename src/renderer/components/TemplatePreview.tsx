// TemplatePreview — v1.21.0 Bug #6 (MEDIUM: 新建项目合并视图设计
// 边界错) + Bug #7 (MEDIUM: 缺模板预览视图).
//
// A self-contained "what does this template bring" pane shown inside
// `<NewProjectDialog />` once the user has picked a template. Renders
// the template's localized name + description + file count + (when
// applicable) the BSWMD chip row that pre-fills the project's
// BSWMD list.
//
// Pre-fix the dialog body showed two separate horizontal bands:
//   [ template card row ]
//   [ BSWMD chip row ]   (only when a template with BSWMDs was picked)
//
// The boundary was wrong (Bug #6) — the chips were a top-level
// sibling of the template row, so the user had to mentally stitch
// "I picked Classic" + "and these BSWMDs will preload" together.
// And there was no preview of what each template actually brings
// (Bug #7) — clicking a card gave no feedback beyond a hover.
//
// Post-fix: a single TemplatePreview pane shows the entire
// "selected template + its contents" as one self-contained unit.
// The BSWMD chip row lives INSIDE the preview (Bug #6 boundary
// fix) and the description + file count surface at the top of
// the pane (Bug #7 fix).
//
// Pure presentational. The host (NewProjectDialog) owns the
// selected-template state and the BSWMD selection.

import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';

import { BswmdChipRow } from './BswmdChipRow';
import type { TemplateRow } from './templates';
import { getTemplateDescription, getTemplateDisplayName } from './templates';

export interface TemplatePreviewProps {
  readonly locale: Locale;
  /** Currently-selected template, or `null` when none. */
  readonly template: TemplateRow | null;
  /** Absolute paths of the BSWMDs the user has currently selected. */
  readonly selectedBswmdPaths: readonly string[];
  /** Toggle handler forwarded to the chip row. */
  readonly onBswmdToggle: (absolutePath: string) => void;
}

export function TemplatePreview({
  locale,
  template,
  selectedBswmdPaths,
  onBswmdToggle,
}: TemplatePreviewProps): JSX.Element {
  if (template === null) {
    return (
      <div
        className="npd-template-preview npd-template-preview--empty"
        data-testid="npd-template-preview-empty"
      >
        <p className="npd-template-preview-hint">
          {t(locale, 'newProject.templatePreview.pickFirst')}
        </p>
      </div>
    );
  }
  const name = getTemplateDisplayName(locale, template);
  const description = getTemplateDescription(locale, template);
  const fileCount = template.fileCount;
  const bswmdPaths = template.bswmdPaths;
  return (
    <div className="npd-template-preview" data-testid="npd-template-preview">
      <header className="npd-template-preview-header">
        <h3 className="npd-template-preview-name">{name}</h3>
        <span className="npd-template-preview-files" data-testid="npd-template-preview-files">
          {fileCount === 0
            ? t(locale, 'newProject.templatePreview.fileCountNone')
            : t(locale, 'newProject.templatePreview.fileCount', { count: fileCount })}
        </span>
      </header>
      <p className="npd-template-preview-desc">{description}</p>
      {bswmdPaths.length > 0 ? (
        <div className="npd-template-preview-bswmd" data-testid="npd-template-preview-bswmd">
          <div className="npd-template-preview-bswmd-label">
            {t(locale, 'newProject.templatePreview.preloadBswmd')}
          </div>
          <BswmdChipRow
            bswmdPaths={bswmdPaths}
            selectedPaths={selectedBswmdPaths}
            onToggle={onBswmdToggle}
          />
        </div>
      ) : null}
    </div>
  );
}
