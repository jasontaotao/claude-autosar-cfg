// DcmConfigErrorToast — v1.31.0 PATCH T2.
//
// Bottom-right toast surfacing a single Dcm config IPC error
// class. 8-second auto-dismiss; close button for immediate
// dismiss. aria-live="polite" so screen readers announce.
//
// Class → i18n key map is exhaustive (6 classes — one per
// v1.30.0 handler error site). The hook (`useDcmConfigLauncher`)
// is responsible for mapping `error.message` to a class via
// regex prefix matching (see T4). This component is a thin
// renderer of the resolved (classKey, message) pair.

import { useEffect, useRef } from 'react';

import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';

import './DcmConfigErrorToast.css';

export type DcmConfigErrorClass =
  | 'bswmdUnreadable'
  | 'odxUnreadable'
  | 'odxParseFailed'
  | 'bswmdMapMissing'
  | 'atomicWriteFailed'
  | 'unexpected';

export interface DcmConfigErrorToastProps {
  readonly error: { message: string; classKey: DcmConfigErrorClass } | null;
  readonly locale: Locale;
  readonly onDismiss: () => void;
}

const AUTO_DISMISS_MS = 8000;

const CLASS_KEY_TO_I18N: Readonly<Record<DcmConfigErrorClass, string>> = {
  bswmdUnreadable: 'odx.export.dcmConfig.error.bswmdUnreadable',
  odxUnreadable: 'odx.export.dcmConfig.error.odxUnreadable',
  odxParseFailed: 'odx.export.dcmConfig.error.odxParseFailed',
  bswmdMapMissing: 'odx.export.dcmConfig.error.bswmdMapMissing',
  atomicWriteFailed: 'odx.export.dcmConfig.error.atomicWriteFailed',
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
