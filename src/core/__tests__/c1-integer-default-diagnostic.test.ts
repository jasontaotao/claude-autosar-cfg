import { describe, expect, it } from 'vitest';

import type { EcucInstanceRow } from '../../shared/types.js';
import { parseArxml } from '../arxml/parser.js';
import { serializeArxml } from '../arxml/serializer.js';
import { xlsxToEcucBatch } from '../bridge/xlsxToEcucBatch.js';
import { applyPatchSteps } from '../mutation/applyPatchSteps.js';

// Inline BSWMD fragment declaring ComIPdu with ComPduId integer param
// having DEFAULT-VALUE=0 (the case the diagnostic must exercise).
const COM_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>AUTOSAR</SHORT-NAME><ELEMENTS>
      <ECUC-MODULE-DEF>
        <SHORT-NAME>Com</SHORT-NAME>
        <CONTAINERS>
          <ECUC-PARAM-CONF-CONTAINER-DEF>
            <SHORT-NAME>ComConfig</SHORT-NAME>
            <CONTAINERS>
              <ECUC-PARAM-CONF-CONTAINER-DEF>
                <SHORT-NAME>ComIpdu</SHORT-NAME>
                <PARAMETERS>
                  <ECUC-INTEGER-PARAM-DEF>
                    <SHORT-NAME>ComPduId</SHORT-NAME>
                    <MIN>0</MIN><MAX>65535</MAX>
                    <DEFAULT-VALUE>0</DEFAULT-VALUE>
                  </ECUC-INTEGER-PARAM-DEF>
                </PARAMETERS>
              </ECUC-PARAM-CONF-CONTAINER-DEF>
            </CONTAINERS>
          </ECUC-PARAM-CONF-CONTAINER-DEF>
        </CONTAINERS>
      </ECUC-MODULE-DEF>
    </ELEMENTS></AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

// Minimal Com_Config.arxml stub with one empty ComConfig container
const COM_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>AUTOSAR</SHORT-NAME><ELEMENTS>
      <ECUC-MODULE-CONFIGURATION-VALUES>
        <SHORT-NAME>Com</SHORT-NAME>
        <CONTAINERS>
          <ECUC-CONTAINER-VALUE>
            <SHORT-NAME>ComConfig</SHORT-NAME>
            <CONTAINERS/>
          </ECUC-CONTAINER-VALUE>
        </CONTAINERS>
      </ECUC-MODULE-CONFIGURATION-VALUES>
    </ELEMENTS></AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

describe('C1 integer-default diagnostic (v1.25.x PATCH T2)', () => {
  it('surfaces which of 4 root-cause branches is active for integer default', async () => {
    const rows: EcucInstanceRow[] = [
      {
        sheet: 'ComIPdu',
        shortName: 'Pdu_Diag',
        params: { ComPduId: 1 },
      },
    ];
    // Branch A check: does mapper emit set-param?
    const rawSteps = xlsxToEcucBatch(rows);
    const setParamSteps = rawSteps.filter((s) => s.op === 'set-param');
    console.log('[DIAGNOSTIC] PatchSteps emitted (raw):', JSON.stringify(rawSteps, null, 2));
    expect(setParamSteps.length).toBeGreaterThan(0); // Branch A fails if no set-param emitted

    // Branch B/C check: does engine mutation + serialization land the value?
    const { parseBswmd } = await import('../project/bswmd.js');
    const bswmdRes = parseBswmd(COM_BSWMD);
    expect(bswmdRes.ok).toBe(true);
    if (!bswmdRes.ok) return;
    const moduleDef = bswmdRes.value.modules[0]!;

    // Mirror the import handler's `translateStepPath`: strip the leaf
    // container-def segment so the engine's `findParentContainerDef`
    // walks BSWMD-side defs and `applyAddChild`'s
    // `findChildDefForAdd` resolves the leaf-def shortName as a hint.
    // Without this, the engine emits `path-not-found` for every step
    // and never reaches the integer-default surface — masking any
    // branch-B/C observation. We also prefix containerPath/parentPath
    // with `/AUTOSAR/` (the COM_CONFIG AR-PACKAGE shortName) so the
    // engine's path walker matches `findContainerByPath`'s expectation.
    const PKG = '/AUTOSAR';
    const steps = rawSteps.map((s) => {
      if (s.op === 'add-child') {
        const segs = s.parentPath.split('/').filter((p) => p.length > 0);
        if (segs.length > 2) {
          return { ...s, parentPath: PKG + '/' + segs.slice(0, 2).join('/') };
        }
        return { ...s, parentPath: PKG + '/' + segs.join('/') };
      }
      if (s.op === 'set-param') {
        const segs = s.containerPath.split('/').filter((p) => p.length > 0);
        if (segs.length >= 4) {
          return {
            ...s,
            containerPath: PKG + '/' + [segs[0], segs[1], segs[3]].join('/'),
          };
        }
        return { ...s, containerPath: PKG + '/' + segs.join('/') };
      }
      return s;
    });
    console.log('[DIAGNOSTIC] PatchSteps translated:', JSON.stringify(steps, null, 2));

    const docRes = parseArxml(COM_CONFIG);
    expect(docRes.ok).toBe(true);
    if (!docRes.ok) return;
    const applyRes = applyPatchSteps(docRes.value, steps, { moduleDef });
    console.log('[DIAGNOSTIC] applyPatchSteps errors:', JSON.stringify(applyRes.errors));
    console.log('[DIAGNOSTIC] applyPatchSteps applied:', applyRes.applied);
    const serRes = serializeArxml(applyRes.doc, { sourceArxml: COM_CONFIG });
    expect(serRes.ok).toBe(true);
    if (!serRes.ok) return;
    console.log('[DIAGNOSTIC] Serialized ARXML:\n', serRes.value);
    // Branch B fails: serialized text contains <VALUE>0</VALUE> instead of <VALUE>1</VALUE>
    expect(serRes.value).toContain('<VALUE>1</VALUE>');
  });
});
