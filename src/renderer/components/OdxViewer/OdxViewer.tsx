// OdxViewer — P2 (spec §4.1) boundary wrapper. The viewer's own props
// contract is unchanged; a render crash inside the modal degrades to
// the in-modal error card whose Close exits the dialog.
import { type JSX } from 'react';

import { PanelErrorBoundary } from '../PanelErrorBoundary.js';

import { OdxViewerInner, type OdxViewerInnerProps } from './OdxViewerInner.js';

export type OdxViewerProps = OdxViewerInnerProps;

export function OdxViewer(props: OdxViewerProps): JSX.Element {
  const { locale, onClose, ...rest } = props;
  return (
    <PanelErrorBoundary panel="odx-viewer" locale={locale} onClose={onClose}>
      <OdxViewerInner locale={locale} onClose={onClose} {...rest} />
    </PanelErrorBoundary>
  );
}
