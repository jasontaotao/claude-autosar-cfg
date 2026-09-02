// OdxImportWizard — ODX full-import preview/commit modal.
//
// The wizard owns the additive preview -> decisions -> commit flow. Main
// recomputes all ASTs, so only decisions cross IPC. The component reloads
// the current project after commit using the existing Bug-7 reload path.

import { useCallback, useEffect, useState } from 'react';

import { dirname, toManifestRelative } from '@shared/path';
import { t, type Locale } from '@shared/i18n/index.js';
import type {
  OdxImportCategory,
  OdxImportDecision,
  OdxImportError,
  OdxImportPreview,
  OdxImportRow,
} from '@shared/types';

import { useArxmlStore } from '../../store/useArxmlStore';
import './OdxImportWizard.css';

type Step = 'idle' | 'variant-select' | 'preview' | 'committing' | 'done';

function categoryKey(category: OdxImportCategory): Parameters<typeof t>[1] {
  switch (category) {
    case 'added':
      return 'odxImport.category.added';
    case 'updated':
      return 'odxImport.category.updated';
    case 'locally-modified':
      return 'odxImport.category.locallyModified';
    case 'conflict':
      return 'odxImport.category.conflict';
    case 'converged':
      return 'odxImport.category.converged';
    case 'removed-in-odx':
      return 'odxImport.category.removedInOdx';
  }
}

function errorKey(kind: OdxImportError['kind']): Parameters<typeof t>[1] {
  switch (kind) {
    case 'read-failed':
      return 'odxImport.error.readFailed';
    case 'odx-malformed':
      return 'odxImport.error.odxMalformed';
    case 'odx-too-large':
      return 'odxImport.error.odxTooLarge';
    case 'odx-no-variant':
      return 'odxImport.error.odxNoVariant';
    case 'odx-variant-not-found':
      return 'odxImport.error.odxVariantNotFound';
    case 'odx-inheritance-cycle':
      return 'odxImport.error.odxInheritanceCycle';
    case 'odx-bswmd-not-loaded':
      return 'odxImport.error.odxBswmdNotLoaded';
    case 'odx-target-dirty':
      return 'odxImport.error.odxTargetDirty';
    case 'odx-module-ambiguous':
      return 'odxImport.error.odxModuleAmbiguous';
    case 'odx-commit-mismatch':
      return 'odxImport.error.odxCommitMismatch';
    case 'write-failed':
      return 'odxImport.error.writeFailed';
  }
}

function errorParams(error: OdxImportError): Record<string, string> {
  if ('module' in error) return { module: error.module };
  if ('docPath' in error) return { docPath: error.docPath };
  return { message: error.message };
}

function requiresExplicitConfirmation(row: OdxImportRow, decision: OdxImportDecision): boolean {
  return (
    (row.category === 'conflict' && decision === 'import') ||
    (row.category === 'removed-in-odx' && decision === 'delete')
  );
}

export interface OdxImportWizardProps {
  readonly onClose: () => void;
  readonly locale: Locale;
  readonly projectManifestPath: string | null;
  readonly dirtyDocPaths: readonly string[];
  readonly initialOdxPath?: string;
  readonly initialPreview?: OdxImportPreview;
}

export function OdxImportWizard({
  onClose,
  locale,
  projectManifestPath,
  dirtyDocPaths,
  initialOdxPath,
  initialPreview,
}: OdxImportWizardProps): JSX.Element {
  const [step, setStep] = useState<Step>(initialPreview === undefined ? 'idle' : 'variant-select');
  const [odxPath, setOdxPath] = useState(initialOdxPath ?? '');
  const [preview, setPreview] = useState<OdxImportPreview | undefined>(initialPreview);
  const [decisions, setDecisions] = useState<Map<string, OdxImportDecision>>(new Map());
  const [confirmedPaths, setConfirmedPaths] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState({ applied: 0, kept: 0, deleted: 0, manifestPath: '' });

  useEffect(() => {
    if (initialPreview === undefined) return;
    setPreview(initialPreview);
    setDecisions(new Map(initialPreview.rows.map((row) => [row.path, row.defaultDecision])));
    setStep(initialPreview.selectedVariant === undefined ? 'variant-select' : 'preview');
  }, [initialPreview]);

  const runPreview = useCallback(
    async (selectedOdxPath: string, variantId?: string): Promise<void> => {
      const api = window.autosarApi;
      if (api === undefined) {
        setError(t(locale, 'odxImport.error.unexpected', { message: 'API unavailable' }));
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await api.importOdxPreview({
          odxPath: selectedOdxPath,
          dirtyDocPaths,
          ...(variantId === undefined ? {} : { variantId }),
        });
        if (!result.ok) {
          setError(
            t(locale, errorKey(result.error.kind), {
              ...errorParams(result.error),
              message: result.error.message,
            }),
          );
          return;
        }
        setPreview(result.value);
        setDecisions(new Map(result.value.rows.map((row) => [row.path, row.defaultDecision])));
        setConfirmedPaths(new Set());
        setStep(result.value.selectedVariant === undefined ? 'variant-select' : 'preview');
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(t(locale, 'odxImport.error.unexpected', { message }));
      } finally {
        setBusy(false);
      }
    },
    [dirtyDocPaths, locale],
  );

  const pickOdx = useCallback(async (): Promise<void> => {
    const api = window.autosarApi;
    if (api === undefined || projectManifestPath === null) return;
    setBusy(true);
    setError(null);
    try {
      const opened = await api.openOdxWithDefault({ defaultPath: dirname(projectManifestPath) });
      if (opened.kind === 'canceled') return;
      if (opened.kind === 'read-failed') {
        setError(t(locale, 'odxImport.error.readFailed', { message: opened.message }));
        return;
      }
      setOdxPath(opened.path);
      await runPreview(opened.path);
    } finally {
      setBusy(false);
    }
  }, [locale, projectManifestPath, runPreview]);

  const setDecision = (row: OdxImportRow, decision: OdxImportDecision): void => {
    setDecisions((current) => new Map(current).set(row.path, decision));
    if (!requiresExplicitConfirmation(row, decision)) {
      setConfirmedPaths((current) => new Set([...current].filter((path) => path !== row.path)));
    }
  };

  const confirmDecision = (row: OdxImportRow): void => {
    setConfirmedPaths((current) => new Set(current).add(row.path));
  };

  const selectedVariantId =
    preview?.selectedVariant?.odxId ??
    (preview?.variants.length === 1 ? preview.variants[0]?.odxId : undefined);

  const canCommit =
    preview !== undefined &&
    preview.selectedVariant !== undefined &&
    odxPath.length > 0 &&
    preview.rows.every(
      (row) =>
        !requiresExplicitConfirmation(row, decisions.get(row.path) ?? row.defaultDecision) ||
        confirmedPaths.has(row.path),
    );

  const commit = async (): Promise<void> => {
    if (!canCommit || preview?.selectedVariant === undefined || busy) return;
    const api = window.autosarApi;
    if (api === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.importOdxCommit({
        odxPath,
        variantId: preview.selectedVariant.odxId,
        dirtyDocPaths,
        previewHash: preview.previewHash,
        decisions: preview.rows.map((row) => ({
          path: row.path,
          decision: decisions.get(row.path) ?? row.defaultDecision,
        })),
      });
      if (!result.ok) {
        setError(
          t(locale, errorKey(result.error.kind), {
            ...errorParams(result.error),
            message: result.error.message,
          }),
        );
        return;
      }
      setCommitted(result.value);
      setStep('done');

      const reload = await api.projectReload({ manifestPath: projectManifestPath ?? '' });
      if (reload.kind === 'read-failed') {
        setError(t(locale, 'odxImport.error.reload', { message: reload.message }));
        return;
      }
      const manifest = useArxmlStore.getState().project;
      if (manifest !== null) {
        const manifestDir = dirname(projectManifestPath ?? '');
        const docsRelSet = new Set(manifest.valueArxmlPaths);
        const docs: { rel: string; path: string; content: string }[] = [];
        const bswmds: { rel: string; path: string; content: string }[] = [];
        for (const file of reload.files) {
          const rel = toManifestRelative(manifestDir, file.path) ?? file.path;
          if (docsRelSet.has(rel)) docs.push({ rel, path: file.path, content: file.content });
          else bswmds.push({ rel, path: file.path, content: file.content });
        }
        useArxmlStore.getState().openProject({
          manifestPath: projectManifestPath ?? '',
          manifest: reload.manifest,
          docs,
          bswmds,
        });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(t(locale, 'odxImport.error.unexpected', { message }));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="odx-import-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="odx-import-title"
      data-testid="odx-import-wizard"
      onClick={onClose}
    >
      <div className="odx-import-modal" onClick={(event): void => event.stopPropagation()}>
        <header className="odx-import-header">
          <h2 id="odx-import-title" className="odx-import-title">
            {step === 'done' ? t(locale, 'odxImport.done.title') : t(locale, 'odxImport.title')}
          </h2>
          <button
            type="button"
            className="odx-import-close"
            onClick={onClose}
            aria-label={t(locale, 'odxImport.close')}
            data-testid="odx-import-close"
          >
            ×
          </button>
        </header>

        {error !== null && (
          <div className="odx-import-error" role="alert" data-testid="odx-import-error">
            {error}
          </div>
        )}

        {step === 'idle' && (
          <section className="odx-import-body" data-testid="odx-import-step-idle">
            {projectManifestPath === null ? (
              <p className="odx-import-muted">
                {t(locale, 'odxImport.error.unexpected', { message: 'No project' })}
              </p>
            ) : (
              <button
                type="button"
                className="odx-import-primary"
                onClick={(): void => void pickOdx()}
                disabled={busy}
              >
                {busy ? t(locale, 'odxImport.pick.picking') : t(locale, 'odxImport.pick.button')}
              </button>
            )}
          </section>
        )}

        {step === 'variant-select' && preview !== undefined && (
          <section className="odx-import-body" data-testid="odx-import-step-variant">
            <h3>{t(locale, 'odxImport.variant.title')}</h3>
            <label className="odx-import-label" htmlFor="odx-import-variant">
              {t(locale, 'odxImport.variant.select')}
            </label>
            <select
              id="odx-import-variant"
              className="odx-import-select"
              value={selectedVariantId ?? ''}
              onChange={(event): void => {
                void runPreview(odxPath, event.target.value);
              }}
              disabled={busy}
            >
              {preview.variants.map((variant) => (
                <option key={variant.odxId} value={variant.odxId}>
                  {variant.kind} {variant.odxId}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="odx-import-primary"
              onClick={(): void => {
                if (selectedVariantId !== undefined) void runPreview(odxPath, selectedVariantId);
              }}
              disabled={busy || selectedVariantId === undefined}
            >
              {busy ? t(locale, 'odxImport.preview.parsing') : t(locale, 'odxImport.variant.next')}
            </button>
          </section>
        )}

        {step === 'preview' && preview !== undefined && (
          <section className="odx-import-body" data-testid="odx-import-step-preview">
            <div className="odx-import-stats">
              <span>
                {t(locale, 'odxImport.preview.stats.services', { count: preview.stats.services })}
              </span>
              <span>
                {t(locale, 'odxImport.preview.stats.dids', { count: preview.stats.dids })}
              </span>
              <span>
                {t(locale, 'odxImport.preview.stats.dtcs', { count: preview.stats.dtcs })}
              </span>
              <span>
                {t(locale, 'odxImport.preview.stats.sessions', { count: preview.stats.sessions })}
              </span>
              <span>
                {t(locale, 'odxImport.preview.stats.securityLevels', {
                  count: preview.stats.securityLevels,
                })}
              </span>
            </div>

            {(preview.targetModules.dcm.dirty || preview.targetModules.dem.dirty) && (
              <div className="odx-import-dirty">
                {t(locale, 'odxImport.dirty.saveFirst')}
                <ul>
                  {preview.targetModules.dcm.dirty && (
                    <li>{t(locale, 'odxImport.dirty.target', { module: 'Dcm' })}</li>
                  )}
                  {preview.targetModules.dem.dirty && (
                    <li>{t(locale, 'odxImport.dirty.target', { module: 'Dem' })}</li>
                  )}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <details className="odx-import-warnings">
                <summary>
                  {t(locale, 'odxImport.preview.warnings', { count: preview.warnings.length })}
                </summary>
                <ul>
                  {preview.warnings.map((warning, index) => (
                    <li key={`${warning.code}-${warning.elementRef}-${index}`}>
                      <strong>{warning.code}</strong> {warning.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="odx-import-table-wrap" data-testid="odx-import-rows">
              {preview.rows.length === 0 ? (
                <p className="odx-import-muted">{t(locale, 'odxImport.preview.noRows')}</p>
              ) : (
                <table className="odx-import-table">
                  <thead>
                    <tr>
                      <th>{t(locale, 'odxImport.preview.table.path')}</th>
                      <th>{t(locale, 'odxImport.preview.table.module')}</th>
                      <th>{t(locale, 'odxImport.preview.table.name')}</th>
                      <th>{t(locale, 'odxImport.preview.table.category')}</th>
                      <th>{t(locale, 'odxImport.preview.table.decision')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const decision = decisions.get(row.path) ?? row.defaultDecision;
                      const needsConfirmation = requiresExplicitConfirmation(row, decision);
                      const isConfirmed = confirmedPaths.has(row.path);
                      return (
                        <tr key={row.path} data-testid={`odx-import-row-${row.category}`}>
                          <td className="odx-import-path">{row.path}</td>
                          <td>{row.module}</td>
                          <td>{row.shortName}</td>
                          <td>
                            <span className={`odx-import-badge badge-${row.category}`}>
                              {t(locale, categoryKey(row.category))}
                            </span>
                          </td>
                          <td>
                            <select
                              value={decision}
                              onChange={(event): void =>
                                setDecision(row, event.target.value as OdxImportDecision)
                              }
                            >
                              <option value="import">
                                {t(locale, 'odxImport.decision.import')}
                              </option>
                              <option value="keep-local">
                                {t(locale, 'odxImport.decision.keepLocal')}
                              </option>
                              <option value="delete">
                                {t(locale, 'odxImport.decision.delete')}
                              </option>
                            </select>
                          </td>
                          <td>
                            {needsConfirmation &&
                              (isConfirmed ? (
                                <span className="odx-import-confirmed">✓</span>
                              ) : (
                                <button type="button" onClick={(): void => confirmDecision(row)}>
                                  {decision === 'import'
                                    ? t(locale, 'odxImport.conflict.confirmImport')
                                    : t(locale, 'odxImport.delete.confirm')}
                                </button>
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="odx-import-actions">
              <button type="button" onClick={onClose}>
                {t(locale, 'odxImport.action.back')}
              </button>
              <button
                type="button"
                className="odx-import-primary"
                onClick={(): void => void commit()}
                disabled={!canCommit || busy}
              >
                {busy
                  ? t(locale, 'odxImport.action.committing')
                  : t(locale, 'odxImport.action.commit')}
              </button>
            </div>
          </section>
        )}

        {step === 'done' && (
          <section className="odx-import-body" data-testid="odx-import-step-done">
            <p>{t(locale, 'odxImport.done.body', committed)}</p>
            <p className="odx-import-muted">
              {t(locale, 'odxImport.done.manifest', { path: committed.manifestPath })}
            </p>
            <button type="button" className="odx-import-primary" onClick={onClose}>
              {t(locale, 'odxImport.close')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
