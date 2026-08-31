// FileListTab — "files" tab content for LeftPanel.
//
// Shows loaded ARXML documents as clickable items, with the [Combined]
// virtual entry at the top. In loose mode (no project), renders a
// compact header with New / Open buttons above the file list.
//
// Clicking an ARXML file switches the active document via
// `setActiveDocument` and (if currently in combined mode) flips back
// to single mode. Clicking the [Combined] virtual entry at the top
// of the list switches to combined mode, where the Tree renders one
// branch per loaded file.
//
// Sprint 13+ Q5 — BSWMD section moved out of FileListTab. BSWMD
// management (list + "+" add button) now lives inside
// `ProjectPanelInfo` (the "project" tab). The "files" tab is now
// ARXML-only: pick a doc to edit, switch to combined, or — in loose
// mode — create/open a project.

import type { JSX } from 'react';

import { t } from '@shared/i18n/index.js';
import { basename } from '@shared/path';

// useProjectActions used to be destructured here for the loose-mode
// "New Project" / "Open Project" buttons. Those moved to the AppHeader
// dropdown in Q2-3; if a future feature re-adds them, re-import.
import { useArxmlStore } from '../store/useArxmlStore';

import { ImportEntry } from './ImportEntry';

import './FileListTab.css';

function FileIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 1.75h5L13 5.5v8.75a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1Z" />
      <path d="M9 1.75V5.5h4" />
      <path d="M5.5 9h5" />
      <path d="M5.5 11.5h3" />
    </svg>
  );
}

function CombinedIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.75 5.25 8 2.5l5.25 2.75L8 8 2.75 5.25Z" />
      <path d="m2.75 8.5 5.25 2.75 5.25-2.75" />
      <path d="m2.75 11.5 5.25 2.75 5.25-2.75" />
    </svg>
  );
}

export function FileListTab(): JSX.Element {
  const project = useArxmlStore((s) => s.project);
  const documentPaths = useArxmlStore((s) => s.documentPaths);
  const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);
  const viewMode = useArxmlStore((s) => s.viewMode);
  const setActiveDocument = useArxmlStore((s) => s.setActiveDocument);
  const setViewMode = useArxmlStore((s) => s.setViewMode);
  const removeDocument = useArxmlStore((s) => s.removeDocument);
  const locale = useArxmlStore((s) => s.locale);
  // v1.8.0 K Stencil Task 10 — set of filePaths marked as templates
  // (any .arxml loaded via File → Open). Drives the "Template" badge
  // rendered next to each opened doc row. See useArxmlStore.addDocument
  // and the templatePaths slice in the ecuc slice.
  const templatePaths = useArxmlStore((s) => s.templatePaths);

  const isProjectOpen = project !== null;

  // ARXML paths: from project manifest when open, from store otherwise
  const arxmlPaths = isProjectOpen ? project.valueArxmlPaths : documentPaths;
  const isCombinedActive = viewMode === 'combined';

  return (
    <div className="file-list-tab">
      {/* Loose mode hint. Sprint 13+ Q2-3: the New Project / Open
          Project buttons used to live here, but the AppHeader already
          surfaces them through its dropdown menu. We keep only a
          short hint pointing the user to the menu so the affordance
          is discoverable without duplicating the action. */}
      {!isProjectOpen && (
        <div className="file-list-tab-loose" data-testid="file-list-tab-loose-hint">
          <span className="file-list-tab-loose-text">{t(locale, 'projectPanel.loose.text')}</span>
        </div>
      )}

      {/* ARXML documents */}
      <div className="file-list-tab-group">
        <div className="file-list-tab-group-title">
          {t(locale, 'projectPanel.arxml.title')}
          {arxmlPaths.length > 0 && (
            <span className="file-list-tab-count">{arxmlPaths.length}</span>
          )}
        </div>
        {/* Sprint 14 / T10 — ECUC ARXML Import entry point. Sits at
            the top of the ARXML list so it's discoverable alongside
            the existing "add / remove document" controls. */}
        <div className="file-list-tab-import-row">
          <ImportEntry />
        </div>
        {arxmlPaths.length === 0 ? (
          // v1.48.0 MINOR T2 -- aria-live="polite" for first-time
          // screen reader announcement (WCAG 4.1.3).
          <div className="file-list-tab-empty" role="status" aria-live="polite">
            {t(locale, 'projectPanel.arxml.empty')}
          </div>
        ) : (
          <>
            {/* Sprint 13 Stage 3.5 — Combined Tree View entry. Sits at
                the top of the ARXML list when at least one doc is
                loaded. Highlighted as the active "doc" when
                viewMode === 'combined'. */}
            <div
              className={`file-list-tab-item file-list-tab-item-combined${
                isCombinedActive ? ' is-active-doc' : ''
              }`}
              onClick={() => setViewMode('combined')}
              data-testid="file-list-tab-combined"
              role="button"
              tabIndex={0}
              aria-label={t(locale, 'fileList.combinedViewAria')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setViewMode('combined');
                }
              }}
            >
              <span className="file-list-tab-item-icon">
                <CombinedIcon />
              </span>
              <span className="file-list-tab-item-name">{t(locale, 'fileList.combinedView')}</span>
            </div>
            {arxmlPaths.map((p) => {
              const isActive = p === activeDocumentPath && !isCombinedActive;
              return (
                <div
                  key={p}
                  className={`file-list-tab-item${isActive ? ' is-active-doc' : ''}`}
                  onClick={() => {
                    // Switching to a file in the list always returns
                    // to single mode — the combined view is opt-in.
                    if (viewMode === 'combined') {
                      setViewMode('single');
                    }
                    setActiveDocument(p);
                  }}
                  data-testid={`file-list-tab-arxml-${p}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (viewMode === 'combined') {
                        setViewMode('single');
                      }
                      setActiveDocument(p);
                    }
                  }}
                >
                  <span className="file-list-tab-item-icon">
                    <FileIcon />
                  </span>
                  <span className="file-list-tab-item-name" title={p}>
                    {basename(p)}
                  </span>
                  {/* v1.8.0 K Stencil Task 10 — "Template" badge shown
                      next to any .arxml loaded via File → Open. Per the
                      KISS design there is no separate "template"
                      concept; every opened file IS a template, so the
                      badge is purely informational. Newly created
                      docs (Stencil Wizard output, blank docs) do NOT
                      show the badge. */}
                  {templatePaths.has(p) && (
                    <span
                      className="file-list-tab-item-badge file-list-tab-item-badge-template"
                      data-testid={`file-list-tab-arxml-badge-template-${p}`}
                      aria-label={t(locale, 'stencil.badge.templateAria', {
                        name: basename(p),
                      })}
                      title={t(locale, 'stencil.badge.template')}
                    >
                      {t(locale, 'stencil.badge.template')}
                    </span>
                  )}
                  <button
                    type="button"
                    className="file-list-tab-item-remove"
                    aria-label={t(locale, 'projectPanel.removeArxmlAria', {
                      name: basename(p),
                    })}
                    data-testid={`file-list-tab-arxml-remove-${p}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDocument(p);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
