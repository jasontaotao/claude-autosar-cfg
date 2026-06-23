// Sprint 18 hotfix — end-to-end verification of `applyParamUpdate`
// against the user-reported vendor-CDD project.
//
// The parser flattens `<CONTAINERS>` and `<SUB-CONTAINERS>` into a
// single children list under the module — `JWQ3399General` and
// `JWQ3399ConfigSet` are SIBLINGS at the module level, not nested.
// After `foldVendorPackages` collapses the vendor wrappers, the
// Tree emits 3-segment sibling paths like `/JWQ3399/JWQ3399General`.
//
// Before the Sprint 18 `applyParamUpdate` rewrite, the function
// walked `pkg.elements` by shortName and missed the post-fold
// same-name wrapper (pkg `JWQ3399` contains the module also named
// `JWQ3399`), silently no-op'ing every edit. The renderer then
// reported "saved" while the value never changed.
//
// After the rewrite, `applyParamUpdate` delegates to `findByPath`
// (which has the wrapper fallback) and writes the new value via
// `replaceElement`.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { applyParamUpdate } from '@core/arxml/mutation';
import { parseArxml } from '@core/arxml/parser';
import { findByPath } from '@core/arxml/path';
import type { ParamValue } from '@core/arxml/types';

const VALUE_PATH = 'C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/ecuc/JWQ3399_EcucValues.arxml';

interface EditCase {
  readonly label: string;
  // Post-fold containerPath — what the Tree emits. NOTE: the parser
  // flattens `<SUB-CONTAINERS>` so the path is a 3-segment sibling
  // shape, not a 4-segment nested shape.
  readonly containerPath: string;
  readonly paramKey: string;
  readonly newValue: ParamValue;
}

const CASES: readonly EditCase[] = [
  {
    label: 'boolean — toggle JWQ3399DevErrorDetect (direct param of General)',
    containerPath: '/JWQ3399/JWQ3399General',
    paramKey: 'JWQ3399DevErrorDetect',
    newValue: { type: 'boolean', value: true },
  },
  {
    label: 'integer — bump JWQ3399ChipNum (direct param of General)',
    containerPath: '/JWQ3399/JWQ3399General',
    paramKey: 'JWQ3399ChipNum',
    newValue: { type: 'integer', value: 7 },
  },
  {
    label: 'float — set JWQ3399MainFunctionPeriod (direct param of General)',
    containerPath: '/JWQ3399/JWQ3399General',
    paramKey: 'JWQ3399MainFunctionPeriod',
    newValue: { type: 'float', value: 0.05 },
  },
  {
    label: 'enum — pick CommArchWithBridge (direct param of General)',
    containerPath: '/JWQ3399/JWQ3399General',
    paramKey: 'JWQ3399CommArch',
    newValue: { type: 'enum', value: 'CommArchWithBridge' },
  },
  {
    label: 'integer — InitFastSampleCount (sub-container of ConfigSet)',
    containerPath: '/JWQ3399/JWQ3399ConfigSet/JWQ3399InitConfig',
    paramKey: 'InitFastSampleCount',
    newValue: { type: 'integer', value: 42 },
  },
  {
    label: 'boolean — GPIO flag (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399GPIOConfig',
    paramKey: 'JWQ3399_GPIO_I2C_ENABLE',
    newValue: { type: 'boolean', value: true },
  },
  {
    label: 'enum — BaudRate under CommunicateConfig (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399CommunicateConfig',
    paramKey: 'BaudRate',
    newValue: { type: 'enum', value: '500kbps' },
  },
  {
    label: 'enum — CellADCRunMode under ADCConfig (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399ADCConfig',
    paramKey: 'CellADCRunMode',
    newValue: { type: 'enum', value: 'CONTINUOUS_MEASURE' },
  },
  {
    label: 'integer — ComTimeOutSet under StateConfig (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399StateConfig',
    paramKey: 'ComTimeOutSet',
    newValue: { type: 'integer', value: 100 },
  },
  {
    label: 'enum — MaskFaultOVUV under FaultMaskConfig (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399FaultMaskConfig',
    paramKey: 'MaskFaultOVUV',
    newValue: { type: 'enum', value: 'MaskAssertFaultBit' },
  },
  {
    label: 'enum — PTCorNTC under DevConfig (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399DevConfig',
    paramKey: 'PTCorNTC',
    newValue: { type: 'enum', value: 'PTCsUsed' },
  },
  {
    label: 'boolean — OVUV_Enable (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399OVUV_OTUTConfig',
    paramKey: 'OVUV_Enable',
    newValue: { type: 'boolean', value: true },
  },
  {
    label: 'integer — CellBalanceStopThreshold (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399BalanceConfig',
    paramKey: 'CellBalanceStopThreshold',
    newValue: { type: 'integer', value: 50 },
  },
  {
    label: 'enum — MaskFaultCOM (sub-container of General)',
    containerPath: '/JWQ3399/JWQ3399General/JWQ3399FaultMaskConfig',
    paramKey: 'MaskFaultCOM',
    newValue: { type: 'enum', value: 'MaskAssertFaultBit' },
  },
];

describe('Sprint 18 — applyParamUpdate end-to-end (every param type, post-fold sibling path)', () => {
  it('mutates every user-reported param on the post-fold container path', () => {
    const valueXml = readFileSync(VALUE_PATH, 'utf-8');
    const valueResult = parseArxml(valueXml);
    if (!valueResult.ok) {
      throw new Error(`value parse failed: ${valueResult.error.kind}`);
    }
    const valueDoc = valueResult.value;

    const failures: string[] = [];
    for (const c of CASES) {
      const before = findByPath(valueDoc, c.containerPath);
      if (before === null) {
        failures.push(`  [${c.label}] container not found at ${c.containerPath}`);
        continue;
      }
      if (before.element.kind !== 'module' && before.element.kind !== 'container') {
        failures.push(`  [${c.label}] unexpected element kind ${before.element.kind}`);
        continue;
      }
      const beforeVal = before.element.params[c.paramKey];
      const nextDoc = applyParamUpdate(valueDoc, c.containerPath, c.paramKey, c.newValue);
      if (nextDoc === valueDoc) {
        failures.push(`  [${c.label}] applyParamUpdate returned the same doc reference (no-op)`);
        continue;
      }
      const after = findByPath(nextDoc, c.containerPath);
      if (after === null) {
        failures.push(`  [${c.label}] container missing after update`);
        continue;
      }
      if (after.element.kind !== 'module' && after.element.kind !== 'container') {
        failures.push(`  [${c.label}] unexpected post-update kind ${after.element.kind}`);
        continue;
      }
      const afterVal = after.element.params[c.paramKey];
      if (afterVal === undefined) {
        failures.push(`  [${c.label}] param ${c.paramKey} missing after update`);
        continue;
      }
      if (afterVal.value !== c.newValue.value) {
        failures.push(
          `  [${c.label}] expected value=${JSON.stringify(c.newValue.value)} got ${JSON.stringify(afterVal.value)}`,
        );
        continue;
      }
      if (afterVal.type !== c.newValue.type) {
        failures.push(`  [${c.label}] expected type=${c.newValue.type} got ${afterVal.type}`);
      }
      // Quiet the linter about unused vars.
      void beforeVal;
    }

    if (failures.length > 0) {
      throw new Error(
        `Sprint 18 fix incomplete — ${failures.length} edits failed:\n${failures.join('\n')}`,
      );
    }
    expect(failures).toEqual([]);
  });

  it('re-applying the same value is a no-op (preserves reference equality)', () => {
    const valueXml = readFileSync(VALUE_PATH, 'utf-8');
    const valueResult = parseArxml(valueXml);
    if (!valueResult.ok) throw new Error('parse fail');
    const doc = valueResult.value;

    const containerPath = '/JWQ3399/JWQ3399General';
    const paramKey = 'JWQ3399CommArch';
    const newValue: ParamValue = { type: 'enum', value: 'CommArchWithBridge' };

    const once = applyParamUpdate(doc, containerPath, paramKey, newValue);
    expect(once).not.toBe(doc);
    const twice = applyParamUpdate(once, containerPath, paramKey, newValue);
    expect(twice).toBe(once);
  });
});
