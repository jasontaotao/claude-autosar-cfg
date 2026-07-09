// DcmConfigErrorToast — v1.31.0 PATCH T2.
// v1.35.0 MINOR T4 — expanded to 9-value camelCase union (was 6).
//
// Bottom-right toast surfacing a single Dcm config IPC error
// class. 8-second auto-dismiss; close button for immediate
// dismiss. aria-live="polite" so screen readers announce.
//
// Class → i18n key map is exhaustive (9 classes — one per
// v1.35.0 MINOR kind). The hook (`useDcmConfigLauncher`) is
// responsible for mapping `DcmConfigErrorKind` to
// `DcmConfigErrorClass` 1:1 via its KIND_TO_CLASS map. This
// component is a thin renderer of the resolved (classKey, message)
// pair.

import { useEffect, useRef } from 'react';

import { t } from '@shared/i18n/index.js';
import type { Locale, MessageKey } from '@shared/i18n/index.js';

import './DcmConfigErrorToast.css';

/**
 * v1.35.0 MINOR — 9-value camelCase error class union. 1:1 with
 * `DcmConfigErrorKind` (kebab-case) via the launcher's KIND_TO_CLASS map.
 * Mirrors `RendererDcmConfigErrorClass` shape; the toast is the consumer.
 *
 * v1.41.0 MINOR T3 (M3) — append `'noDcmBswmdFixture'` for the new
 * `no-dcm-bswmd-fixture` IPC kind. Toast renders the dedicated
 * i18n key (added in src/shared/i18n/odx.ts) so the actionable
 * fixture-discovery-failure message reaches the user.
 */
export type DcmConfigErrorClass =
  | 'bswmdUnreadable'
  | 'odxUnreadable'
  | 'odxParseFailed'
  | 'odxDcmLinkage'
  | 'dcmModuleMissing'
  | 'containerNotFound'
  | 'patchFailed'
  | 'atomicWriteFailed'
  | 'noDcmBswmdFixture'
  | 'unexpected';

export interface DcmConfigErrorToastProps {
  readonly error: { message: string; classKey: DcmConfigErrorClass } | null;
  readonly locale: Locale;
  readonly onDismiss: () => void;
}

const AUTO_DISMISS_MS = 8000;

const CLASS_KEY_TO_I18N: Readonly<Record<DcmConfigErrorClass, MessageKey>> = {
  bswmdUnreadable: 'odx.export.dcmConfig.error.bswmdUnreadable',
  odxUnreadable: 'odx.export.dcmConfig.error.odxUnreadable',
  odxParseFailed: 'odx.export.dcmConfig.error.odxParseFailed',
  odxDcmLinkage: 'odx.export.dcmConfig.error.odxDcmLinkage',
  dcmModuleMissing: 'odx.export.dcmConfig.error.dcmModuleMissing',
  containerNotFound: 'odx.export.dcmConfig.error.containerNotFound',
  patchFailed: 'odx.export.dcmConfig.error.patchFailed',
  atomicWriteFailed: 'odx.export.dcmConfig.error.atomicWriteFailed',
  // v1.41.0 MINOR T3 (M3) — typed envelope for the
  // `locateDcmBswmdPath` sample-fixture miss. Pre-T3 this was the
  // raw-`Error` fall-through to the catch-all `unexpected` bucket.
  noDcmBswmdFixture: 'odx.export.dcmConfig.error.noDcmBswmdFixture',
  unexpected: 'odx.export.dcmConfig.error.unexpected',
};

export function DcmConfigErrorToast(props: DcmConfigErrorToastProps): JSX.Element | null {
  const { error, locale, onDismiss } = props;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (error === null) return undefined;
    const id = setTimeout(() => {
      onDismissRef.current();
    }, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(id);
    };
  }, [error]);

  if (error === null) return null;

  const i18nKey = CLASS_KEY_TO_I18N[error.classKey];
  return (
    <div
      className={`dcm-config-error-toast dcm-config-error-toast--${error.classKey}`}
      role="status"
      aria-live="polite"
      data-testid="dcm-config-error-toast"
    >
      <span className="dcm-config-error-toast-message">
        {t(locale, i18nKey, { message: error.message })}
      </span>
      <button
        type="button"
        className="dcm-config-error-toast-dismiss"
        onClick={onDismiss}
        data-testid="dcm-config-error-toast-dismiss"
      >
        {t(locale, 'odx.export.dcmConfig.error.dismiss')}
      </button>
    </div>
  );
}
