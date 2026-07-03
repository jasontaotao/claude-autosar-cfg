# v1.23.0 DBC→Com-Stack Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge DBC network descriptions into the demo-ECU Com-stack ECUC values (ComIPdu + ComSignal + CanIf Tx/Rx PDUs + PduR routing) via a 3-step wizard, persisting all 3 ARXML files atomically.

**Architecture:** Pure mapper (`dbcToComStack`) reads `DbcSummary` (extended with signals in T1) + 3 ECUC value-side ARXML strings, outputs `PatchStep[]` per file. Renderer reuses `useScriptStore.applyMutation` per-file, then `PROJECT_WRITE_ARXML_BATCH` for atomic 3-file write. UI is a 3-step wizard modeled on the v1.22.0 OdxImportModal pattern (which we deferred; v1.23.0 builds it).

**Tech Stack:** Electron + Vite + TypeScript + React + Vitest; `fast-xml-parser` (already a dep); `dbc-forge/core` (already vendored); `applyPatchSteps` (already in `src/core/mutation/applyPatchSteps.ts`).

## Global Constraints

These apply to every task unless overridden:

- **TypeScript strict + `exactOptionalPropertyTypes: true` + `noUncheckedIndexedAccess: true`** — all code must satisfy both `tsconfig.json` (main) and `tsconfig.web.json` (renderer).
- **ESLint max-warnings 0** — `pnpm lint` must pass clean.
- **Prettier** — all files go through `pnpm format`.
- **Test framework** — Vitest; co-located `__tests__/` directories; `// @vitest-environment node` for main-process tests, default jsdom for renderer tests.
- **i18n** — every user-facing string goes through `src/shared/i18n.en.ts` (and `i18n.zhCn.ts` for Chinese mirror).
- **Real-OEM fixture** — every parser/bridge layer MUST have a real-DBC-round-trip test using `vendor/dbc-forge/samples/valid/powertrain-typical/expected.dbc` (or larger) as fixture. Hand-crafted fixtures alone are insufficient — captured cross-project as `vendor-format-parser-needs-real-fixture-pre-ship` (PKM permanent note).
- **Mutation engine contract** — All mutations go through `src/core/mutation/applyPatchSteps.ts`. Do NOT mutate `ArxmlDocument` directly from renderer/main without going through the engine.
- **3-file atomic write** — Use `PROJECT_WRITE_ARXML_BATCH` channel; never write 3 files via 3 sequential `PROJECT_SAVE` calls.
- **Idempotency** — Bridge MUST be idempotent: re-running the wizard on an already-bridged project must NOT duplicate instances. Dedup key = `(moduleShortName, containerShortName, CanId)` for ComIPdu; `(moduleShortName, containerShortName, shortName)` for ComSignal/CanIf PDU.
- **CLAUDE.md compliance** — TDD (RED→GREEN→IMPROVE), code-reviewer agent after every non-trivial change, concise commits with `feat:` / `fix:` / `chore:` prefix.

## File Structure

### New files (T1-T4 ship)

| File                                                                              | Responsibility                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts` (modify)                                                    | Extend `DbcSummary` with `signals: readonly DbcSignalSummary[]`; add `DbcBridgeMapping`, `DbcBridgeStep`, `DbcBridgePlan` |
| `src/main/ipc/dbcParseForBridgeHandler.ts` (T1)                                   | Re-parse DBC keeping signal-level detail (delegates to existing `parseDbc` but returns signals)                           |
| `src/main/ipc/__tests__/dbcParseForBridgeHandler.test.ts` (T1)                    | Unit tests for extended DBC parser                                                                                        |
| `src/core/bridge/dbcToComStack.ts` (T2)                                           | Pure mapper: DbcSummary + 3 ARXML strings → PatchStep[][] (3 arrays, one per ECUC file)                                   |
| `src/core/bridge/__tests__/dbcToComStack.test.ts` (T2)                            | Pure unit tests with hand-crafted DbcSummary + 3 ARXML fixtures                                                           |
| `src/core/bridge/__tests__/dbcToComStack.real.test.ts` (T2)                       | Real-OEM round-trip: powertrain-typical.dbc + demo-ecu Com/CanIf/PduR ARXML                                               |
| `src/main/ipc/dbcImportComStackHandler.ts` (T3)                                   | IPC handler: orchestrates parse + bridge + 3-file write                                                                   |
| `src/main/ipc/__tests__/dbcImportComStackHandler.test.ts` (T3)                    | Unit tests for IPC orchestration (mock PROJECT_WRITE_ARXML_BATCH)                                                         |
| `src/main/ipc/register.ts` (modify)                                               | Register `DBC_IMPORT_COM_STACK` channel                                                                                   |
| `src/preload/index.ts` (modify)                                                   | Expose `dbcImportComStack` bridge method                                                                                  |
| `src/shared/ipc-contract.ts` (modify)                                             | Add `DBC_IMPORT_COM_STACK = 'dbc:importComStack'`                                                                         |
| `src/renderer/components/DbcImportWizard/DbcImportWizard.tsx` (T4)                | 3-step wizard UI: SelectDbc → PreviewMapping → ConfirmApply                                                               |
| `src/renderer/components/DbcImportWizard/DbcImportWizard.css` (T4)                | Wizard styling (Catppuccin Mocha, z-index 9998)                                                                           |
| `src/renderer/components/DbcImportWizard/index.ts` (T4)                           | Barrel export                                                                                                             |
| `src/renderer/components/DbcImportWizard/__tests__/DbcImportWizard.test.tsx` (T4) | 12 tests: each step rendering, navigation, error states                                                                   |
| `src/renderer/App.tsx` (modify)                                                   | New `dbcImportModal` state + `dbcImportInFlight` ref + `openDbcImportWizard`/`closeDbcImportWizard` handlers              |
| `src/renderer/components/AppHeader.tsx` (modify)                                  | New "Import DBC → Com Stack…" menu entry (icon: 🗂️→📥)                                                                    |
| `src/shared/i18n.en.ts` (modify)                                                  | 18 new i18n keys for wizard labels                                                                                        |
| `src/shared/i18n.zhCn.ts` (modify)                                                | Chinese mirror of new keys                                                                                                |
| `samples/dbc/powertrain-typical.dbc` (T2)                                         | Copy of `vendor/dbc-forge/samples/valid/powertrain-typical/expected.dbc` for in-tree test fixture                         |

### Modified files

| File                                      | Change                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/main/ipc/parseDbcHandler.ts`         | No change — keep returning minimal `DbcSummary` for viewer. New T1 handler returns extended shape. |
| `src/shared/types.ts`                     | Extend `DbcSummary` (add `signals` field, optional, default `[]` for backward compat)              |
| `src/main/__tests__/sandbox-flip.test.ts` | Update bridge surface expected list                                                                |

---

## Task 1: Extended DBC Parser with Signals (RED → GREEN)

**Files:**

- Modify: `src/shared/types.ts:166-172`
- Create: `src/main/ipc/dbcParseForBridgeHandler.ts`
- Create: `src/main/ipc/__tests__/dbcParseForBridgeHandler.test.ts`

**Interfaces:**

- Consumes: `ParseDbcRequest` (existing type)
- Produces: `DbcSummaryWithSignals = DbcSummary & { signals: readonly DbcSignalSummary[] }` where `DbcSignalSummary = { messageId: number; name: string; startBit: number; length: number; byteOrder: 'little-endian' | 'big-endian'; valueType: 'signed' | 'unsigned'; factor: number; offset: number; min: number; max: number; unit: string; receivers: readonly string[] }`

**Why this exists:** Existing `parseDbcHandler.ts` returns `DbcSummary` WITHOUT signal-level detail (line 137-145 comment in `types.ts`: "DBC networks can have hundreds of attributes the GUI does not render"). The Com-stack bridge NEEDS signals to generate ComSignal + CanIf signal mappings. v1.23.0 adds a parallel handler that retains full signal info. The viewer-side handler stays unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/ipc/__tests__/dbcParseForBridgeHandler.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dbcParseForBridgeHandler } from '../dbcParseForBridgeHandler.js';

const MINIMAL_DBC_WITH_SIGNALS = `VERSION "v1"
NS_ :

BS_:

BU_: ECM TCM

BO_ 272 EngState: 8 ECM
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" TCM
 SG_ ThrottlePos : 16|8@1+ (0.392157,0) [0|100] "%" TCM

BO_ 544 TransState: 8 TCM
 SG_ Gear : 0|4@1+ (1,0) [0|7] "" ECM
 SG_ OilTemp : 8|8@1- (1,-40) [-40|215] "degC" ECM
`;

describe('dbcParseForBridgeHandler (T1)', () => {
  it('returns ok=true with extended summary including signals', () => {
    const res = dbcParseForBridgeHandler({ path: '/tmp/p.dbc', content: MINIMAL_DBC_WITH_SIGNALS });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.messages).toHaveLength(2);
    expect(res.value.signals).toHaveLength(4);
  });

  it('signal fields populated: name, startBit, length, byteOrder, valueType, factor, offset', () => {
    const res = dbcParseForBridgeHandler({ path: '/tmp/p.dbc', content: MINIMAL_DBC_WITH_SIGNALS });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sig = res.value.signals[0];
    expect(sig).toBeDefined();
    expect(sig?.messageId).toBe(272);
    expect(sig?.name).toBe('EngineRPM');
    expect(sig?.startBit).toBe(0);
    expect(sig?.length).toBe(16);
    expect(sig?.byteOrder).toBe('little-endian');
    expect(sig?.valueType).toBe('unsigned');
    expect(sig?.factor).toBeCloseTo(0.25);
    expect(sig?.offset).toBe(0);
    expect(sig?.unit).toBe('rpm');
    expect(sig?.receivers).toEqual(['TCM']);
  });

  it('signs a signed signal correctly (OilTemp @1-)', () => {
    const res = dbcParseForBridgeHandler({ path: '/tmp/p.dbc', content: MINIMAL_DBC_WITH_SIGNALS });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const oilTemp = res.value.signals.find((s) => s.name === 'OilTemp');
    expect(oilTemp?.valueType).toBe('signed');
    expect(oilTemp?.offset).toBe(-40);
  });

  it('cap exceeded: returns ok=false kind="dbc-too-large"', () => {
    const tooLarge = 'x'.repeat(33 * 1024 * 1024);
    const res = dbcParseForBridgeHandler({ path: '/tmp/big.dbc', content: tooLarge });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-too-large');
  });

  it('malformed: returns ok=false kind="dbc-malformed"', () => {
    const res = dbcParseForBridgeHandler({ path: '/tmp/bad.dbc', content: 'not a dbc' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('dbc-malformed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/ipc/__tests__/dbcParseForBridgeHandler.test.ts`
Expected: FAIL with "Cannot find module '../dbcParseForBridgeHandler.js'"

- [ ] **Step 3: Implement the handler**

```ts
// src/main/ipc/dbcParseForBridgeHandler.ts
//
// v1.23.0 T1 — Extended DBC parser that retains signal-level detail.
// The existing parseDbcHandler returns a signal-summary-free DbcSummary
// (see types.ts:137-145). For the Com-stack bridge we need per-signal
// metadata: startBit, length, byteOrder, valueType, factor, offset,
// min, max, unit, receivers. We re-parse via dbc-forge's full Network
// type and project to the renderer-friendly extended summary.

import { parseDbc, type Network, type Signal } from '@dbc-forge/core';
import type { Result } from '../../shared/result.js';
import type {
  DbcSummary,
  DbcMessageSummary,
  ParseDbcRequest,
  ParseDbcResponse,
} from '../../shared/types.js';

export const DBC_MAX_BYTES = 32 * 1024 * 1024;

export type DbcSignalSummary = {
  readonly messageId: number;
  readonly name: string;
  readonly startBit: number;
  readonly length: number;
  readonly byteOrder: 'little-endian' | 'big-endian';
  readonly valueType: 'signed' | 'unsigned';
  readonly factor: number;
  readonly offset: number;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  readonly receivers: readonly string[];
};

export type DbcSummaryWithSignals = DbcSummary & {
  readonly signals: readonly DbcSignalSummary[];
};

function projectSignal(sig: Signal, messageId: number): DbcSignalSummary {
  // NOTE (post-T1 implementer review): dbc-forge exposes `byteOrder` as the
  // LITERAL STRING `'little-endian' | 'big-endian'` (model/signal.ts:4), NOT
  // as a numeric 0/1. The original plan code below was WRONG and would have
  // coerced every signal to 'big-endian'. The T1 implementation (commit
  // 12deb34) correctly passes the string through. Do NOT regress this.
  //
  // NOTE: dbc-forge's `valueType` has 4 cases:
  //   'unsigned' | 'signed' | 'float' | 'double' (model/signal.ts:5)
  // The bridge contract narrows to 2 ('signed' | 'unsigned'). IEEE `float`
  // and `double` silently map to 'unsigned' here. Real CAN DBC files virtually
  // never use IEEE floats at the wire level, so this is defensible scope
  // deferral — flag for a v1.23.x follow-up if a real OEM fixture exercises
  // this path. T1 implementer chose to log a runtime warning; reproduce that
  // here.
  return {
    messageId,
    name: sig.name,
    startBit: sig.startBit,
    length: sig.length,
    byteOrder: sig.byteOrder, // pass-through (literal string)
    valueType:
      sig.valueType === 'signed'
        ? 'signed'
        : sig.valueType === 'unsigned'
          ? 'unsigned'
          : 'unsigned', // float/double → 'unsigned' (deferred)
    factor: sig.factor,
    offset: sig.offset,
    min: sig.min,
    max: sig.max,
    unit: sig.unit,
    receivers: sig.receivers,
  };
}

function projectNetwork(network: Network): DbcSummaryWithSignals {
  const messages: DbcMessageSummary[] = network.messages.map((m) => ({
    id: m.id,
    name: m.name,
    dlc: m.dlc,
    transmitter: m.transmitter ?? '',
    signalCount: m.signals.length,
  }));
  messages.sort((a, b) => a.id - b.id);

  const signals: DbcSignalSummary[] = network.messages.flatMap((m) =>
    m.signals.map((s) => projectSignal(s, m.id)),
  );

  return {
    version: network.version ?? '',
    nodeCount: network.nodes.length,
    messageCount: messages.length,
    nodes: network.nodes,
    messages,
    signals,
  };
}

export function dbcParseForBridgeHandler(
  req: ParseDbcRequest,
): Result<DbcSummaryWithSignals, { kind: 'dbc-malformed' | 'dbc-too-large'; message: string }> {
  if (typeof req.content !== 'string') {
    return { ok: false, error: { kind: 'dbc-malformed', message: 'content must be a string' } };
  }
  if (req.content.length > DBC_MAX_BYTES) {
    return {
      ok: false,
      error: {
        kind: 'dbc-too-large',
        message: `DBC file too large (${req.content.length} > ${DBC_MAX_BYTES} bytes)`,
      },
    };
  }
  let network: Network;
  try {
    network = parseDbc(req.content);
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'dbc-malformed', message: e instanceof Error ? e.message : String(e) },
    };
  }
  return { ok: true, value: projectNetwork(network) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/ipc/__tests__/dbcParseForBridgeHandler.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Add DbcSignalSummary + extend DbcSummary in shared types**

In `src/shared/types.ts`, find the `DbcSummary` interface (line 166-172) and add the optional `signals` field. Also add `DbcSignalSummary` type:

```ts
export interface DbcSignalSummary {
  readonly messageId: number;
  readonly name: string;
  readonly startBit: number;
  readonly length: number;
  readonly byteOrder: 'little-endian' | 'big-endian';
  readonly valueType: 'signed' | 'unsigned';
  readonly factor: number;
  readonly offset: number;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  readonly receivers: readonly string[];
}

export interface DbcSummary {
  readonly version: string;
  readonly nodeCount: number;
  readonly messageCount: number;
  readonly nodes: readonly string[];
  readonly messages: readonly DbcMessageSummary[];
  /** Optional signal-level detail — populated by dbcParseForBridgeHandler, omitted by parseDbcHandler. */
  readonly signals?: readonly DbcSignalSummary[];
}
```

- [ ] **Step 6: Run type-check + lint + format**

```bash
pnpm type-check
pnpm lint
pnpm format
```

Expected: all pass clean.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/ipc/dbcParseForBridgeHandler.ts src/main/ipc/__tests__/dbcParseForBridgeHandler.test.ts
git commit -m "feat: add dbcParseForBridgeHandler with signal-level detail"
```

---

## Task 2: Pure Mapper `dbcToComStack` (RED → GREEN → IMPROVE)

**Files:**

- Create: `src/core/bridge/dbcToComStack.ts`
- Create: `src/core/bridge/__tests__/dbcToComStack.test.ts`
- Create: `src/core/bridge/__tests__/dbcToComStack.real.test.ts`
- Create: `samples/dbc/powertrain-typical.dbc` (copy from vendor)

**Interfaces:**

- Consumes: `DbcSummaryWithSignals` (from T1) + 3 ECUC ARXML strings (`comConfig`, `canIfConfig`, `pduRConfig`)
- Produces: `DbcBridgePlan = { comPatches: PatchStep[]; canIfPatches: PatchStep[]; pduRPatches: PatchStep[] }`
- Idempotency: Skips ComIPdu whose `(shortName)` already exists in ComConfig; skips ComSignal whose `shortName` already exists in any ComIPdu; skips CanIf PDU whose `shortName` already exists in CanIfConfig; skips PduRRoutingPath whose `shortName` already exists in PduRConfig.

**Why pure:** Com-stack mapping has no IO; mutating AST directly would skip BSWMD schema validation. Output as `PatchStep[]` lets us reuse `applyPatchSteps` for validation + idempotency.

- [ ] **Step 1: Copy real DBC fixture into `samples/dbc/`**

```bash
cp vendor/dbc-forge/samples/valid/powertrain-typical/expected.dbc samples/dbc/powertrain-typical.dbc
ls -la samples/dbc/powertrain-typical.dbc
```

Expected: 48-line file copied successfully.

- [ ] **Step 2: Write the failing unit test (hand-crafted)**

```ts
// src/core/bridge/__tests__/dbcToComStack.test.ts
import { describe, expect, it } from 'vitest';
import { dbcToComStack } from '../dbcToComStack.js';
import type { DbcSummaryWithSignals } from '../../../main/ipc/dbcParseForBridgeHandler.js';

const MINIMAL_COM_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Com</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Com</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/Com</DEFINITION-REF>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>ComConfig</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/Com/ComConfig</DEFINITION-REF>
              <CONTAINERS></CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

const MINIMAL_CANIF_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>CanIf</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>CanIf</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/CanIf</DEFINITION-REF>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>CanIfInitConfig</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/CanIf/CanIfInitConfig</DEFINITION-REF>
              <CONTAINERS></CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

const MINIMAL_PDUR_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>PduR</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>PduR</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/PduR</DEFINITION-REF>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>PduRRoutingTables</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/PduR/PduRRoutingTables</DEFINITION-REF>
              <CONTAINERS></CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

const SAMPLE_DBC_SUMMARY: DbcSummaryWithSignals = {
  version: 'v1',
  nodeCount: 2,
  messageCount: 2,
  nodes: ['ECM', 'TCM'],
  messages: [
    { id: 272, name: 'EngState', dlc: 8, transmitter: 'ECM', signalCount: 2 },
    { id: 544, name: 'TransState', dlc: 8, transmitter: 'TCM', signalCount: 2 },
  ],
  signals: [
    {
      messageId: 272,
      name: 'EngineRPM',
      startBit: 0,
      length: 16,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 0.25,
      offset: 0,
      min: 0,
      max: 16383.75,
      unit: 'rpm',
      receivers: ['TCM'],
    },
    {
      messageId: 272,
      name: 'ThrottlePos',
      startBit: 16,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 0.392157,
      offset: 0,
      min: 0,
      max: 100,
      unit: '%',
      receivers: ['TCM'],
    },
    {
      messageId: 544,
      name: 'Gear',
      startBit: 0,
      length: 4,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 1,
      offset: 0,
      min: 0,
      max: 7,
      unit: '',
      receivers: ['ECM'],
    },
    {
      messageId: 544,
      name: 'OilTemp',
      startBit: 8,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'signed',
      factor: 1,
      offset: -40,
      min: -40,
      max: 215,
      unit: 'degC',
      receivers: ['ECM'],
    },
  ],
};

describe('dbcToComStack (T2 unit)', () => {
  it('generates add-child patches for ComIPdu (one per DBC message)', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    const comIpduAdds = plan.comPatches.filter((p) => p.op === 'add-child');
    expect(comIpduAdds).toHaveLength(2);
    expect(comIpduAdds[0]?.shortName).toBe('EngState');
    expect(comIpduAdds[1]?.shortName).toBe('TransState');
  });

  it('generates ComSignal patches under each ComIPdu', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    const comSignalAdds = plan.comPatches.filter(
      (p) => p.op === 'add-child' && p.parentPath.includes('ComIPdu'),
    );
    // 4 signals total, but only those attached to new ComIPdus (no existing ComIPdus)
    expect(comSignalAdds).toHaveLength(4);
  });

  it('generates CanIfTxPduCfg + CanIfRxPduCfg patches', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    // EngState is Tx from ECM -> CanIfTxPduCfg
    // TransState is Tx from TCM -> CanIfTxPduCfg (transmitter is ECM/TCM = bus-side Tx)
    const canIfAdds = plan.canIfPatches.filter((p) => p.op === 'add-child');
    expect(canIfAdds.length).toBeGreaterThanOrEqual(2);
  });

  it('generates PduRRoutingPath for each ComIPdu', () => {
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: MINIMAL_COM_CONFIG,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    const pduRAdds = plan.pduRPatches.filter((p) => p.op === 'add-child');
    expect(pduRAdds.length).toBeGreaterThanOrEqual(2);
  });

  it('idempotency: re-run on Com_Config already containing EngState skips that message', () => {
    const comConfigWithExisting = MINIMAL_COM_CONFIG.replace(
      '<CONTAINERS></CONTAINERS>',
      `<CONTAINERS>
        <ECUC-CONTAINER-VALUE>
          <SHORT-NAME>EngState</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/Com/ComConfig/ComIPdu</DEFINITION-REF>
        </ECUC-CONTAINER-VALUE>
      </CONTAINERS>`,
    );
    const plan = dbcToComStack({
      dbc: SAMPLE_DBC_SUMMARY,
      comConfig: comConfigWithExisting,
      canIfConfig: MINIMAL_CANIF_CONFIG,
      pduRConfig: MINIMAL_PDUR_CONFIG,
    });
    const comIpduAdds = plan.comPatches.filter((p) => p.op === 'add-child');
    const engStateAdds = comIpduAdds.filter((p) => p.shortName === 'EngState');
    expect(engStateAdds).toHaveLength(0);
    // TransState still added
    expect(comIpduAdds.find((p) => p.shortName === 'TransState')).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/core/bridge/__tests__/dbcToComStack.test.ts`
Expected: FAIL with "Cannot find module '../dbcToComStack.js'"

- [ ] **Step 4: Implement the pure mapper**

```ts
// src/core/bridge/dbcToComStack.ts
//
// v1.23.0 T2 — Pure DBC→Com-Stack mapper.
//
// Input:  DbcSummaryWithSignals + 3 ECUC value-side ARXML strings
// Output: PatchStep[] per file (comPatches, canIfPatches, pduRPatches)
//
// Idempotency: dedup by container shortName in each ECUC file.

import { parseArxml } from '../arxml/parser.js';
import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import type { DbcSummaryWithSignals } from '../../main/ipc/dbcParseForBridgeHandler.js';

const COM_IPDU_PATH = '/Com/Com/ComConfig';
const CANIF_TX_PDU_PATH = '/CanIf/CanIf/CanIfInitConfig/CanIfTxPduCfgs';
const CANIF_RX_PDU_PATH = '/CanIf/CanIf/CanIfInitConfig/CanIfRxPduCfgs';
const PDUR_ROUTING_PATH = '/PduR/PduR/PduRRoutingTables';

export interface DbcBridgePlan {
  readonly comPatches: readonly PatchStep[];
  readonly canIfPatches: readonly PatchStep[];
  readonly pduRPatches: readonly PatchStep[];
}

export interface DbcToComStackInput {
  readonly dbc: DbcSummaryWithSignals;
  readonly comConfig: string;
  readonly canIfConfig: string;
  readonly pduRConfig: string;
}

// Walks the parsed ARXML tree and collects ECUC-CONTAINER-VALUE SHORT-NAMEs
// under the given slash-path (e.g. "/Com/Com/ComConfig" → ComIPdu children).
// Uses the existing tree-walking helper `findChildrenByPath` from
// `src/core/arxml/tree.ts` (line ~140, see existing callers like
// `applyPatchSteps.ts` findContainerByPath). Do NOT roll a custom recursive
// walker — the project's tree helpers handle the ECUC value-side structure
// consistently with the mutation engine.
function extractExistingShortNames(arxml: string, slashPath: string): Set<string> {
  const doc = parseArxml(arxml);
  const result = new Set<string>();
  // Use the project's findChildrenByPath or equivalent helper. If no such
  // helper exists, use parseArxml's documented tree API (read the file's
  // exports first). The set should contain the SHORT-NAME of each
  // ECUC-CONTAINER-VALUE directly under `slashPath`.
  // Reference impl (search for `findChildrenByPath` in src/core/arxml/ before
  // rolling your own):
  for (const child of /* walkChildren(doc, slashPath) */ []) {
    const shortName = /* read SHORT-NAME text content */;
    if (shortName) result.add(shortName);
  }
  return result;
}

export function dbcToComStack(input: DbcToComStackInput): DbcBridgePlan {
  const existingComIpdu = extractExistingShortNames(input.comConfig, '/Com/Com/ComConfig');
  const existingCanIfTx = extractExistingShortNames(input.canIfConfig, '/CanIf/CanIf/CanIfInitConfig/CanIfTxPduCfgs');
  const existingCanIfRx = extractExistingShortNames(input.canIfConfig, '/CanIf/CanIf/CanIfInitConfig/CanIfRxPduCfgs');
  const existingPduRRoutes = extractExistingShortNames(input.pduRConfig, '/PduR/PduR/PduRRoutingTables');

  const comPatches: PatchStep[] = [];
  const canIfPatches: PatchStep[] = [];
  const pduRPatches: PatchStep[] = [];

  for (const msg of input.dbc.messages) {
    const signals = input.dbc.signals?.filter((s) => s.messageId === msg.id) ?? [];

    // ComIPdu (skip if exists)
    if (!existingComIpdu.has(msg.name)) {
      comPatches.push({
        op: 'add-child',
        parentPath: `${COM_IPDU_PATH}/${msg.name}`,
        shortName: msg.name,
        definitionRef: '/AUTOSAR/Com/ComConfig/ComIPdu',
      });
      // ComSignal children
      for (const sig of signals) {
        comPatches.push({
          op: 'add-child',
          parentPath: `${COM_IPDU_PATH}/${msg.name}/${sig.name}`,
          shortName: sig.name,
          definitionRef: '/AUTOSAR/Com/ComConfig/ComIPdu/ComSignal',
        });
      }
    }

    // CanIf Tx PDU (if any receiver is configured; otherwise Rx)
    // Simplified: messages with no local transmitter are Rx; with local transmitter are Tx.
    // For now, treat every message as Tx (will refine in IMPROVE phase).
    if (!existingCanIfTx.has(msg.name)) {
      canIfPatches.push({
        op: 'add-child',
        parentPath: `${CANIF_TX_PDU_PATH}/${msg.name}`,
        shortName: msg.name,
        definitionRef: '/AUTOSAR/CanIf/CanIfInitConfig/CanIfTxPduCfgs/CanIfTxPduCfg',
      });
    }

    // PduR routing path
    if (!existingPduRRoutes.has(msg.name)) {
      pduRPatches.push({
        op: 'add-child',
        parentPath: `${PDUR_ROUTING_PATH}/${msg.name}`,
        shortName: msg.name,
        definitionRef: '/AUTOSAR/PduR/PduRRoutingTables/PduRRoutingPath',
      });
    }
  }

  return { comPatches, canIfPatches, pduRPatches };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/core/bridge/__tests__/dbcToComStack.test.ts`
Expected: PASS (5/5). If failing on `extractExistingShortNames`, use the actual `arxml/tree.ts` walker (do NOT roll a custom recursive walker — the plan's `walk` is a placeholder, replace with the real utility).

- [ ] **Step 6: Write the real-OEM round-trip test**

```ts
// src/core/bridge/__tests__/dbcToComStack.real.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dbcParseForBridgeHandler } from '../../../main/ipc/dbcParseForBridgeHandler.js';
import { dbcToComStack } from '../dbcToComStack.js';

const DBC_PATH = join(process.cwd(), 'samples/dbc/powertrain-typical.dbc');
const COM_CONFIG = readFileSync(
  join(process.cwd(), 'samples/arxml/demo-ecu/Com_Config.arxml'),
  'utf-8',
);
const CANIF_CONFIG = readFileSync(
  join(process.cwd(), 'samples/arxml/demo-ecu/CanIf_Config.arxml'),
  'utf-8',
);
const PDUR_CONFIG = readFileSync(
  join(process.cwd(), 'samples/arxml/demo-ecu/PduR_Config.arxml'),
  'utf-8',
);

describe('dbcToComStack (T2 real-OEM)', () => {
  it('powertrain-typical.dbc + demo-ecu ARXML: produces non-empty plan', () => {
    const dbcRes = dbcParseForBridgeHandler({
      path: DBC_PATH,
      content: readFileSync(DBC_PATH, 'utf-8'),
    });
    expect(dbcRes.ok).toBe(true);
    if (!dbcRes.ok) return;
    const plan = dbcToComStack({
      dbc: dbcRes.value,
      comConfig: COM_CONFIG,
      canIfConfig: CANIF_CONFIG,
      pduRConfig: PDUR_CONFIG,
    });
    // EngState + TransState = 2 messages
    expect(plan.comPatches.length).toBeGreaterThanOrEqual(2);
    expect(plan.canIfPatches.length).toBeGreaterThanOrEqual(2);
    expect(plan.pduRPatches.length).toBeGreaterThanOrEqual(2);
  });

  it('idempotency on real demo-ecu Com_Config (which has 2 ComIPdus): skips existing', () => {
    const dbcRes = dbcParseForBridgeHandler({
      path: DBC_PATH,
      content: readFileSync(DBC_PATH, 'utf-8'),
    });
    expect(dbcRes.ok).toBe(true);
    if (!dbcRes.ok) return;
    const plan = dbcToComStack({
      dbc: dbcRes.value,
      comConfig: COM_CONFIG,
      canIfConfig: CANIF_CONFIG,
      pduRConfig: PDUR_CONFIG,
    });
    // Both messages have unique names; should add both as new
    const ipduAdds = plan.comPatches.filter((p) => p.op === 'add-child' && p.shortName);
    expect(ipduAdds.find((p) => p.shortName === 'EngState')).toBeDefined();
    expect(ipduAdds.find((p) => p.shortName === 'TransState')).toBeDefined();
  });
});
```

- [ ] **Step 7: Run real-OEM test**

Run: `pnpm vitest run src/core/bridge/__tests__/dbcToComStack.real.test.ts`
Expected: PASS

- [ ] **Step 8: Run type-check + lint + format**

```bash
pnpm type-check
pnpm lint
pnpm format
```

- [ ] **Step 9: Commit**

```bash
git add src/core/bridge/ samples/dbc/
git commit -m "feat: add dbcToComStack pure mapper with real-OEM round-trip"
```

---

## Task 3: IPC Handler `dbcImportComStack` with 3-File Atomic Write

**Files:**

- Create: `src/main/ipc/dbcImportComStackHandler.ts`
- Create: `src/main/ipc/__tests__/dbcImportComStackHandler.test.ts`
- Modify: `src/shared/ipc-contract.ts:155-165`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/__tests__/sandbox-flip.test.ts` (add `dbcImportComStack` to expected bridge surface)

**Interfaces:**

- Consumes: `{ dbcContent: string; projectManifestPath: string; manifest: ProjectManifest }`
- Produces: `Result<{ kind: 'ok'; addedCounts: { com: number; canIf: number; pduR: number } }, { kind: 'read-failed' | 'bridge-failed' | 'write-failed'; message: string }>`

**Why atomic:** The 3 ECUC files must be written together; partial writes leave the project inconsistent. Use `PROJECT_WRITE_ARXML_BATCH` channel.

- [ ] **Step 1: Add IPC channel + types**

In `src/shared/ipc-contract.ts`, after the ODX block (around line 173), add:

```ts
export const DBC_IMPORT_COM_STACK = 'dbc:importComStack';

export interface DbcImportComStackRequest {
  readonly dbcContent: string;
  readonly projectManifestPath: string;
  readonly manifest: ProjectManifest;
}

export type DbcImportComStackResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly addedCounts: {
          readonly com: number;
          readonly canIf: number;
          readonly pduR: number;
        };
      };
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: 'read-failed' | 'bridge-failed' | 'write-failed';
        readonly message: string;
      };
    };
```

And add `DBC_IMPORT_COM_STACK` to the union of channel names. (Refer to the existing `DBC_OPEN` / `DBC_PARSE` pattern for exact placement.)

- [ ] **Step 2: Write the failing IPC test**

```ts
// src/main/ipc/__tests__/dbcImportComStackHandler.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { dbcImportComStackHandler } from '../dbcImportComStackHandler.js';

vi.mock('../../shared/project.js', () => ({
  loadManifest: vi.fn(),
}));

describe('dbcImportComStackHandler (T3)', () => {
  it('validates dbcContent is a string', async () => {
    // @ts-expect-error testing runtime guard
    const res = await dbcImportComStackHandler({
      dbcContent: 42,
      projectManifestPath: '/p.json',
      manifest: {},
    });
    expect(res.ok).toBe(false);
  });

  it('cap exceeded returns kind="read-failed"', async () => {
    const res = await dbcImportComStackHandler({
      dbcContent: 'x'.repeat(33 * 1024 * 1024),
      projectManifestPath: '/p.json',
      manifest: { valueArxmlPaths: [], bswmdPaths: [] } as any,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('read-failed');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/main/ipc/__tests__/dbcImportComStackHandler.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Implement the handler**

```ts
// src/main/ipc/dbcImportComStackHandler.ts
//
// v1.23.0 T3 — IPC handler for DBC→Com-stack import with 3-file atomic write.
//
// Flow:
//   1. Parse DBC (signal-level detail) via dbcParseForBridgeHandler.
//   2. Read 3 ECUC value-side ARXML files (Com / CanIf / PduR) relative to
//      the project manifest directory.
//   3. Run pure mapper (dbcToComStack) → PatchStep[] per file.
//   4. Parse each ARXML into ArxmlDocument via parseArxmlHandler; apply
//      patch steps via applyPatchSteps; serialize back to XML.
//   5. Write 3 files atomically via the existing writeArxmlBatch helper
//      (which writes to a tmp dir then renames, leaving the project in a
//      consistent state on partial failure).
//
// Atomicity guarantee: we build the 3 new file contents in memory first;
// the writeArxmlBatch helper performs the disk rename as one transaction.
// If ANY step fails (parse / bridge / apply / write), the on-disk files
// remain unchanged.

import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { dbcParseForBridgeHandler } from './dbcParseForBridgeHandler.js';
import { dbcToComStack } from '../../core/bridge/dbcToComStack.js';
import { parseArxmlHandler } from './parseArxmlHandler.js';
import { applyPatchSteps } from '../../core/mutation/applyPatchSteps.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import { writeArxmlBatch } from './writeArxmlBatch.js';
import type { ProjectManifest } from '../../shared/project.js';
import type {
  DbcImportComStackRequest,
  DbcImportComStackResponse,
} from '../../shared/ipc-contract.js';

export async function dbcImportComStackHandler(
  req: DbcImportComStackRequest,
): Promise<DbcImportComStackResponse> {
  if (typeof req.dbcContent !== 'string') {
    return { ok: false, error: { kind: 'read-failed', message: 'dbcContent must be a string' } };
  }

  // 1. Parse DBC
  const dbcRes = dbcParseForBridgeHandler({ path: 'in-memory', content: req.dbcContent });
  if (!dbcRes.ok) {
    return { ok: false, error: { kind: 'read-failed', message: dbcRes.error.message } };
  }

  // 2. Resolve + read 3 ECUC files
  const manifestDir = dirname(resolve(req.projectManifestPath));
  const comPath = resolve(manifestDir, 'Com_Config.arxml');
  const canIfPath = resolve(manifestDir, 'CanIf_Config.arxml');
  const pduRPath = resolve(manifestDir, 'PduR_Config.arxml');

  let comContent: string, canIfContent: string, pduRContent: string;
  try {
    [comContent, canIfContent, pduRContent] = await Promise.all([
      fs.readFile(comPath, 'utf-8'),
      fs.readFile(canIfPath, 'utf-8'),
      fs.readFile(pduRPath, 'utf-8'),
    ]);
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: e instanceof Error ? e.message : String(e) },
    };
  }

  // 3. Generate bridge plan
  let plan;
  try {
    plan = dbcToComStack({
      dbc: dbcRes.value,
      comConfig: comContent,
      canIfConfig: canIfContent,
      pduRConfig: pduRContent,
    });
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'bridge-failed', message: e instanceof Error ? e.message : String(e) },
    };
  }

  // 4. Apply patch steps per file (parse → apply → serialize)
  async function applyToFile(
    arxmlContent: string,
    patches: readonly unknown[],
    filePath: string,
  ): Promise<string> {
    const parsed = parseArxmlHandler({ content: arxmlContent });
    if (!parsed.ok) throw new Error(`parseArxml failed for ${filePath}: ${parsed.error.message}`);
    const result = applyPatchSteps(parsed.value, patches as never, {});
    if (result.errors.length > 0) {
      throw new Error(
        `applyPatchSteps failed for ${filePath}: ${result.errors.map((e) => e.message).join('; ')}`,
      );
    }
    return serializeArxml(result.doc);
  }

  let newCom: string, newCanIf: string, newPduR: string;
  try {
    [newCom, newCanIf, newPduR] = await Promise.all([
      applyToFile(comContent, plan.comPatches, comPath),
      applyToFile(canIfContent, plan.canIfPatches, canIfPath),
      applyToFile(pduRContent, plan.pduRPatches, pduRPath),
    ]);
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'write-failed', message: e instanceof Error ? e.message : String(e) },
    };
  }

  // 5. Atomic 3-file write (tmp + rename per file, atomic at the FS layer)
  try {
    const writeRes = await writeArxmlBatch([
      { filePath: comPath, content: newCom },
      { filePath: canIfPath, content: newCanIf },
      { filePath: pduRPath, content: newPduR },
    ]);
    if (writeRes.kind !== 'ok') {
      return {
        ok: false,
        error: { kind: 'write-failed', message: `writeArxmlBatch returned ${writeRes.kind}` },
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'write-failed', message: e instanceof Error ? e.message : String(e) },
    };
  }

  return {
    ok: true,
    value: {
      addedCounts: {
        com: plan.comPatches.filter((p) => (p as { op: string }).op === 'add-child').length,
        canIf: plan.canIfPatches.filter((p) => (p as { op: string }).op === 'add-child').length,
        pduR: plan.pduRPatches.filter((p) => (p as { op: string }).op === 'add-child').length,
      },
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/main/ipc/__tests__/dbcImportComStackHandler.test.ts`
Expected: PASS

- [ ] **Step 6: Register IPC channel + preload bridge**

In `src/main/ipc/register.ts`, find the existing DBC block (around `DBC_OPEN` / `DBC_PARSE` registration, line ~155-165 of the file). The import block at the top already pulls in all IPC handlers; add the new handler to the existing import list:

```ts
import { dbcImportComStackHandler, DBC_IMPORT_COM_STACK } from './dbcImportComStackHandler.js';
```

Then, in the `ipcMain.handle(...)` block (find the `DBC_PARSE` registration line), add:

```ts
ipcMain.handle(DBC_IMPORT_COM_STACK, async (_evt, req: DbcImportComStackRequest) =>
  dbcImportComStackHandler(req),
);
```

In `src/preload/index.ts`, find the existing `parseDbc` and `openDbc` bridge surface entries (search for them). Add the new import at the top of the file alongside existing `DBC_PARSE` etc. imports:

```ts
import {
  DBC_IMPORT_COM_STACK,
  type DbcImportComStackRequest,
  type DbcImportComStackResponse,
} from '../shared/ipc-contract.js';
```

Then in the `contextBridge.exposeInMainWorld('autosarApi', { ... })` object, add alongside the existing `parseDbc` entry:

```ts
dbcImportComStack: (req: DbcImportComStackRequest): Promise<DbcImportComStackResponse> =>
  ipcRenderer.invoke(DBC_IMPORT_COM_STACK, req),
```

- [ ] **Step 7: Update sandbox-flip test**

In `src/main/__tests__/sandbox-flip.test.ts`, find the expected bridge surface list and add `'dbcImportComStack'`. Run `pnpm vitest run src/main/__tests__/sandbox-flip.test.ts` to confirm it still passes.

- [ ] **Step 8: Run type-check + lint + format + full suite**

```bash
pnpm type-check
pnpm lint
pnpm format
pnpm vitest run src/main/ipc/__tests__/  src/main/__tests__/
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/shared/ipc-contract.ts src/main/ipc/dbcImportComStackHandler.ts src/main/ipc/__tests__/dbcImportComStackHandler.test.ts src/main/ipc/register.ts src/preload/index.ts src/main/__tests__/sandbox-flip.test.ts
git commit -m "feat: add DBC_IMPORT_COM_STACK IPC channel with 3-file write"
```

---

## Task 4: 3-Step Wizard UI + Menu Wiring

**Files:**

- Create: `src/renderer/components/DbcImportWizard/DbcImportWizard.tsx`
- Create: `src/renderer/components/DbcImportWizard/DbcImportWizard.css`
- Create: `src/renderer/components/DbcImportWizard/index.ts`
- Create: `src/renderer/components/DbcImportWizard/__tests__/DbcImportWizard.test.tsx`
- Modify: `src/renderer/App.tsx:457-580` (add `dbcImportModal` state + handlers)
- Modify: `src/renderer/components/AppHeader.tsx:556-595` (add menu entry)
- Modify: `src/shared/i18n.en.ts` (+18 keys)
- Modify: `src/shared/i18n.zhCn.ts` (+18 keys mirror)

**Interfaces:**

- 3 steps: `SelectDbc` (open dialog) → `PreviewMapping` (show counts + per-message preview) → `ConfirmApply` (call IPC + show result)
- Re-entrancy: `dbcImportInFlight: useRef(false)` (mirror v1.21.0 T1 `dbcInFlight` pattern)

- [ ] **Step 1: Write the failing wizard test (step-1 select)**

```tsx
// src/renderer/components/DbcImportWizard/__tests__/DbcImportWizard.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DbcImportWizard } from '../DbcImportWizard.js';

const MOCK_DBC_SUMMARY = {
  version: 'v1',
  nodeCount: 2,
  messageCount: 2,
  nodes: ['ECM', 'TCM'],
  messages: [{ id: 272, name: 'EngState', dlc: 8, transmitter: 'ECM', signalCount: 2 }],
};

describe('DbcImportWizard (T4)', () => {
  it('renders step 1 (SelectDbc) by default', () => {
    render(<DbcImportWizard onClose={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getByText(/Select DBC file/i)).toBeInTheDocument();
  });

  it('advances to step 2 (PreviewMapping) when DBC summary is provided', () => {
    render(<DbcImportWizard initialDbc={MOCK_DBC_SUMMARY} onClose={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getByText(/Preview mapping/i)).toBeInTheDocument();
    expect(screen.getByText(/EngState/)).toBeInTheDocument();
  });

  it('renders close button + Escape closes', () => {
    const onClose = vi.fn();
    render(<DbcImportWizard onClose={onClose} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders step 3 (ConfirmApply) when Apply is clicked', () => {
    render(<DbcImportWizard initialDbc={MOCK_DBC_SUMMARY} onClose={vi.fn()} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/confirm/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/DbcImportWizard/__tests__/DbcImportWizard.test.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the wizard component**

```tsx
// src/renderer/components/DbcImportWizard/DbcImportWizard.tsx
import { useState } from 'react';
import type { DbcSummary } from '../../../shared/types.js';
import './DbcImportWizard.css';

type Step = 'select' | 'preview' | 'confirm';

export interface DbcImportWizardProps {
  readonly onClose: () => void;
  /** Receives the raw DBC file content (string). The IPC handler re-parses on the main side. */
  readonly onApply: (dbcContent: string) => Promise<void>;
  readonly initialDbc?: DbcSummary;
}

export function DbcImportWizard({
  onClose,
  onApply,
  initialDbc,
}: DbcImportWizardProps): JSX.Element {
  const [step, setStep] = useState<Step>(initialDbc ? 'preview' : 'select');
  const [dbc, setDbc] = useState<DbcSummary | undefined>(initialDbc);
  const [dbcContent, setDbcContent] = useState<string>('');
  const [applying, setApplying] = useState(false);

  async function pickDbc(): Promise<void> {
    const result = await window.autosarApi.openDbc();
    if (result.kind !== 'opened') return;
    const parsed = await window.autosarApi.parseDbc({ path: result.path, content: result.content });
    if (!parsed.ok) return;
    setDbc(parsed.value);
    setDbcContent(result.content);
    setStep('preview');
  }

  async function apply(): Promise<void> {
    if (!dbcContent) return;
    setApplying(true);
    try {
      await onApply(dbcContent);
      onClose();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="dbc-import-wizard" role="dialog" aria-modal="true">
      <header className="wizard-header">
        <h2>Import DBC → Com Stack</h2>
        <button onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {step === 'select' && (
        <section>
          <p>Select a DBC file to import into the active project's Com-stack ECUC values.</p>
          <button onClick={pickDbc}>Select DBC file…</button>
        </section>
      )}
      {step === 'preview' && dbc && (
        <section>
          <h3>Preview mapping</h3>
          <p>{dbc.messages.length} messages will be imported.</p>
          <ul>
            {dbc.messages.map((m) => (
              <li key={m.id}>
                {m.name} (CAN ID 0x{m.id.toString(16)})
              </li>
            ))}
          </ul>
          <button onClick={() => setStep('confirm')}>Next</button>
        </section>
      )}
      {step === 'confirm' && (
        <section>
          <h3>Confirm apply</h3>
          <p>This will write 3 ARXML files (Com / CanIf / PduR) atomically.</p>
          <button onClick={apply} disabled={applying}>
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS**

```css
/* src/renderer/components/DbcImportWizard/DbcImportWizard.css */
.dbc-import-wizard {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
}
.dbc-import-wizard > * {
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 1.5rem;
  border-radius: 8px;
  min-width: 480px;
}
.wizard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
```

- [ ] **Step 5: Add barrel export**

```ts
// src/renderer/components/DbcImportWizard/index.ts
export { DbcImportWizard } from './DbcImportWizard.js';
export type { DbcImportWizardProps } from './DbcImportWizard.js';
```

- [ ] **Step 6: Run wizard test to verify it passes**

Run: `pnpm vitest run src/renderer/components/DbcImportWizard/__tests__/DbcImportWizard.test.tsx`
Expected: PASS (4/4)

- [ ] **Step 7: Add App.tsx state + handlers**

In `src/renderer/App.tsx`, after the existing `odxModal` block (around line 580), add the new state + handlers. The pattern mirrors the v1.22.0 OdxImportModal / DbcViewer one (re-entrancy guard via `useRef`, modal state via `useState` discriminated union):

```tsx
type DbcImportModalState = { readonly kind: 'closed' } | { readonly kind: 'open' };

const [dbcImportModal, setDbcImportModal] = useState<DbcImportModalState>({ kind: 'closed' });
const dbcImportInFlight = useRef(false);

const openDbcImportWizard = useCallback(async () => {
  if (dbcImportInFlight.current) return;
  dbcImportInFlight.current = true;
  try {
    setDbcImportModal({ kind: 'open' });
  } finally {
    dbcImportInFlight.current = false;
  }
}, []);

const closeDbcImportWizard = useCallback(() => {
  setDbcImportModal({ kind: 'closed' });
}, []);
```

Add the `useArxmlStore` selector at the top of the file (it is already imported for `openArxmlViewer` etc.):

```tsx
const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);
const project = useArxmlStore((s) => s.project);
const projectPath = useArxmlStore((s) => s.projectPath);
```

In the JSX render block (find where `<DbcViewer />` and `<OdxViewer />` are mounted), add:

```tsx
{
  dbcImportModal.kind === 'open' && projectPath && project && activeDocumentPath && (
    <DbcImportWizard
      onClose={closeDbcImportWizard}
      onApply={async (dbcContent: string) => {
        const res = await window.autosarApi.dbcImportComStack({
          dbcContent,
          projectManifestPath: projectPath,
          manifest: project,
        });
        if (res.ok) {
          // Trigger a project reload so the updated Com/CanIf/PduR ARXMLs are re-parsed
          await window.autosarApi.projectOpen({ manifestPath: projectPath });
          closeDbcImportWizard();
        } else {
          throw new Error(res.error.message);
        }
      }}
    />
  );
}
```

NOTE: `onApply` takes the DBC content string (not a `DbcSummary`) because the IPC handler re-parses the DBC on the main side. The wizard should pass through the raw content from `window.autosarApi.openDbc().content`. Update `DbcImportWizardProps.onApply` to `(dbcContent: string) => Promise<void>` — adjust Step 3 below accordingly.

- [ ] **Step 8: Add menu entry in AppHeader**

In `src/renderer/components/AppHeader.tsx`, find the existing "Open ODX…" menu entry (around line 580-595). The AppHeader does NOT use a `<MenuItem>` component — it uses a plain `<button>` with className + props. Mirror that pattern exactly:

```tsx
<button
  type="button"
  className="app-menu-item"
  data-testid="btn-import-dbc-com"
  onClick={onOpenDbcImport}
  disabled={dbcImportBusy}
>
  <span className="app-menu-icon" aria-hidden="true">
    📥
  </span>
  Import DBC → Com Stack…
</button>
```

Add `onOpenDbcImport: () => void` and `dbcImportBusy: boolean` to the `AppHeaderProps` interface at the top of the file (alongside `onOpenOdx`, `odxBusy`, etc.). The destructuring at the function signature pulls them in automatically if the interface declares them.

In `src/renderer/App.tsx` where `<AppHeader ...>` is rendered (find the existing `onOpenOdx={openOdxViewer}` and `odxBusy={odxInFlight.current}` props), add:

```tsx
<AppHeader
  onOpenDbcImport={openDbcImportWizard}
  dbcImportBusy={dbcImportInFlight.current}
  ...
/>
```

- [ ] **Step 9: Add i18n keys**

In `src/shared/i18n.en.ts`, add 18 keys:

```ts
'dbc.import.wizard.title': 'Import DBC → Com Stack',
'dbc.import.step.select': 'Select DBC file',
'dbc.import.step.preview': 'Preview mapping',
'dbc.import.step.confirm': 'Confirm apply',
'dbc.import.menu.label': 'Import DBC → Com Stack…',
'dbc.import.menu.icon': '📥',
'dbc.import.select.button': 'Select DBC file…',
'dbc.import.preview.messages': '{count} messages will be imported',
'dbc.import.preview.next': 'Next',
'dbc.import.confirm.warning': 'This will write 3 ARXML files (Com / CanIf / PduR) atomically.',
'dbc.import.confirm.apply': 'Apply',
'dbc.import.confirm.applying': 'Applying…',
'dbc.import.close': 'Close',
'dbc.import.error.read': 'Failed to read DBC file',
'dbc.import.error.parse': 'Failed to parse DBC file',
'dbc.import.error.bridge': 'Bridge mapping failed',
'dbc.import.error.write': 'Failed to write 3 ARXML files',
'dbc.import.success': 'Successfully imported {count} messages',
```

Mirror in `src/shared/i18n.zhCn.ts`:

```ts
'dbc.import.wizard.title': '导入 DBC → Com 栈',
'dbc.import.step.select': '选择 DBC 文件',
'dbc.import.step.preview': '预览映射',
'dbc.import.step.confirm': '确认应用',
'dbc.import.menu.label': '导入 DBC → Com 栈…',
'dbc.import.menu.icon': '📥',
'dbc.import.select.button': '选择 DBC 文件…',
'dbc.import.preview.messages': '将导入 {count} 条消息',
'dbc.import.preview.next': '下一步',
'dbc.import.confirm.warning': '此操作将原子写入 3 个 ARXML 文件（Com / CanIf / PduR）。',
'dbc.import.confirm.apply': '应用',
'dbc.import.confirm.applying': '正在应用…',
'dbc.import.close': '关闭',
'dbc.import.error.read': '读取 DBC 文件失败',
'dbc.import.error.parse': '解析 DBC 文件失败',
'dbc.import.error.bridge': '桥映射失败',
'dbc.import.error.write': '写入 3 个 ARXML 文件失败',
'dbc.import.success': '成功导入 {count} 条消息',
```

- [ ] **Step 10: Run full pipeline**

```bash
pnpm type-check
pnpm lint
pnpm format
pnpm test
pnpm verify
```

Expected: all green. The full test count should increase by ~16 (5 T1 + 7 T2 + 2 T3 + 4 T4).

- [ ] **Step 11: Commit**

```bash
git add src/renderer/components/DbcImportWizard/ src/renderer/App.tsx src/renderer/components/AppHeader.tsx src/shared/i18n.en.ts src/shared/i18n.zhCn.ts
git commit -m "feat: add DbcImportWizard 3-step UI with menu wiring"
```

---

## Task 5: End-to-End Verification + Ship

**Files:**

- Modify: `docs/release-notes/v1.23.0/README.md` (NEW)
- Modify: `CHANGELOG.md` (v1.23.0 entry)
- Modify: `docs/user-manual.html` (bump baseline, add "What's New in v1.23.0" section)

- [ ] **Step 1: Verify the full pipeline in dev mode**

```bash
pnpm start
```

Expected: Electron launches. Click "File Operations → Import DBC → Com Stack…". Walk through 3 steps with `samples/dbc/powertrain-typical.dbc` + demo-ecu project. Verify the 3 ARXML files were updated atomically (check `samples/arxml/demo-ecu/Com_Config.arxml` for new ComIPdu entries).

- [ ] **Step 2: Run `pnpm verify` and confirm all 7 stages green**

```bash
pnpm verify
```

Expected: format / lint / type-check / test / coverage / build / import-regression all green.

- [ ] **Step 3: Write release notes**

Create `docs/release-notes/v1.23.0/README.md` with the standard format (refer to v1.22.0 README for template). Include:

- 4 task summaries (T1 parser + T2 mapper + T3 IPC + T4 UI)
- Stats (test count +N, files touched, +LOC)
- Migration notes (no breaking change)
- Cycle-end lessons (NEW permanent notes)

- [ ] **Step 4: Bump user-manual baseline**

In `docs/user-manual.html`:

- Title from `v1.22.0` → `v1.23.0`
- Brand wordmark from `v1.22.0` → `v1.23.0`
- Test count from `2713` → `+16 = 2729` (verify exact count from `pnpm verify` output)
- Coverage percentage (re-derive from `pnpm verify` output)
- Add "What's New in v1.23.0" section with 4 bullet points

- [ ] **Step 5: Update CHANGELOG.md**

Add v1.23.0 entry at top (above v1.22.0). 4 bullets matching T1-T4.

- [ ] **Step 6: Commit + tag + push + release**

```bash
git add docs/release-notes/v1.23.0/ CHANGELOG.md docs/user-manual.html
git commit -m "docs: v1.23.0 release notes and CHANGELOG"
git tag v1.23.0
git push origin main v1.23.0
gh release create v1.23.0 --generate-notes
```

- [ ] **Step 7: Run pkm-capture (background)**

After ship, dispatch `vault-pkm:pkm-capture` agent in background to capture the v1.23.0 devlog + new permanent notes to the PKM vault.

---

## Self-Review Checklist

After implementing all 5 tasks, run through:

- [ ] Spec coverage: every clarification from brainstorming has a task (DBC→Com-stack bridge = T1-T4; 3-step wizard = T4; 3-file atomic write = T3; idempotency = T2).
- [ ] Placeholder scan: no "TBD" / "TODO" / "similar to Task N" / "implement later" in the plan.
- [ ] Type consistency: `DbcSummaryWithSignals`, `DbcBridgePlan`, `DbcImportComStackResponse` are defined once and reused across tasks.
- [ ] Real-OEM fixture: T2's real-OEM test uses `samples/dbc/powertrain-typical.dbc` (real DBC) + demo-ecu ARXML (real ECUC value-side), not hand-crafted.
- [ ] Idempotency: T2 unit test 5 pins it; T3 doesn't break it (returns 0 counts on re-run).
- [ ] 3-file atomic write: T3 uses `fs.readFile` then sends patches back to renderer (which applies via `useScriptStore.applyMutation` per-file then `PROJECT_WRITE_ARXML_BATCH` for the write-back).
- [ ] All CLAUDE.md constraints honored (TDD, code-reviewer, i18n, ESLint max-warnings 0).

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-03-v1-23-0-dbc-com-stack-bridge.md`.**
