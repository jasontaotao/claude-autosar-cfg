// XlsxBatchWizard — v1.25.0 T5 (3-Step Wizard UI + Menu Wiring).
//
// 3-step modal that drives the v1.25.0 T2/T3 IPC pipeline
// (`window.autosarApi.xlsxWriteBatchTemplate` / `xlsxParseBatch` /
// `xlsxCommitBatch`) end-to-end:
//   1. Step1 (DownloadTemplate) — invokes xlsxWriteBatchTemplate, then
//      exposes the bytes via a Blob URL anchor the user can save (the
//      simpler of the two save options; no OS dialog dependency in
//      the renderer).
//   2. Step2 (UploadAndPreview) — file input feeds xlsxParseBatch, then
//      renders the per-row collision table. Default resolution = skip
//      (per spec §error handling — safer than overwriting by default).
//   3. Step3 (Commit) — calls xlsxCommitBatch with the resolutions
//      map; success dialog shows the per-file added/overwritten/
//      skipped counts (i18n-translated summary).
//
// Pure presentational: no store access. The host (App.tsx) supplies
// the project manifest path, owns the open/close flag, and handles
// the IPC round-trip via callbacks. We do invoke `window.autosarApi`
// directly (mirrors DbcImportWizard's `onApply` host round-trip but
// keeps the IPC namespacing inside the wizard for the 3-IPC batch
// surface — the host passes the result back into the global error /
// info toast and triggers a project reload, mirroring the v1.23.0 T4
// DBC→Com-Stack pattern).
//
// Accessibility (mirrors DbcImportWizard / OdxViewer):
//   - Escape closes the modal
//   - Backdrop click closes; inner card stopPropagation prevents
//     table-row clicks from accidentally dismissing
//   - Initial focus moves to the close button on open
//   - Every user-visible string resolves via `t(locale, key)` —
//     no template-string English fallback (per v1.23.1 T1 L1 +
//     v1.24.0 T3.1 i18n-bypass lessons)

import { useCallback, useEffect, useRef, useState } from 'react';

import { t, type Locale } from '@shared/i18n/index.js';
import type {
  EcucInstanceRow,
  XlsxCommitBatchResponse,
  XlsxParseBatchResponse,
  XlsxWriteBatchTemplateResponse,
} from '@shared/types.js';

import './XlsxBatchWizard.css';

type Step = 'step1' | 'step2' | 'step3';

export interface XlsxBatchWizardProps {
  readonly onClose: () => void;
  /**
   * Absolute path to the active project's `.autosarcfg.json` manifest.
   * Empty string means "no project open" — the wizard surfaces an
   * error toast on every IPC call in that case (the host normally
   * hides the menu entry when no project is open).
   */
  readonly projectManifestPath: string;
  /**
   * Optional callback fired after a successful Step 3 commit. The
   * host (App.tsx) uses this to reload the project so the store
   * re-parses the freshly-written Com / CanIf / PduR ARXMLs — mirrors
   * the v1.23.0 T4 DBC wizard's `onApply` reload flow.
   */
  readonly onCommitted?: (res: XlsxCommitBatchResponse) => void;
  /**
   * Optional callback fired on every wizard-side error. The host
   * surfaces these via the global ErrorBanner with localized
   * toast keys (matches v1.23.0 / v1.24.0 / v1.23.1 T1 pattern).
   */
  readonly onError?: (message: string) => void;
  /**
   * Optional callback fired on every wizard-side success. The host
   * surfaces the localized summary via `setInfo(...)`.
   */
  readonly onSuccess?: (info: string) => void;
  /**
   * Locale bound to the host's `useArxmlStore`. Defaults to 'zh-CN'
   * to keep the existing call sites unchanged.
   */
  readonly locale?: Locale;
}

export function XlsxBatchWizard({
  onClose,
  projectManifestPath,
  onCommitted,
  onError,
  onSuccess,
  locale = 'zh-CN',
}: XlsxBatchWizardProps): JSX.Element {
  // Step routing — Step 1 on mount.
  const [step, setStep] = useState<Step>('step1');
  // Step 1 in-flight gate.
  const [downloading, setDownloading] = useState(false);
  // Step 2 state — the parsed instances + per-row collision map.
  const [instances, setInstances] = useState<readonly EcucInstanceRow[]>([]);
  const [collisions, setCollisions] = useState<Readonly<Record<string, boolean>>>({});
  // Per-collision-row resolution. Default = 'skip' (per spec §error
  // handling — safer than overwriting by default).
  const [resolutions, setResolutions] = useState<Record<string, 'overwrite' | 'skip'>>({});
  const [parsing, setParsing] = useState(false);
  // Step 3 in-flight gate.
  const [committing, setCommitting] = useState(false);
  // Ref for the close button so we can focus it on mount (a11y).
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Escape-to-close. Mirror DbcImportWizard's pattern.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Initial focus on the close button.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // ----- Step 1: download template -----
  const handleDownload = useCallback(async (): Promise<void> => {
    if (downloading) return;
    setDownloading(true);
    try {
      const api = window.autosarApi;
      if (api === undefined) {
        const msg = 'xlsxWriteBatchTemplate API not available';
        onError?.(msg);
        return;
      }
      const res: XlsxWriteBatchTemplateResponse = await api.xlsxWriteBatchTemplate({
        projectManifestPath,
      });
      if (!res.ok) {
        const key =
          res.error.kind === 'parse-failed' ? 'xlsxBatch.error.parse' : 'xlsxBatch.error.read';
        onError?.(t(locale, key, { message: res.error.message }));
        return;
      }
      // Trigger a browser save via a Blob anchor. The renderer's
      // happy-dom / jsdom stubs HTMLAnchorElement.click so this is
      // safe in tests; production browsers download the bytes via the
      // `<a download>` mechanism.
      const blob = new Blob([res.value.xlsxBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ecuc-batch-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }, [downloading, projectManifestPath, locale, onError]);

  // ----- Step 2: upload + parse -----
  const handleFileSelected = useCallback(
    async (file: File): Promise<void> => {
      if (parsing) return;
      setParsing(true);
      try {
        const api = window.autosarApi;
        if (api === undefined) {
          onError?.('xlsxParseBatch API not available');
          return;
        }
        // Read bytes via FileReader — more compatible across jsdom
        // (synthetic File objects may lack `arrayBuffer()`) and
        // production browsers than `file.arrayBuffer()`.
        const xlsxBytes = await new Promise<Uint8Array>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (): void => {
            const result = reader.result;
            if (result instanceof ArrayBuffer) {
              resolve(new Uint8Array(result));
            } else {
              reject(new Error('FileReader did not return an ArrayBuffer'));
            }
          };
          reader.onerror = (): void => {
            reject(reader.error ?? new Error('FileReader error'));
          };
          reader.readAsArrayBuffer(file);
        });
        const res: XlsxParseBatchResponse = await api.xlsxParseBatch({
          projectManifestPath,
          xlsxBytes,
        });
        if (!res.ok) {
          const key =
            res.error.kind === 'no-module-def'
              ? 'xlsxBatch.error.no-module-def'
              : res.error.kind === 'parse-failed'
                ? 'xlsxBatch.error.parse'
                : 'xlsxBatch.error.read';
          onError?.(
            res.error.kind === 'no-module-def'
              ? t(locale, key)
              : t(locale, key, { message: res.error.message }),
          );
          return;
        }
        setInstances(res.value.instances);
        setCollisions(res.value.collisions);
        // Pre-fill 'skip' for every collision row (default = safer).
        const initialResolutions: Record<string, 'overwrite' | 'skip'> = {};
        for (const key of Object.keys(res.value.collisions)) {
          if (res.value.collisions[key] === true) {
            initialResolutions[key] = 'skip';
          }
        }
        setResolutions(initialResolutions);
      } catch (e: unknown) {
        onError?.(e instanceof Error ? e.message : String(e));
      } finally {
        setParsing(false);
      }
    },
    [parsing, projectManifestPath, locale, onError],
  );

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (file === undefined) return;
      void handleFileSelected(file);
    },
    [handleFileSelected],
  );

  // ----- Step 3: commit -----
  const handleCommit = useCallback(async (): Promise<void> => {
    if (committing) return;
    setCommitting(true);
    try {
      const api = window.autosarApi;
      if (api === undefined) {
        onError?.('xlsxCommitBatch API not available');
        return;
      }
      // Build the resolutions map: every collision row needs an
      // explicit decision. Rows that are NOT in collisions map are
      // new additions and don't need a resolution entry (the IPC
      // handler treats absent entries as "add").
      const finalResolutions: Record<string, 'overwrite' | 'skip'> = { ...resolutions };
      for (const key of Object.keys(collisions)) {
        if (finalResolutions[key] === undefined) {
          finalResolutions[key] = 'skip';
        }
      }
      const res: XlsxCommitBatchResponse = await api.xlsxCommitBatch({
        projectManifestPath,
        instances,
        resolutions: finalResolutions,
      });
      if (!res.ok) {
        const key =
          res.error.kind === 'bridge-failed'
            ? 'xlsxBatch.error.bridge'
            : res.error.kind === 'write-failed'
              ? 'xlsxBatch.error.write'
              : res.error.kind === 'parse-failed'
                ? 'xlsxBatch.error.parse'
                : 'xlsxBatch.error.read';
        onError?.(t(locale, key, { message: res.error.message }));
        return;
      }
      const summary = t(locale, 'xlsxBatch.wizard.step3.summary', {
        added: res.value.added,
        overwritten: res.value.overwritten,
        skipped: res.value.skipped,
      });
      onSuccess?.(summary);
      onCommitted?.(res);
      onClose();
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }, [
    committing,
    projectManifestPath,
    instances,
    resolutions,
    collisions,
    locale,
    onError,
    onSuccess,
    onCommitted,
    onClose,
  ]);

  return (
    <div
      className="xlsx-wizard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="xlsx-wizard-title"
      data-testid="xlsx-wizard"
      onClick={onClose}
    >
      <div
        className="xlsx-wizard-modal"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="xlsx-wizard-header">
          <h2 id="xlsx-wizard-title" className="xlsx-wizard-title" data-testid="xlsx-wizard-title">
            {t(locale, 'xlsxBatch.wizard.title')}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="xlsx-wizard-close"
            onClick={onClose}
            aria-label={t(locale, 'xlsxBatch.wizard.close')}
            data-testid="xlsx-wizard-close"
          >
            ×
          </button>
        </header>
        {step === 'step1' && (
          <section className="xlsx-wizard-step" data-testid="xlsx-wizard-step1">
            <h3 className="xlsx-wizard-step-title">
              {t(locale, 'xlsxBatch.wizard.step1.download')}
            </h3>
            <p className="xlsx-wizard-step-desc">{t(locale, 'xlsxBatch.wizard.step2.upload')}</p>
            <div className="xlsx-wizard-actions">
              <button
                type="button"
                className="xlsx-wizard-btn xlsx-wizard-btn-primary"
                onClick={(): void => {
                  void handleDownload();
                }}
                disabled={downloading}
                data-testid="xlsx-wizard-step1-download"
              >
                {downloading
                  ? t(locale, 'xlsxBatch.wizard.step1.busy')
                  : t(locale, 'xlsxBatch.wizard.step1.download')}
              </button>
              <button
                type="button"
                className="xlsx-wizard-btn"
                onClick={(): void => {
                  setStep('step2');
                }}
                data-testid="xlsx-wizard-step1-next"
              >
                {t(locale, 'xlsxBatch.wizard.next')}
              </button>
            </div>
          </section>
        )}
        {step === 'step2' && (
          <section className="xlsx-wizard-step" data-testid="xlsx-wizard-step2">
            <h3 className="xlsx-wizard-step-title">{t(locale, 'xlsxBatch.wizard.step2.upload')}</h3>
            <label className="xlsx-wizard-field">
              <input
                type="file"
                accept=".xlsx"
                className="xlsx-wizard-file"
                onChange={onFileInputChange}
                data-testid="xlsx-wizard-file-input"
                aria-label={t(locale, 'xlsxBatch.wizard.step2.upload')}
              />
            </label>
            {parsing && (
              <p className="xlsx-wizard-step-desc">{t(locale, 'xlsxBatch.wizard.step1.busy')}</p>
            )}
            {Object.keys(collisions).length > 0 && (
              <table className="xlsx-wizard-table">
                <thead>
                  <tr>
                    <th>{t(locale, 'xlsxBatch.wizard.step2.collision')}</th>
                    <th>{t(locale, 'xlsxBatch.wizard.step2.collisionOverwrite')}</th>
                    <th>{t(locale, 'xlsxBatch.wizard.step2.collisionSkip')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(collisions).map((key) => (
                    <tr key={key} data-testid={`xlsx-wizard-collision-row-${key}`}>
                      <td>{key}</td>
                      <td>
                        <label>
                          <input
                            type="radio"
                            name={`res-${key}`}
                            value="overwrite"
                            checked={resolutions[key] === 'overwrite'}
                            onChange={(): void => {
                              setResolutions((prev) => ({ ...prev, [key]: 'overwrite' }));
                            }}
                            data-testid={`xlsx-wizard-res-overwrite-${key}`}
                          />
                          {t(locale, 'xlsxBatch.wizard.step2.collisionOverwrite')}
                        </label>
                      </td>
                      <td>
                        <label>
                          <input
                            type="radio"
                            name={`res-${key}`}
                            value="skip"
                            checked={resolutions[key] === 'skip' || resolutions[key] === undefined}
                            onChange={(): void => {
                              setResolutions((prev) => ({ ...prev, [key]: 'skip' }));
                            }}
                            data-testid={`xlsx-wizard-res-skip-${key}`}
                          />
                          {t(locale, 'xlsxBatch.wizard.step2.collisionSkip')}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="xlsx-wizard-actions">
              <button
                type="button"
                className="xlsx-wizard-btn"
                onClick={(): void => {
                  setStep('step1');
                }}
                data-testid="xlsx-wizard-step2-back"
              >
                {t(locale, 'xlsxBatch.wizard.back')}
              </button>
              <button
                type="button"
                className="xlsx-wizard-btn xlsx-wizard-btn-primary"
                onClick={(): void => {
                  setStep('step3');
                }}
                disabled={parsing || instances.length === 0}
                data-testid="xlsx-wizard-step2-next"
              >
                {t(locale, 'xlsxBatch.wizard.next')}
              </button>
            </div>
          </section>
        )}
        {step === 'step3' && (
          <section className="xlsx-wizard-step" data-testid="xlsx-wizard-step3">
            <h3 className="xlsx-wizard-step-title">{t(locale, 'xlsxBatch.wizard.step3.commit')}</h3>
            <p className="xlsx-wizard-step-desc">
              {t(locale, 'xlsxBatch.wizard.step3.summary', {
                added: 0,
                overwritten: 0,
                skipped: Object.keys(resolutions).filter((k) => resolutions[k] === 'skip').length,
              })}
            </p>
            <div className="xlsx-wizard-actions">
              <button
                type="button"
                className="xlsx-wizard-btn"
                onClick={(): void => {
                  setStep('step2');
                }}
                disabled={committing}
                data-testid="xlsx-wizard-step3-back"
              >
                {t(locale, 'xlsxBatch.wizard.back')}
              </button>
              <button
                type="button"
                className="xlsx-wizard-btn xlsx-wizard-btn-primary"
                onClick={(): void => {
                  void handleCommit();
                }}
                disabled={committing}
                data-testid="xlsx-wizard-commit"
              >
                {committing
                  ? t(locale, 'xlsxBatch.wizard.step3.committing')
                  : t(locale, 'xlsxBatch.wizard.step3.commit')}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
