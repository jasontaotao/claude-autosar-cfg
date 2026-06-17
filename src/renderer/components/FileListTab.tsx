// FileListTab — "files" tab content for LeftPanel.
//
// Shows loaded ARXML documents and BSWMD schemas as clickable lists.
// In loose mode (no project), shows a compact header with New / Open
// buttons above the file lists.
//
// Clicking an ARXML file switches the active document via
// `setActiveDocument` and (if currently in combined mode) flips back
// to single mode. Clicking the [Combined] virtual entry at the top
// of the list switches to combined mode, where the Tree renders one
// branch per loaded file.
// BSWMD files are read-only entries with remove buttons.

import type { JSX } from 'react';

import { t } from '@shared/i18n';
import { basename } from '@shared/path';

import { useProjectActions } from '../hooks/useProjectActions';
import { useArxmlStore } from '../store/useArxmlStore';

import './FileListTab.css';

export function FileListTab(): JSX.Element {
  const project = useArxmlStore((s) => s.project);
  const documentPaths = useArxmlStore((s) => s.documentPaths);
  const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);
  const viewMode = useArxmlStore((s) => s.viewMode);
  const setActiveDocument = useArxmlStore((s) => s.setActiveDocument);
  const setViewMode = useArxmlStore((s) => s.setViewMode);
  const removeDocument = useArxmlStore((s) => s.removeDocument);
  const bswmdPaths = useArxmlStore((s) => s.bswmdPaths);
  const removeBswmd = useArxmlStore((s) => s.removeBswmd);
  const locale = useArxmlStore((s) => s.locale);
  const { newProject, openProjectFromDialog, addBswmdFromDialog } = useProjectActions();

  const isProjectOpen = project !== null;

  // ARXML paths: from project manifest when open, from store otherwise
  const arxmlPaths = isProjectOpen ? project.valueArxmlPaths : documentPaths;
  const isCombinedActive = viewMode === 'combined';

  const handleAddBswmd = (): void => {
    if (addBswmdFromDialog === undefined) return;
    void addBswmdFromDialog();
  };

  return (
    <div className="file-list-tab">
      {/* Loose mode header */}
      {!isProjectOpen && (
        <div className="file-list-tab-loose">
          <span className="file-list-tab-loose-text">{t(locale, 'projectPanel.loose.text')}</span>
          <button
            type="button"
            className="file-list-tab-loose-btn"
            onClick={() => void newProject()}
            data-testid="file-list-tab-loose-new"
          >
            {t(locale, 'projectPanel.loose.new')}
          </button>
          <button
            type="button"
            className="file-list-tab-loose-btn"
            onClick={() => void openProjectFromDialog()}
            data-testid="file-list-tab-loose-open"
          >
            {t(locale, 'projectPanel.loose.open')}
          </button>
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
        {arxmlPaths.length === 0 ? (
          <div className="file-list-tab-empty">{t(locale, 'projectPanel.arxml.empty')}</div>
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
              <span className="file-list-tab-item-icon">🔗</span>
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
                  <span className="file-list-tab-item-icon">📄</span>
                  <span className="file-list-tab-item-name" title={p}>
                    {basename(p)}
                  </span>
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

      {/* BSWMD schemas — only when a project is open */}
      {isProjectOpen && (
        <div className="file-list-tab-group">
          <div className="file-list-tab-group-title">
            {t(locale, 'projectPanel.bswmd.title')}
            {bswmdPaths.length > 0 && (
              <span className="file-list-tab-count">{bswmdPaths.length}</span>
            )}
          </div>
          {bswmdPaths.length === 0 ? (
            <div className="file-list-tab-empty">{t(locale, 'projectPanel.bswmd.empty')}</div>
          ) : (
            bswmdPaths.map((p) => (
              <div key={p} className="file-list-tab-item" data-testid={`file-list-tab-bswmd-${p}`}>
                <span className="file-list-tab-item-icon">📘</span>
                <span className="file-list-tab-item-name" title={p}>
                  {basename(p)}
                </span>
                <button
                  type="button"
                  className="file-list-tab-item-remove"
                  aria-label={t(locale, 'projectPanel.bswmd.addAria', {
                    name: basename(p),
                  })}
                  data-testid={`file-list-tab-bswmd-remove-${p}`}
                  onClick={() => removeBswmd(p)}
                >
                  ×
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            className="file-list-tab-add"
            onClick={handleAddBswmd}
            data-testid="file-list-tab-bswmd-add"
          >
            {t(locale, 'projectPanel.bswmd.add')}
          </button>
        </div>
      )}
    </div>
  );
}
