// @vitest-environment jsdom
//
// DbcImportWizard — Task 13 (4-step full-import wizard UI + state machine).
//
// The v1.23.0 3-step contract (select → preview → confirm with
// `onApply(dbcContent, targetNode)`) is replaced by the four-step
// preview/commit contract (source-target → policy → preview → apply).
// Behaviour pinned by tests (design spec §10.2):
//   1. Discovery preview request omits `targetNode`; the target node
//      <select> is populated ONLY from `preview.nodes` (DBC `BU_`
//      names).
//   2. Selecting a node triggers a mapping preview with `targetNode`.
//   3. Every policy change re-runs the mapping preview; stale
//      responses are dropped by a per-request sequence.
//   4. The current `profileId` is displayed on the policy step.
//   5. Rows are grouped by Com/CanIf/PduR and sorted by path.
//   6. Expanding a row shows field-level diffs with the exact source
//      badges Auto / Derived / Profile-default / Unmapped / Error.
//   7. Warnings group by code with a localized label, count, and
//      expandable detail.
//   8. Content scrolls independently; the commit button stays
//      reachable regardless of rows/warnings length.
//   9. Default decisions follow spec §8.2 (added/updated → import;
//      locally-modified/conflict/removed-in-dbc → keep-local).
//  10. Commit sends ONLY `{module, path, decision}` + previewHash —
//      never DBM/AST data.
//  11. A busy commit blocks close, Escape, and backdrop click.
//  12. Success calls `onImported` and shows applied/kept/deleted
//      counts; preview/commit errors render localized messages only
//      (no raw stack text).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DbmWarning } from '@core/dbc/dbm.js';
import { t } from '@shared/i18n/index.js';
import type {
  DbcFullImportCommitRequest,
  DbcFullImportCommitResponse,
  DbcFullImportPreview,
  DbcFullImportPreviewRequest,
  DbcFullImportPreviewResponse,
} from '@shared/types/dbc-import';

import { DbcImportWizard } from '../DbcImportWizard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DISCOVERY_PREVIEW: DbcFullImportPreview = {
  nodes: ['ECM', 'TCM'],
  targetModules: {
    Com: { exists: true, docPath: 'C:/proj/ecuc/Com.arxml', dirty: false },
    CanIf: { exists: true, docPath: 'C:/proj/ecuc/CanIf.arxml', dirty: false },
    PduR: { exists: true, docPath: 'C:/proj/ecuc/PduR.arxml', dirty: false },
  },
  rows: [],
  warnings: [],
  stats: { messages: 0, signals: 0, skippedIrrelevantMessages: 0, skippedMultiplexedSignals: 0 },
  previewHash: '',
} as const;

const WARNING_MULTIPLEXED = {
  code: 'dbc-multiplexed-signal',
  elementRef: 'PduSignal_7',
  message: 'multiplexed signal skipped',
} as const;

const WARNING_DEF_MISSING = {
  code: 'dbc-bswmd-def-missing',
  elementRef: 'ComConfig/ComIPdu',
  message: 'BSWMD definition not found',
} as const;

const DIFF_AUTO = {
  moduleName: 'Com' as const,
  containerPath: 'ComConfig/ComIPdu/ComSignal/PduSignal_1',
  paramKey: 'ComConfig/ComIPdu/ComSignal/ComBitPosition',
  local: 4,
  incoming: 8,
  source: 'Auto' as const,
};

const DIFF_DERIVED = {
  moduleName: 'Com' as const,
  containerPath: 'ComConfig/ComIPdu/ComSignal/PduSignal_2',
  paramKey: 'ComConfig/ComIPdu/ComSignal/ComSignalType',
  incoming: 'UINT8',
  source: 'Derived' as const,
};

const DIFF_UNMAPPED = {
  moduleName: 'CanIf' as const,
  containerPath: 'CanIfInitCfg/CanIfTxPduCfg/PduTx_1',
  paramKey: 'CanIfInitCfg/CanIfTxPduCfg/CanIfTxPduHth',
  incoming: 'CANIF_ONLY',
  source: 'Unmapped' as const,
};

/** 构造器行。Rows are deliberately not sorted/grouped so the test proves
 * the wizard renders them grouped by module + sorted by path (server also
 * sorts, but the renderer must not rely on input order). */
const BUILDER_ADDED = {
  module: 'CanIf' as const,
  path: 'CanIfInitCfg/CanIfTxPduCfg/PduTx_1',
  shortName: 'PduTx_1',
  category: 'added' as const,
  defaultDecision: 'import' as const,
  fieldDiffs: [DIFF_UNMAPPED],
};

const BUILDER_UPDATED_COM = {
  module: 'Com' as const,
  path: 'ComConfig/ComIPdu/ComSignal/PduSignal_1',
  shortName: 'PduSignal_1',
  category: 'updated' as const,
  defaultDecision: 'import' as const,
  fieldDiffs: [DIFF_AUTO, DIFF_DERIVED],
};

const BUILDER_LOCALLY_MODIFIED = {
  module: 'Com' as const,
  path: 'ComConfig/ComIPdu/ComSignal/PduSignal_2',
  shortName: 'PduSignal_2',
  category: 'locally-modified' as const,
  defaultDecision: 'keep-local' as const,
  fieldDiffs: [DIFF_DERIVED],
};

const BUILDER_REMOVED = {
  module: 'Com' as const,
  path: 'ComConfig/ComIPdu/ComSignal/PduSignal_3',
  shortName: 'PduSignal_3',
  category: 'removed-in-dbc' as const,
  defaultDecision: 'keep-local' as const,
  fieldDiffs: [],
};

const BUILDER_PDUR_CONFLICT = {
  module: 'PduR' as const,
  path: 'PduRRoutingPaths/PduRRoutingPath/Rt_1',
  shortName: 'Rt_1',
  category: 'conflict' as const,
  defaultDecision: 'keep-local' as const,
  conflictDetail: { localHash: 'aaa', incomingHash: 'bbb' },
  fieldDiffs: [],
};

const BUILDER_PDUR_ADDED = {
  module: 'PduR' as const,
  path: 'PduRRoutingPaths/PduRRoutingPath/Rt_2',
  shortName: 'Rt_2',
  category: 'added' as const,
  defaultDecision: 'import' as const,
  fieldDiffs: [],
};

const BUILDERS = [
  BUILDER_UPDATED_COM, // Com
  BUILDER_LOCALLY_MODIFIED, // Com
  BUILDER_REMOVED, // Com
  BUILDER_ADDED, // CanIf
  BUILDER_PDUR_CONFLICT, // PduR
  BUILDER_PDUR_ADDED, // PduR
];

/** Mapping-preview fixture with the default rows/warnings/stats. */
function mappingPreview(overrides?: {
  readonly rows?: readonly (typeof BUILDERS)[number][];
  readonly warnings?: readonly DbmWarning[];
  readonly nodes?: readonly string[];
}): DbcFullImportPreview {
  return {
    nodes: overrides?.nodes ?? DISCOVERY_PREVIEW.nodes,
    targetModules: DISCOVERY_PREVIEW.targetModules,
    rows: overrides?.rows ?? BUILDERS,
    warnings: overrides?.warnings ?? [WARNING_MULTIPLEXED, WARNING_DEF_MISSING],
    stats: {
      messages: 8,
      signals: 42,
      skippedIrrelevantMessages: 3,
      skippedMultiplexedSignals: 2,
    },
    previewHash: 'hash-abc',
  };
}

interface Harness {
  onClose: () => void;
  onPreview: (request: DbcFullImportPreviewRequest) => Promise<DbcFullImportPreviewResponse>;
  onCommit: (request: DbcFullImportCommitRequest) => Promise<DbcFullImportCommitResponse>;
  onImported: () => void;
  onPickDbc: () => Promise<string | null>;
}

/** 取 harness 回调底层 mock 的调用记录（harness 字段类型是普通函数签名）。 */
function callsOf(fn: (...args: never[]) => unknown): unknown[][] {
  return (fn as ReturnType<typeof vi.fn>).mock.calls;
}

/** 默认 harness：discovery（无 targetNode）返回 nodes，mapping 预览返回
 * BUILDERS 行集合（warnings/stats 完整），commit 直接成功。 */
function createHarness(): Harness {
  return {
    onClose: vi.fn(),
    onPreview: vi.fn((req: DbcFullImportPreviewRequest) =>
      Promise.resolve(
        req.targetNode === undefined
          ? { ok: true, value: DISCOVERY_PREVIEW }
          : { ok: true, value: mappingPreview() },
      ),
    ),
    onCommit: vi.fn(() =>
      Promise.resolve({
        ok: true,
        value: { applied: 1, kept: 1, deleted: 1, manifestPath: 'C:/proj/import-manifest.json' },
      }),
    ),
    onImported: vi.fn(),
    onPickDbc: vi.fn(() => Promise.resolve('C:/dbc/can.dbc')),
  };
}

function renderWizard(harness: Harness): void {
  render(
    <DbcImportWizard
      onClose={harness.onClose}
      onPreview={harness.onPreview}
      onCommit={harness.onCommit}
      onImported={harness.onImported}
      onPickDbc={harness.onPickDbc}
      dirtyDocPaths={[]}
      profileId="autosar-r22-can"
      locale="en"
    />,
  );
}

/** Pick DBC → discovery → select node → mapping preview → back at the
 * policy step (next is required to enter the preview step). */
async function driveToPolicyStep(harness: Harness): Promise<void> {
  renderWizard(harness);
  fireEvent.click(screen.getByTestId('dbc-wizard-pick-file'));
  await waitFor(() => expect(screen.getByTestId('dbc-wizard-target-node')).not.toBeNull());
  fireEvent.change(screen.getByTestId('dbc-wizard-target-node'), { target: { value: 'ECM' } });
  await waitFor(() => expect(screen.getByTestId('dbc-wizard-step-policy')).not.toBeNull());
}

/** driveToPolicyStep + Continue → preview step. */
async function driveToPreviewStep(harness: Harness): Promise<void> {
  await driveToPolicyStep(harness);
  fireEvent.click(screen.getByTestId('dbc-wizard-next'));
  expect(screen.getByTestId('dbc-wizard-step-preview')).not.toBeNull();
}

describe('DbcImportWizard (4-step full import)', () => {
  afterEach(() => cleanup());

  it('walks the four steps in order: source-target → policy → preview → apply', async () => {
    const harness = createHarness();
    renderWizard(harness);
    // Step 1 — Source & Target
    expect(screen.getByTestId('dbc-wizard-step-source-target')).not.toBeNull();
    expect(screen.queryByTestId('dbc-wizard-step-policy')).toBeNull();
    expect(screen.queryByTestId('dbc-wizard-step-preview')).toBeNull();
    expect(screen.queryByTestId('dbc-wizard-step-apply')).toBeNull();

    // Step 1 → Step 2 (Mapping Policy)
    fireEvent.click(screen.getByTestId('dbc-wizard-pick-file'));
    await waitFor(() => expect(screen.getByTestId('dbc-wizard-target-node')).not.toBeNull());
    fireEvent.change(screen.getByTestId('dbc-wizard-target-node'), { target: { value: 'ECM' } });
    await waitFor(() => expect(screen.getByTestId('dbc-wizard-step-policy')).not.toBeNull());

    // Step 2 → Step 3 (Preview & Decisions)
    fireEvent.click(screen.getByTestId('dbc-wizard-next'));
    expect(screen.getByTestId('dbc-wizard-step-preview')).not.toBeNull();

    // Step 3 → Step 4 (Apply)
    fireEvent.click(screen.getByTestId('dbc-wizard-commit'));
    await waitFor(() => expect(screen.getByTestId('dbc-wizard-step-apply')).not.toBeNull());
    expect(harness.onImported).toHaveBeenCalledTimes(1);
  });

  it('picks a DBC: the discovery preview omits targetNode; node select comes only from preview.nodes', async () => {
    const harness = createHarness();
    renderWizard(harness);
    fireEvent.click(screen.getByTestId('dbc-wizard-pick-file'));
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(1));

    const discoveryRequest = callsOf(harness.onPreview)[0]?.[0] as {
      dbcPath: string;
      targetNode?: string;
      dirtyDocPaths: readonly string[];
      profileId: string;
    };
    expect(discoveryRequest.dbcPath).toBe('C:/dbc/can.dbc');
    expect(discoveryRequest.targetNode).toBeUndefined();
    expect(discoveryRequest.profileId).toBe('autosar-r22-can');

    // Node select populated ONLY from preview.nodes (DBC BU_ names)
    const select = (await screen.findByTestId('dbc-wizard-target-node')) as HTMLSelectElement;
    const options = within(select)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', 'ECM', 'TCM']);
  });

  it('selecting a node calls preview again with that targetNode', async () => {
    const harness = createHarness();
    renderWizard(harness);
    fireEvent.click(screen.getByTestId('dbc-wizard-pick-file'));
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(1));
    fireEvent.change(await screen.findByTestId('dbc-wizard-target-node'), {
      target: { value: 'TCM' },
    });
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(2));
    const mappingRequest = callsOf(harness.onPreview)[1]?.[0] as {
      dbcPath: string;
      targetNode?: string;
    };
    expect(mappingRequest.dbcPath).toBe('C:/dbc/can.dbc');
    expect(mappingRequest.targetNode).toBe('TCM');
    // Policy step reached with the mapping preview data
    await waitFor(() => expect(screen.getByTestId('dbc-wizard-step-policy')).not.toBeNull());
  });

  it('policy changes re-run preview with the new policy; stale preview responses are discarded', async () => {
    const harness = createHarness();
    harness.onPreview = vi.fn((req: { targetNode?: string }) =>
      Promise.resolve(
        req.targetNode === undefined
          ? { ok: true, value: DISCOVERY_PREVIEW }
          : { ok: true, value: mappingPreview() },
      ),
    );
    const { rerender } = render(
      <DbcImportWizard
        onClose={harness.onClose}
        onPreview={harness.onPreview}
        onCommit={harness.onCommit}
        onImported={harness.onImported}
        onPickDbc={harness.onPickDbc}
        dirtyDocPaths={[]}
        profileId="autosar-r22-can"
        locale="en"
      />,
    );
    fireEvent.click(screen.getByTestId('dbc-wizard-pick-file'));
    await waitFor(() => expect(screen.getByTestId('dbc-wizard-target-node')).not.toBeNull());
    fireEvent.change(screen.getByTestId('dbc-wizard-target-node'), { target: { value: 'ECM' } });
    await waitFor(() => expect(screen.getByTestId('dbc-wizard-step-policy')).not.toBeNull());
    expect(harness.onPreview).toHaveBeenCalledTimes(2);

    // PduId base change → preview re-runs with pduIdPolicy.txBase
    fireEvent.change(screen.getByTestId('dbc-wizard-pdu-tx-base'), { target: { value: '2048' } });
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(3));
    const txBaseRequest = callsOf(harness.onPreview)[2]?.[0] as {
      pduIdPolicy?: { txBase?: number };
    };
    expect(txBaseRequest.pduIdPolicy?.txBase).toBe(2048);

    // PduId order change → preview re-runs with pduIdPolicy.order
    fireEvent.change(screen.getByTestId('dbc-wizard-pdu-order'), {
      target: { value: 'shortName-order' },
    });
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(4));
    const orderRequest = callsOf(harness.onPreview)[3]?.[0] as {
      pduIdPolicy?: { order?: string };
    };
    expect(orderRequest.pduIdPolicy?.order).toBe('shortName-order');

    // UL enablement change → preview re-runs with upperLayerNaming.enabled
    fireEvent.click(screen.getByTestId('dbc-wizard-ul-enabled'));
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(5));
    const ulRequest = callsOf(harness.onPreview)[4]?.[0] as {
      upperLayerNaming?: { enabled?: boolean };
    };
    expect(ulRequest.upperLayerNaming?.enabled).toBe(true);

    // Stale-response drop: two rapid changes; the FIRST request resolves
    // AFTER the second, but the wizard must keep the LAST request's data.
    // The two responses carry DIFFERENT data (A = empty rows, B = one PduR
    // row) so this test actually proves the seq guard: if the stale
    // response A were applied last, the preview step would render no rows.
    const gate: (() => Promise<void>)[] = [];
    let mappingCall = 0;
    const gatedPreview = vi.fn(
      (req: DbcFullImportPreviewRequest): Promise<DbcFullImportPreviewResponse> => {
        if (req.targetNode === undefined) {
          return Promise.resolve({ ok: true, value: DISCOVERY_PREVIEW });
        }
        const call = mappingCall++;
        return new Promise<DbcFullImportPreviewResponse>((resolve) => {
          gate.push(() => {
            // call 0 = tx-base change (request #1), call 1 = step change
            // (request #2, the authoritative LAST response).
            resolve({
              ok: true,
              value:
                call === 1
                  ? mappingPreview({ rows: [BUILDER_PDUR_ADDED], warnings: [] })
                  : mappingPreview({ rows: [], warnings: [] }),
            });
            return Promise.resolve();
          });
        });
      },
    );
    // rerender 传新 mock：React 在重渲染前 props 保持旧引用，直接赋值不生效
    rerender(
      <DbcImportWizard
        onClose={harness.onClose}
        onPreview={gatedPreview}
        onCommit={harness.onCommit}
        onImported={harness.onImported}
        onPickDbc={harness.onPickDbc}
        dirtyDocPaths={[]}
        profileId="autosar-r22-can"
        locale="en"
      />,
    );
    fireEvent.change(screen.getByTestId('dbc-wizard-pdu-tx-base'), { target: { value: '4096' } });
    fireEvent.change(screen.getByTestId('dbc-wizard-pdu-step'), { target: { value: '2' } });
    await waitFor(() => expect(gate).toHaveLength(2));

    // Resolve the SECOND request first, then the FIRST (stale).
    await gate[1]!();
    await gate[0]!();

    // The gated mock sees exactly the 2 rapid policy changes.
    await waitFor(() => {
      expect(gatedPreview).toHaveBeenCalledTimes(2);
    });
    // The LAST request carries BOTH accumulated policy changes.
    const stepRequest = gatedPreview.mock.calls[1]?.[0] as {
      pduIdPolicy?: { txBase?: number; step?: number };
    };
    expect(stepRequest.pduIdPolicy?.txBase).toBe(4096);
    expect(stepRequest.pduIdPolicy?.step).toBe(2);

    // Seq-guard proof: the preview step must reflect the LAST response
    // (the PduR row), not the stale empty response that resolved last.
    fireEvent.click(screen.getByTestId('dbc-wizard-next'));
    await waitFor(() =>
      expect(
        screen.getByTestId('dbc-wizard-row-PduRRoutingPaths/PduRRoutingPath/Rt_2'),
      ).not.toBeNull(),
    );
    expect(screen.queryByTestId('dbc-wizard-group-Com')).toBeNull();
  });

  // Cross-group preservation: editing ONE policy group must never wipe the
  // OTHER group's user input. Regression for handlePolicyChange dispatching
  // `undefined` for the absent partial, which silently reset the other slot.
  it('toggling UL after setting a PduId value keeps pduIdPolicy.txBase in the preview request', async () => {
    const harness = createHarness();
    await driveToPolicyStep(harness);
    expect(harness.onPreview).toHaveBeenCalledTimes(2);

    // Set PduId txBase = 2048 → preview call #3
    fireEvent.change(screen.getByTestId('dbc-wizard-pdu-tx-base'), { target: { value: '2048' } });
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(3));

    // Toggle the UL checkbox (upperLayerNaming partial; pduIdPolicy absent)
    fireEvent.click(screen.getByTestId('dbc-wizard-ul-enabled'));
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(4));

    const ulRequest = callsOf(harness.onPreview)[3]?.[0] as {
      pduIdPolicy?: { txBase?: number };
      upperLayerNaming?: { enabled?: boolean };
    };
    expect(ulRequest.upperLayerNaming?.enabled).toBe(true);
    // The PduId override set before the UL toggle must survive.
    expect(ulRequest.pduIdPolicy?.txBase).toBe(2048);
  });

  it('editing a PduId field after enabling UL keeps upperLayerNaming enabled', async () => {
    const harness = createHarness();
    await driveToPolicyStep(harness);
    expect(harness.onPreview).toHaveBeenCalledTimes(2);

    // Enable UL → preview call #3
    fireEvent.click(screen.getByTestId('dbc-wizard-ul-enabled'));
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(3));

    // Edit a PduId field (pduIdPolicy partial; upperLayerNaming absent)
    fireEvent.change(screen.getByTestId('dbc-wizard-pdu-tx-base'), { target: { value: '2048' } });
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(4));

    const pduRequest = callsOf(harness.onPreview)[3]?.[0] as {
      pduIdPolicy?: { txBase?: number };
      upperLayerNaming?: { enabled?: boolean };
    };
    expect(pduRequest.pduIdPolicy?.txBase).toBe(2048);
    // The UL enablement must survive; the controlled checkbox stays checked.
    expect(pduRequest.upperLayerNaming?.enabled).toBe(true);
    expect((screen.getByTestId('dbc-wizard-ul-enabled') as HTMLInputElement).checked).toBe(true);
  });

  it('shows the current profileId on the Mapping Policy step', async () => {
    const harness = createHarness();
    await driveToPolicyStep(harness);
    expect(screen.getByTestId('dbc-wizard-profile-id').textContent).toContain('autosar-r22-can');
  });

  it('pre-fills the PduId policy inputs with the profile defaults', async () => {
    const harness = createHarness();
    await driveToPolicyStep(harness);
    const txBase = screen.getByTestId('dbc-wizard-pdu-tx-base') as HTMLInputElement;
    const rxBase = screen.getByTestId('dbc-wizard-pdu-rx-base') as HTMLInputElement;
    const step = screen.getByTestId('dbc-wizard-pdu-step') as HTMLInputElement;
    const order = screen.getByTestId('dbc-wizard-pdu-order') as HTMLSelectElement;
    // DEFAULT_PDU_ID_POLICY (profile.ts): txBase 0x0000, rxBase 0x1000,
    // step 1, order 'document-order'. 用户无需手工填写即可带默认策略继续。
    expect(txBase.value).toBe('0');
    expect(rxBase.value).toBe('4096');
    expect(step.value).toBe('1');
    expect(order.value).toBe('document-order');
  });

  it('groups rows by Com/CanIf/PduR and sorts each group by path', async () => {
    const harness = createHarness();
    await driveToPreviewStep(harness);

    const comGroup = screen.getByTestId('dbc-wizard-group-Com');
    const comPaths = within(comGroup)
      .getAllByTestId(/^dbc-wizard-row-/, { exact: false })
      .map((el) => el.getAttribute('data-testid') ?? '')
      .filter((tid) => !tid.includes('-expand-'));
    expect(comPaths).toEqual([
      'dbc-wizard-row-ComConfig/ComIPdu/ComSignal/PduSignal_1',
      'dbc-wizard-row-ComConfig/ComIPdu/ComSignal/PduSignal_2',
      'dbc-wizard-row-ComConfig/ComIPdu/ComSignal/PduSignal_3',
    ]);

    const pduRGroup = screen.getByTestId('dbc-wizard-group-PduR');
    const pduRPaths = within(pduRGroup)
      .getAllByTestId(/^dbc-wizard-row-/, { exact: false })
      .map((el) => el.getAttribute('data-testid') ?? '')
      .filter((tid) => !tid.includes('-expand-'));
    expect(pduRPaths).toEqual([
      'dbc-wizard-row-PduRRoutingPaths/PduRRoutingPath/Rt_1',
      'dbc-wizard-row-PduRRoutingPaths/PduRRoutingPath/Rt_2',
    ]);
  });

  it('expands a row to show field-level diffs with exact source badges', async () => {
    const harness = createHarness();
    await driveToPreviewStep(harness);

    const rowPath = 'ComConfig/ComIPdu/ComSignal/PduSignal_1';
    fireEvent.click(screen.getByTestId(`dbc-wizard-row-expand-${rowPath}`));

    const diffs = await screen.findByTestId(`dbc-wizard-diffs-${rowPath}`);
    const badgeTexts = within(diffs)
      .getAllByTestId(/^dbc-wizard-source-/, { exact: false })
      .map((b) => (b as HTMLElement).textContent ?? '');
    expect(badgeTexts).toContain('Auto');
    expect(badgeTexts).toContain('Derived');
    // Local vs incoming values are shown for the Auto diff
    expect(diffs.textContent).toContain('ComBitPosition');
    expect(diffs.textContent).toContain('4');
    expect(diffs.textContent).toContain('8');
  });

  it('renders warnings grouped by code with localized label + count + expandable detail', async () => {
    const harness = createHarness();
    harness.onPreview = vi.fn((req: DbcFullImportPreviewRequest) =>
      Promise.resolve(
        req.targetNode === undefined
          ? { ok: true, value: DISCOVERY_PREVIEW }
          : {
              ok: true,
              value: mappingPreview({
                rows: [],
                warnings: [WARNING_MULTIPLEXED, WARNING_MULTIPLEXED, WARNING_DEF_MISSING],
              }),
            },
      ),
    );
    await driveToPreviewStep(harness);

    const group = screen.getByTestId('dbc-wizard-warning-group-dbc-multiplexed-signal');
    expect(group.textContent).toContain(t('en', 'dbc.import.warning.dbc-multiplexed-signal'));
    expect(group.textContent).toContain('2');

    const detail = (await screen.findByTestId(
      'dbc-wizard-warning-detail-dbc-multiplexed-signal',
    )) as HTMLDetailsElement;
    expect(detail.open).toBe(false);
    fireEvent.click(group.querySelector('summary') as HTMLElement);
    await waitFor(() => expect(detail.open).toBe(true));
    expect(detail.textContent).toContain('multiplexed signal skipped');
  });

  it('keeps the commit button outside the scroll containers (long content cannot hide it)', async () => {
    const harness = createHarness();
    await driveToPreviewStep(harness);

    const commitButton = screen.getByTestId('dbc-wizard-commit');
    const rowsContainer = screen.getByTestId('dbc-wizard-rows-scroll');
    const warningsContainer = screen.getByTestId('dbc-wizard-warnings-scroll');
    // Both containers carry the scroll CSS class; the commit button lives
    // in the actions bar OUTSIDE them so long lists cannot push it away.
    expect(rowsContainer.className).toContain('dbc-wizard-rows-scroll');
    expect(warningsContainer.className).toContain('dbc-wizard-warnings-scroll');
    expect(rowsContainer.contains(commitButton)).toBe(false);
    expect(warningsContainer.contains(commitButton)).toBe(false);
  });

  it('does not shrink module groups inside the scroll containers (PduR stays reachable)', () => {
    // 回归守卫：jsdom 无法渲染 flex 布局，此处直接锁定 CSS 规则。根因：
    // rows-scroll 是 flex column，子项 group 若允许 flex-shrink:1 会被压缩，
    // 配合 group 自身 overflow:hidden 把 DOM 末尾的 PduR 分组裁剪掉，滚动条
    // 永不出现。flex-shrink:0 让超高转交给 rows-scroll 的 overflow:auto。
    const css = readFileSync(resolve(__dirname, '../DbcImportWizard.css'), 'utf8');
    expect(css).toMatch(/\.dbc-wizard-group\s*{[^}]*flex-shrink:\s*0/);
    expect(css).toMatch(/\.dbc-wizard-warning-group-wrap\s*{[^}]*flex-shrink:\s*0/);
  });

  it('defaults: added/updated → import; locally-modified/conflict/removed-in-dbc → keep-local', async () => {
    const harness = createHarness();
    await driveToPreviewStep(harness);

    const decisionOf = (path: string): string =>
      (screen.getByTestId(`dbc-wizard-decision-${path}`) as HTMLSelectElement).value;
    expect(decisionOf('ComConfig/ComIPdu/ComSignal/PduSignal_1')).toBe('import'); // updated
    expect(decisionOf('PduRRoutingPaths/PduRRoutingPath/Rt_2')).toBe('import'); // added
    expect(decisionOf('ComConfig/ComIPdu/ComSignal/PduSignal_2')).toBe('keep-local'); // locally-modified
    expect(decisionOf('PduRRoutingPaths/PduRRoutingPath/Rt_1')).toBe('keep-local'); // conflict
    expect(decisionOf('ComConfig/ComIPdu/ComSignal/PduSignal_3')).toBe('keep-local'); // removed-in-dbc
  });

  it('commits only {module, path, decision} + previewHash — never DBM/AST data', async () => {
    const harness = createHarness();
    await driveToPreviewStep(harness);

    fireEvent.change(
      screen.getByTestId('dbc-wizard-decision-PduRRoutingPaths/PduRRoutingPath/Rt_1'),
      { target: { value: 'import' } },
    );
    fireEvent.click(screen.getByTestId('dbc-wizard-commit'));
    await waitFor(() => expect(harness.onCommit).toHaveBeenCalledTimes(1));

    const request = callsOf(harness.onCommit)[0]?.[0] as DbcFullImportCommitRequest;
    expect(request.previewHash).toBe('hash-abc');
    expect(request.targetNode).toBe('ECM');
    expect(request.dbcPath).toBe('C:/dbc/can.dbc');
    expect(request.decisions).toEqual([
      { module: 'CanIf', path: 'CanIfInitCfg/CanIfTxPduCfg/PduTx_1', decision: 'import' },
      { module: 'Com', path: 'ComConfig/ComIPdu/ComSignal/PduSignal_1', decision: 'import' },
      { module: 'Com', path: 'ComConfig/ComIPdu/ComSignal/PduSignal_2', decision: 'keep-local' },
      { module: 'Com', path: 'ComConfig/ComIPdu/ComSignal/PduSignal_3', decision: 'keep-local' },
      { module: 'PduR', path: 'PduRRoutingPaths/PduRRoutingPath/Rt_1', decision: 'import' },
      { module: 'PduR', path: 'PduRRoutingPaths/PduRRoutingPath/Rt_2', decision: 'import' },
    ]);
    // No DBM/AST-like payload may cross IPC.
    expect(JSON.stringify(request)).not.toContain('BU_');
    expect(JSON.stringify(request)).not.toContain('signalCount');
    expect('fieldDiffs' in request).toBe(false);
  });

  it('busy commit disables close, Escape, and backdrop click', async () => {
    const harness = createHarness();
    let releaseCommit: (() => void) | undefined;
    harness.onCommit = vi.fn(
      () =>
        new Promise<DbcFullImportCommitResponse>((resolve) => {
          releaseCommit = (): void =>
            resolve({
              ok: true,
              value: {
                applied: 1,
                kept: 1,
                deleted: 1,
                manifestPath: 'C:/proj/import-manifest.json',
              },
            });
        }),
    );
    await driveToPreviewStep(harness);

    fireEvent.click(screen.getByTestId('dbc-wizard-commit'));
    await waitFor(() => expect(harness.onCommit).toHaveBeenCalledTimes(1));

    // Busy: close button disabled, Escape ignored, backdrop click ignored
    const closeButton = screen.getByTestId('dbc-wizard-close') as HTMLButtonElement;
    expect(closeButton.disabled).toBe(true);
    fireEvent.click(closeButton);
    expect(harness.onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(harness.onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('dbc-wizard-backdrop'));
    expect(harness.onClose).not.toHaveBeenCalled();

    releaseCommit?.();
    await waitFor(() => expect(screen.getByTestId('dbc-wizard-step-apply')).not.toBeNull());
  });

  it('success calls onImported and shows applied/kept/deleted counts', async () => {
    const harness = createHarness();
    await driveToPreviewStep(harness);
    fireEvent.click(screen.getByTestId('dbc-wizard-commit'));
    await waitFor(() => expect(harness.onImported).toHaveBeenCalledTimes(1));
    const applyStep = screen.getByTestId('dbc-wizard-step-apply');
    expect(applyStep.textContent).toContain('C:/proj/import-manifest.json');
  });

  it('preview error renders a localized message and no raw stack text', async () => {
    const harness = createHarness();
    harness.onPreview = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: { kind: 'dbc-bswmd-not-loaded', message: 'Bswmd load failed' },
      }),
    );
    renderWizard(harness);
    fireEvent.click(screen.getByTestId('dbc-wizard-pick-file'));
    await waitFor(() => expect(harness.onPreview).toHaveBeenCalledTimes(1));

    const alert = (await screen.findByTestId('dbc-wizard-error')) as HTMLElement;
    expect(alert.textContent).toContain(t('en', 'dbc.import.error.dbc-bswmd-not-loaded'));
    expect(alert.textContent).not.toMatch(/at .+\.(tsx|ts|js):\d+/);
  });

  it('commit error renders a localized message and no raw stack text', async () => {
    const harness = createHarness();
    harness.onCommit = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: {
          kind: 'write-failed',
          message: 'EACCES: permission denied',
          rolledBack: true,
        },
      }),
    );
    await driveToPreviewStep(harness);
    fireEvent.click(screen.getByTestId('dbc-wizard-commit'));
    const alert = await screen.findByTestId('dbc-wizard-error');
    expect(alert.textContent).toContain(t('en', 'dbc.import.error.write-failed'));
    expect(alert.textContent).not.toMatch(/at .+\.js:\d+/);
  });

  it('stats show messages, signals, skippedIrrelevantMessages, and skippedMultiplexedSignals', async () => {
    const harness = createHarness();
    await driveToPreviewStep(harness);
    expect(screen.getByTestId('dbc-wizard-stat-messages').textContent).toContain('8');
    expect(screen.getByTestId('dbc-wizard-stat-signals').textContent).toContain('42');
    expect(screen.getByTestId('dbc-wizard-stat-skipped-irrelevant').textContent).toContain('3');
    expect(screen.getByTestId('dbc-wizard-stat-skipped-multiplexed').textContent).toContain('2');
  });
});
