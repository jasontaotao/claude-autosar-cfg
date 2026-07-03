// i18n — ODX cluster types.
//
// Contains all `odx.*` keys covering the v1.22.0 T2 OdxViewer
// read-only modal (3 tabs: DTC / DID / Routine + stats + error
// envelopes + open / parse failures).

export interface OdxMessages {
  readonly 'odx.viewer.title': string;
  readonly 'odx.viewer.close': string;
  readonly 'odx.viewer.tabs.dtc': string;
  readonly 'odx.viewer.tabs.did': string;
  readonly 'odx.viewer.tabs.routine': string;
  readonly 'odx.viewer.stats.dtc': string; // {count}
  readonly 'odx.viewer.stats.did': string; // {count}
  readonly 'odx.viewer.stats.routine': string; // {count}
  readonly 'odx.viewer.dtc.id': string;
  readonly 'odx.viewer.dtc.name': string;
  readonly 'odx.viewer.dtc.code': string;
  readonly 'odx.viewer.dtc.text': string;
  readonly 'odx.viewer.did.id': string;
  readonly 'odx.viewer.did.name': string;
  readonly 'odx.viewer.routine.id': string;
  readonly 'odx.viewer.routine.name': string;
  readonly 'odx.viewer.empty': string; // {kind}
  readonly 'odx.viewer.errorTitle': string;
  readonly 'odx.open.failed': string; // {message}
  readonly 'odx.parse.failed': string; // {message}
}
