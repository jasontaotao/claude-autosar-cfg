// DbcViewer — P2 (spec §4.1) boundary wrapper. The viewer's own props
// contract is unchanged; a render crash inside the modal degrades to
// the in-modal error card whose Close exits the dialog.
import { type JSX } from 'react';

import { PanelErrorBoundary } from '../PanelErrorBoundary.js';
import { DbcViewerInner, type DbcViewerInnerProps } from './DbcViewerInner.js';

export type DbcViewerProps = DbcViewerInnerProps;

export function DbcViewer(props: DbcViewerProps): JSX.Element {
  const { locale, onClose, ...rest } = props;
  return (
    <PanelErrorBoundary panel="dbc-viewer" locale={locale} onClose={onClose}>
      <DbcViewerInner locale={locale} onClose={onClose} {...rest} />
    </PanelErrorBoundary>
  );
}
