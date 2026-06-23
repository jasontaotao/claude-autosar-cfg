// Sprint X v1.9.0 (HIGH #2) — the parser must read container-level
// <DEFINITION-REF> so skeleton-emitted arxml survives save→reload→save.
//
// The skeleton's `buildTopContainer` / `buildSubContainerShell` stamp
// `c.definitionRef` from the BSWMD path. The serializer (renderContainer)
// emits it as a `<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">`
// child of `<ECUC-CONTAINER-VALUE>`. Before this fix, the parser's
// `buildContainer` did not read that child — so a user's save→reload→save
// cycle silently dropped every container-level DEFINITION-REF (a
// regression against the v1.4.1 round-trip guarantee).

import { describe, it, expect } from 'vitest';

import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';
import type { ArxmlContainer, ArxmlModule, ArxmlPackage } from '../types.js';

const VENDOR_XML = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME><AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>JWQ_Packet</SHORT-NAME><AR-PACKAGES>
      <AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME><ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>JWQ3399</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>JWQ3399ConfigSet</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet</DEFINITION-REF>
              <SUB-CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>Child</SHORT-NAME>
                  <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/Child</DEFINITION-REF>
                </ECUC-CONTAINER-VALUE>
              </SUB-CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS></AR-PACKAGE>
    </AR-PACKAGES></AR-PACKAGE>
  </AR-PACKAGES></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;

function findContainerByShortName(
  pkg: ArxmlPackage,
  shortName: string,
): ArxmlContainer | undefined {
  for (const el of pkg.elements) {
    if (el.kind === 'module') {
      const found = findInModule(el as ArxmlModule, shortName);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function findInModule(m: ArxmlModule, shortName: string): ArxmlContainer | undefined {
  for (const child of m.children) {
    if (child.kind === 'container' && child.shortName === shortName) {
      return child as ArxmlContainer;
    }
    if (child.kind === 'module' || child.kind === 'container') {
      const found = findInModule(child as ArxmlModule, shortName);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

describe('parser reads container-level <DEFINITION-REF> (HIGH #2)', () => {
  it('captures definitionRef on top-level container', () => {
    const r = parseArxml(VENDOR_XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rootPkg = r.value.packages[0]!;
    const innerPkg = rootPkg.packages?.[0]?.packages?.[0];
    expect(innerPkg).toBeDefined();
    if (innerPkg === undefined) return;
    const cfgSet = findContainerByShortName(innerPkg, 'JWQ3399ConfigSet');
    expect(cfgSet).toBeDefined();
    if (cfgSet === undefined) return;
    expect(cfgSet.definitionRef).toBe('/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet');
  });

  it('captures definitionRef on nested sub-container', () => {
    const r = parseArxml(VENDOR_XML);
    if (!r.ok) throw new Error(`parse: ${r.error}`);
    const rootPkg = r.value.packages[0]!;
    const innerPkg = rootPkg.packages?.[0]?.packages?.[0];
    if (innerPkg === undefined) throw new Error('nested pkg missing');
    const child = findContainerByShortName(innerPkg, 'Child');
    expect(child).toBeDefined();
    if (child === undefined) return;
    expect(child.definitionRef).toBe('/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/Child');
  });

  it('restores isChoiceContainer when DEST is ECUC-CHOICE-CONTAINER-DEF', () => {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>Pkg</SHORT-NAME><ELEMENTS>
    <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>Mod</SHORT-NAME>
      <CONTAINERS>
        <ECUC-CONTAINER-VALUE>
          <SHORT-NAME>Choice</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-CHOICE-CONTAINER-DEF">/Pkg/Mod/Choice</DEFINITION-REF>
        </ECUC-CONTAINER-VALUE>
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    if (!r.ok) throw new Error(`parse: ${r.error}`);
    const cfgSet = findContainerByShortName(r.value.packages[0]!, 'Choice');
    expect(cfgSet).toBeDefined();
    if (cfgSet === undefined) return;
    expect(cfgSet.definitionRef).toBe('/Pkg/Mod/Choice');
    expect(cfgSet.isChoiceContainer).toBe(true);
  });

  it('save → reload → save preserves container-level DEFINITION-REF', () => {
    const r1 = parseArxml(VENDOR_XML);
    if (!r1.ok) throw new Error(`parse: ${r1.error}`);
    const s1 = serializeArxml(r1.value);
    if (!s1.ok) throw new Error(`serialize: ${s1.error}`);

    // Second round — reload the serialized form and re-serialize.
    const r2 = parseArxml(s1.value);
    if (!r2.ok) throw new Error(`re-parse: ${r2.error}`);
    const s2 = serializeArxml(r2.value);
    if (!s2.ok) throw new Error(`re-serialize: ${s2.error}`);

    // Both serializations must contain the DEFINITION-REF path so the
    // field survives save→reload→save.
    expect(s1.value).toContain('/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet');
    expect(s2.value).toContain('/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet');
    expect(s2.value).toContain('/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/Child');
  });
});
