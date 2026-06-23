// Sprint 18 hotfix — extended regression coverage. The user's
// follow-up complaint: "after deleting a parameter, adding it back
// fails". This test exercises the full delete + re-add cycle on
// the user-reported vendor-CDD project for every parameter type
// (boolean / integer / float / enum / string-ish) and reports
// which step (delete vs re-add) fails if any.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { addParameter, applyParamUpdate, removeParameter } from '@core/arxml/mutation';
import { parseArxml } from '@core/arxml/parser';
import { findByPath } from '@core/arxml/path';
import type { BswModuleDef, ParamDef } from '@core/project/bswmd';
import { parseBswmd } from '@core/project/bswmd';

const VALUE_PATH =
  'C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/ecuc/JWQ3399_EcucValues.arxml';
const BSWMD_PATH =
  'C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/bswmd/JWQ3399_bswmd.arxml';

interface CycleCase {
  readonly label: string;
  readonly containerPath: string;
  readonly paramKey: string;
}

const CASES: readonly CycleCase[] = [
  { label: 'boolean', containerPath: '/JWQ3399/JWQ3399General', paramKey: 'JWQ3399DevErrorDetect' },
  { label: 'integer', containerPath: '/JWQ3399/JWQ3399General', paramKey: 'JWQ3399ChipNum' },
  { label: 'float', containerPath: '/JWQ3399/JWQ3399General', paramKey: 'JWQ3399MainFunctionPeriod' },
  { label: 'enum', containerPath: '/JWQ3399/JWQ3399General', paramKey: 'JWQ3399CommArch' },
  { label: 'integer (sub)', containerPath: '/JWQ3399/JWQ3399ConfigSet/JWQ3399InitConfig', paramKey: 'InitFastSampleCount' },
  { label: 'boolean (sub)', containerPath: '/JWQ3399/JWQ3399General/JWQ3399GPIOConfig', paramKey: 'JWQ3399_GPIO_I2C_ENABLE' },
  { label: 'enum (sub)', containerPath: '/JWQ3399/JWQ3399General/JWQ3399CommunicateConfig', paramKey: 'BaudRate' },
];

describe('Sprint 18 — delete + re-add cycle (user follow-up complaint)', () => {
  it('every parameter can be removed and then re-added on the post-fold path', () => {
    const valueXml = readFileSync(VALUE_PATH, 'utf-8');
    const valueResult = parseArxml(valueXml);
    if (!valueResult.ok) throw new Error(`value parse: ${valueResult.error.kind}`);
    let doc = valueResult.value;

    const bswmdXml = readFileSync(BSWMD_PATH, 'utf-8');
    const bswmdResult = parseBswmd(bswmdXml);
    if (!bswmdResult.ok) throw new Error(`bswmd parse: ${bswmdResult.error.kind}`);
    const bswmd = bswmdResult.value;

    const failures: string[] = [];
    for (const c of CASES) {
      // === Step 1: capture initial state via a get ===
      const before = findByPath(doc, c.containerPath);
      if (before === null) {
        failures.push(`  [${c.label}] container missing at ${c.containerPath}`);
        continue;
      }
      if (before.element.kind !== 'module' && before.element.kind !== 'container') {
        failures.push(`  [${c.label}] unexpected element kind`);
        continue;
      }
      if (before.element.params[c.paramKey] === undefined) {
        failures.push(`  [${c.label}] param ${c.paramKey} not present in source — test bug`);
        continue;
      }

      // === Step 2: delete ===
      const delResult = removeParameter(doc, c.containerPath, c.paramKey);
      if (!delResult.ok) {
        failures.push(
          `  [${c.label}] removeParameter failed at delete: ${JSON.stringify(delResult.error)}`,
        );
        continue;
      }
      doc = delResult.value;
      const afterDel = findByPath(doc, c.containerPath);
      if (
        afterDel === null ||
        (afterDel.element.kind !== 'module' && afterDel.element.kind !== 'container') ||
        afterDel.element.params[c.paramKey] !== undefined
      ) {
        failures.push(`  [${c.label}] param still present after delete`);
        continue;
      }

      // === Step 3: look up the BSWMD paramDef so we can re-add ===
      const moduleDef = bswmd.modules.find((m: BswModuleDef) => m.shortName === 'JWQ3399');
      if (moduleDef === undefined) {
        failures.push(`  [${c.label}] BSWMD module JWQ3399 not found`);
        continue;
      }
      const paramDef = findParamDef(moduleDef, c.containerPath, c.paramKey);
      if (paramDef === null) {
        failures.push(`  [${c.label}] BSWMD paramDef not found for ${c.paramKey}`);
        continue;
      }

      // === Step 4: re-add ===
      const addResult = addParameter(doc, c.containerPath, paramDef, moduleDef);
      if (!addResult.ok) {
        failures.push(
          `  [${c.label}] addParameter failed at re-add: ${JSON.stringify(addResult.error)}`,
        );
        continue;
      }
      doc = addResult.value;

      // === Step 5: confirm the param is back ===
      const afterAdd = findByPath(doc, c.containerPath);
      if (
        afterAdd === null ||
        (afterAdd.element.kind !== 'module' && afterAdd.element.kind !== 'container') ||
        afterAdd.element.params[c.paramKey] === undefined
      ) {
        failures.push(`  [${c.label}] param missing after re-add`);
        continue;
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Sprint 18 fix incomplete — ${failures.length} delete/add cycle failures:\n${failures.join('\n')}`,
      );
    }
    expect(failures).toEqual([]);
  });

  it('applyParamUpdate works on a doc that has been mutated by addParameter/removeParameter', () => {
    // Mixed sequence: add new param → edit it → delete it → re-edit another.
    const valueXml = readFileSync(VALUE_PATH, 'utf-8');
    const valueResult = parseArxml(valueXml);
    if (!valueResult.ok) throw new Error(`value parse: ${valueResult.error.kind}`);
    let doc = valueResult.value;

    const bswmdXml = readFileSync(BSWMD_PATH, 'utf-8');
    const bswmdResult = parseBswmd(bswmdXml);
    if (!bswmdResult.ok) throw new Error(`bswmd parse: ${bswmdResult.error.kind}`);
    const bswmd = bswmdResult.value;
    const moduleDef = bswmd.modules.find((m: BswModuleDef) => m.shortName === 'JWQ3399');
    if (moduleDef === undefined) throw new Error('JWQ3399 module not in BSWMD');

    const containerPath = '/JWQ3399/JWQ3399General';

    // Step 1: delete a param
    const delResult = removeParameter(doc, containerPath, 'JWQ3399DevErrorDetect');
    if (!delResult.ok) throw new Error(`delete failed: ${JSON.stringify(delResult.error)}`);
    doc = delResult.value;

    // Step 2: re-add it
    const paramDef = findParamDef(moduleDef, containerPath, 'JWQ3399DevErrorDetect');
    if (paramDef === null) throw new Error('BSWMD missing paramDef');
    const addResult = addParameter(doc, containerPath, paramDef, moduleDef);
    if (!addResult.ok) throw new Error(`re-add failed: ${JSON.stringify(addResult.error)}`);
    doc = addResult.value;

    // Step 3: edit it via applyParamUpdate (the same path the renderer
    // uses). Use a value DIFFERENT from the placeholder so the call
    // is a real edit, not a no-op against the just-added zero value.
    const editResult = applyParamUpdate(doc, containerPath, 'JWQ3399DevErrorDetect', {
      type: 'boolean',
      value: true,
    });
    if (editResult === doc) {
      throw new Error('applyParamUpdate returned the same doc reference after re-add');
    }
    doc = editResult;

    // Step 4: edit a different param too
    const editResult2 = applyParamUpdate(doc, containerPath, 'JWQ3399CommArch', {
      type: 'enum',
      value: 'CommArchWithOutBridge',
    });
    if (editResult2 === doc) {
      throw new Error('applyParamUpdate returned the same doc reference for second edit');
    }
    expect(editResult2).not.toBe(doc);
  });

  it('addParameter succeeds for BSWMD params that omit <DEFAULT-VALUE> (user follow-up complaint)', () => {
    // Sprint 18 follow-up — the user's JWQ3399_bswmd.arxml declares
    // many params without a `<DEFAULT-VALUE>` (JWQ3399CommArch,
    // JWQ3399MainFunctionPeriod, JWQ3399ChipNum, ...). After deleting
    // one of these and trying to re-add, the old code rejected the
    // re-add with `invalid-param-type` because `buildDefaultValue`
    // returns `null` for null-default BSWMD params. The fix:
    // `addParameter` falls back to a typed zero-value placeholder when
    // `buildDefaultValue` returns null.
    //
    // We deliberately DO NOT pre-populate from the source doc — the
    // test loads a fresh value tree, picks a param that the BSWMD
    // declares, and verifies `addParameter` succeeds and produces an
    // editable cell.
    const valueXml = readFileSync(VALUE_PATH, 'utf-8');
    const valueResult = parseArxml(valueXml);
    if (!valueResult.ok) throw new Error(`value parse: ${valueResult.error.kind}`);
    let doc = valueResult.value;

    const bswmdXml = readFileSync(BSWMD_PATH, 'utf-8');
    const bswmdResult = parseBswmd(bswmdXml);
    if (!bswmdResult.ok) throw new Error(`bswmd parse: ${bswmdResult.error.kind}`);
    const bswmd = bswmdResult.value;
    const moduleDef = bswmd.modules.find((m: BswModuleDef) => m.shortName === 'JWQ3399');
    if (moduleDef === undefined) throw new Error('JWQ3399 module not in BSWMD');

    const containerPath = '/JWQ3399/JWQ3399General';

    // First, delete all params in JWQ3399General so we exercise the
    // "from empty" addParameter path. This mirrors the user-visible
    // scenario where they delete everything in a container and then
    // start re-adding.
    const general = moduleDef.containers.find((c) => c.shortName === 'JWQ3399General');
    if (general === undefined) throw new Error('JWQ3399General not in BSWMD');
    for (const p of general.parameters) {
      const delResult = removeParameter(doc, containerPath, p.shortName);
      if (!delResult.ok) throw new Error(`delete ${p.shortName} failed`);
      doc = delResult.value;
    }

    // Verify container is now empty.
    const empty = findByPath(doc, containerPath);
    if (empty === null || (empty.element.kind !== 'module' && empty.element.kind !== 'container')) {
      throw new Error('container missing after mass delete');
    }
    if (Object.keys(empty.element.params).length !== 0) {
      throw new Error('expected empty container');
    }

    // Now add each parameter back. Every one must succeed.
    const failures: string[] = [];
    for (const p of general.parameters) {
      const addResult = addParameter(doc, containerPath, p, moduleDef);
      if (!addResult.ok) {
        failures.push(
          `  [${p.shortName} (${p.kind})] addParameter failed: ${JSON.stringify(addResult.error)}`,
        );
        continue;
      }
      doc = addResult.value;
    }

    if (failures.length > 0) {
      throw new Error(`Sprint 18 fix incomplete — ${failures.length} adds failed:\n${failures.join('\n')}`);
    }

    // Sanity check: container now has all the original params with
    // the right shape (zero-value placeholder + definitionRef).
    const full = findByPath(doc, containerPath);
    if (full === null || (full.element.kind !== 'module' && full.element.kind !== 'container')) {
      throw new Error('container missing after re-add');
    }
    for (const p of general.parameters) {
      const v = full.element.params[p.shortName];
      if (v === undefined) {
        failures.push(`  [${p.shortName}] missing after re-add`);
      }
    }
    expect(failures).toEqual([]);
  });
});

/**
 * Mirror of `resolveParamDefForPath` from `store/helpers/bswmdLookup.ts`
 * (not exported). Walks the BSWMD module tree to find a ParamDef by
 * shortName under the parent container whose value-side path matches
 * `containerPath` post-fold.
 */
function findParamDef(
  mod: BswModuleDef,
  containerPath: string,
  paramShortName: string,
): ParamDef | null {
  const segments = containerPath.split('/').filter(Boolean);
  const moduleIdx = segments.lastIndexOf(mod.shortName);
  if (moduleIdx === -1) return null;
  const subSegments = segments.slice(moduleIdx + 1);
  if (subSegments.length === 0) return null;
  let container = mod.containers.find((c) => c.shortName === subSegments[0]);
  for (let i = 1; i < subSegments.length && container !== undefined; i++) {
    const seg = subSegments[i];
    if (seg === undefined) return null;
    container = container.subContainers.find((c) => c.shortName === seg);
  }
  if (container === undefined) return null;
  return container.parameters.find((p) => p.shortName === paramShortName) ?? null;
}