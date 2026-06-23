// Sprint X v1.9.0 (HIGH #1) — `applyMutationResultToSource` /
// `applyMutationResultToActive` must thread `state.bswmdSchemas` to
// `computeDisplayDoc`. Without it, post-mutation fold falls back to the
// "no BSWMD" path so the displayDoc shape differs from pre-mutation,
// forcing a re-render and (worse) potentially hiding / showing vendor
// prefix layers inconsistently with what the user just edited.

import { describe, it, expect } from 'vitest';

import type { BswmdDocument } from '@core/project/bswmd.js';
import { parseArxml } from '@core/arxml/parser.js';

import { applyMutationResultToSource } from '../mutationErrors.js';
import type { ArxmlState } from '../../useArxmlStore.js';

function makeBswmd(modulePath: string): BswmdDocument {
  return {
    version: '4.6',
    modules: [
      {
        path: modulePath,
        shortName: modulePath.split('/').pop() ?? modulePath,
        containers: [],
        parameters: [],
        references: [],
      },
    ],
    warnings: [],
    disabledModules: new Set<string>(),
  };
}

function makeVendorPrefixSource() {
  // Source shape: JWQ_CDD_PACK > JWQ_Packet > JWQ3399 (the module
  // package). The renderer fold collapses it to a single top-level
  // `JWQ3399` when the BSWMD module path matches.
  const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME><AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>JWQ_Packet</SHORT-NAME><AR-PACKAGES>
      <AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME><ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>JWQ3399</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE><SHORT-NAME>JWQ3399ConfigSet</SHORT-NAME></ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS></AR-PACKAGE>
    </AR-PACKAGES></AR-PACKAGE>
  </AR-PACKAGES></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
  const r = parseArxml(xml);
  if (!r.ok) throw new Error(`parse: ${r.error}`);
  return r.value;
}

function makeStubState(overrides: Partial<ArxmlState> = {}): ArxmlState {
  // Only the fields applyMutationResultToSource reads are populated.
  // The other ArxmlState slots are filled with empty defaults to keep
  // the helper type-checked. Cast through `unknown` is intentional —
  // this is a focused unit test, not an integration shim.
  return {
    documents: [],
    documentPaths: [],
    doc: null,
    activeDocumentPath: '',
    viewMode: 'single',
    displayDoc: null,
    bswmdSchemas: [],
    bswmdPaths: [],
    dirtyPaths: new Set<string>(),
    warnings: [],
    validationErrors: [],
    lastValidatedAt: 0,
    error: null,
    ...overrides,
  } as unknown as ArxmlState;
}

describe('applyMutationResultToSource threads bswmdSchemas (HIGH #1)', () => {
  it('rebuilds displayDoc using the same bswmdSchemas so vendor fold stays stable', () => {
    const sourceDoc = makeVendorPrefixSource();
    const bswmd = [makeBswmd('/JWQ3399')];
    const nextSourceDoc = { ...sourceDoc, path: sourceDoc.path };
    const set = (() => {
      const captured: { state: Partial<ArxmlState> | null } = { state: null };
      const fn = (partial: Partial<ArxmlState>): void => {
        captured.state = { ...(captured.state ?? {}), ...partial };
      };
      return Object.assign(fn, { captured });
    })();

    const state = makeStubState({
      documents: [sourceDoc],
      documentPaths: ['/src/JWQ3399.arxml'],
      doc: sourceDoc,
      activeDocumentPath: '/src/JWQ3399.arxml',
      viewMode: 'single',
      bswmdSchemas: bswmd,
    });

    applyMutationResultToSource(
      set as unknown as (p: Partial<ArxmlState>) => void,
      state,
      0,
      nextSourceDoc,
      '/src/JWQ3399.arxml',
    );

    // The bug was that the post-mutation displayDoc lost the vendor
    // fold (because the helper called computeDisplayDoc without
    // bswmdSchemas). The fix threads `state.bswmdSchemas` through, so
    // the rebuilt displayDoc has the same shape as pre-mutation.
    const newDisplay = (set.captured.state as { displayDoc?: unknown } | null)
      ?.displayDoc;
    expect(newDisplay).not.toBeNull();
    // v1.9.0 Sprint X (MEDIUM #2) — the whitelist alone no longer
    // triggers a full collapse. The outer wrapper `JWQ_CDD_PACK`
    // stays because its inner `JWQ_Packet` is not in BSWMD. The
    // inner pair `JWQ_Packet > JWQ3399` collapses (BSWMD match),
    // so the final shape is 2-level: outer `JWQ_CDD_PACK` with
    // `JWQ3399` as its child. Without the BSWMD thread, the
    // post-mutation fold would have stopped at the outer level
    // (left as `JWQ_CDD_PACK > JWQ_Packet(> JWQ3399)`).
    const topPkg = (
      newDisplay as { packages: readonly { shortName: string; packages?: readonly { shortName: string }[] }[] } | null
    )?.packages?.[0];
    expect(topPkg?.shortName).toBe('JWQ_CDD_PACK');
    expect(topPkg?.packages?.[0]?.shortName).toBe('JWQ3399');
  });
});
