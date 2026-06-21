// BSWMD parser tests — Sprint 12 #1 Task 1.
//
// Covers both BSWMD dialects observed in real EB tresos / AUTOSAR-standard
// BSW Module Description files. Inline XML strings only — no fixture I/O.
//
// Conventions follow the rest of the core test suite (AAA pattern,
// vitest `describe`/`it`/`expect`, descriptive behaviour names).

import { describe, it, expect } from 'vitest';

import {
  parseBswmd,
  findModuleByPath,
  lookupContainerDef,
  lookupParamDef,
  lookupReferenceDef,
  getContainerDefByPath,
  listContainerChildren,
} from '../bswmd.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal EB tresos dialect (BswModuleDescription). Module-id is mandatory in
 * this dialect; SHORT-NAME + MODULE-ID + PROVIDED-ENTRYS are the minimum we
 * must be able to read.
 */
const EB_TRESOS_MINIMAL = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-0-3.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_Can</SHORT-NAME>
      <ELEMENTS>
        <BSW-MODULE-DESCRIPTION>
          <SHORT-NAME>Can</SHORT-NAME>
          <MODULE-ID>120</MODULE-ID>
          <PROVIDED-ENTRYS>
            <BSW-MODULE-ENTRY-REF-CONDITIONAL>
              <SHORT-NAME>Can_Init</SHORT-NAME>
              <ENTRY-REF DEST="BSW-MODULE-ENTRY">/AUTOSAR_Can/BswModuleEntrys/Can_Init</ENTRY-REF>
            </BSW-MODULE-ENTRY-REF-CONDITIONAL>
            <BSW-MODULE-ENTRY-REF-CONDITIONAL>
              <SHORT-NAME>Can_MainFunction_Read</SHORT-NAME>
              <ENTRY-REF DEST="BSW-MODULE-ENTRY">/AUTOSAR_Can/BswModuleEntrys/Can_MainFunction_Read</ENTRY-REF>
            </BSW-MODULE-ENTRY-REF-CONDITIONAL>
          </PROVIDED-ENTRYS>
        </BSW-MODULE-DESCRIPTION>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/**
 * Minimal AUTOSAR standard ECUC-MODULE-DEF. One top-level container with
 * one integer param. Path computed as /AUTOSAR_R22/EcucDefs/Can.
 */
const AUTOSAR_MINIMAL = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-0-3.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-DEF>
              <SHORT-NAME>Can</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>CanGeneral</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <PARAMETERS>
                    <ECUC-INTEGER-PARAM-DEF>
                      <SHORT-NAME>CanDevErrorDetect</SHORT-NAME>
                      <MIN>0</MIN>
                      <MAX>1</MAX>
                      <DEFAULT-VALUE>1</DEFAULT-VALUE>
                    </ECUC-INTEGER-PARAM-DEF>
                  </PARAMETERS>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CONTAINERS>
            </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/**
 * Two-level SUB-CONTAINERS nesting under CanConfigSet. Validates that
 * `lookupContainerDef` recurses into subContainers.
 */
const NESTED_SUB_CONTAINERS = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Can</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>CanConfigSet</SHORT-NAME>
              <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <SUB-CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>CanController</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <SUB-CONTAINERS>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>CanControllerConfig</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                  </SUB-CONTAINERS>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </SUB-CONTAINERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/** Multiple parameter kinds (integer, boolean, enumeration) under one container. */
const MULTI_KIND_PARAMS = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Com</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>ComGeneral</SHORT-NAME>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>ComSupportedIPduGroups</SHORT-NAME>
                  <MIN>0</MIN>
                  <MAX>255</MAX>
                  <DEFAULT-VALUE>1</DEFAULT-VALUE>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-BOOLEAN-PARAM-DEF>
                  <SHORT-NAME>ComConfigurationUseDet</SHORT-NAME>
                  <DEFAULT-VALUE>false</DEFAULT-VALUE>
                </ECUC-BOOLEAN-PARAM-DEF>
                <ECUC-ENUMERATION-PARAM-DEF>
                  <SHORT-NAME>ComPduIdType</SHORT-NAME>
                  <LITERALS>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>FULL</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>EXTENDED</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                  </LITERALS>
                  <DEFAULT-VALUE>FULL</DEFAULT-VALUE>
                </ECUC-ENUMERATION-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/** REFERENCES — both ECUC-REFERENCE-DEF and ECUC-FOREIGN-REFERENCE-DEF under one container. */
const REFERENCES_BOTH = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>PduR</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>PduRRoutingPath</SHORT-NAME>
              <REFERENCES>
                <ECUC-REFERENCE-DEF>
                  <SHORT-NAME>PduRSrcPduRef</SHORT-NAME>
                  <DESTINATION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/Com/PduRRoutingPath</DESTINATION-REF>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                </ECUC-REFERENCE-DEF>
                <ECUC-FOREIGN-REFERENCE-DEF>
                  <SHORT-NAME>PduRSrcPduForeignRef</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>
                </ECUC-FOREIGN-REFERENCE-DEF>
              </REFERENCES>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/** CHOICES — ECUC-CHOICE-ORIENTED-STRUCTURE-DEF with nested choice containers. */
const CHOICES = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>CanIf</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CHOICE-ORIENTED-STRUCTURE-DEF>
              <SHORT-NAME>CanIfBufferCfg</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>
              <CHOICES>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>CanIfMailbox</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>CanIfFifo</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CHOICES>
            </ECUC-CHOICE-ORIENTED-STRUCTURE-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

// Bug regression — Vector/EB tresos dialect uses ECUC-CHOICE-CONTAINER-DEF
// (shorter tag) instead of the AUTOSAR-standard
// ECUC-CHOICE-ORIENTED-STRUCTURE-DEF. The choice subtree has the same
// <CHOICES> shape, so the same builder must accept either tag. Before
// the fix at bswmd.ts:878 the parser fell through to the "Unknown
// container kind" warning and silently dropped the choice container
// — user reported "JWQ3399SpiConfig comes back empty even though
// BSWMD declares CommonContainer and ChoiceContainer".
const CHOICE_CONTAINER_DEF = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>JWQ</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>JWQSpiConfig</SHORT-NAME>
              <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <SUB-CONTAINERS>
                <ECUC-CHOICE-CONTAINER-DEF>
                  <SHORT-NAME>JWQSpiCsConfig</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <CHOICES>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>SpiCsViaPher</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>SpiCsViaGPIO</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                  </CHOICES>
                </ECUC-CHOICE-CONTAINER-DEF>
              </SUB-CONTAINERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

// Bug regression — Vector BSWMDs use ECUC-CHOICE-REFERENCE-DEF for
// references whose target can be any of several alternative container
// kinds (~80 occurrences in samples/arxml/AUTOSAR_MOD_ECUConfigurationParameters.arxml
// across CanIf/Arti/Com). Before the fix at bswmd.ts:1171 the parser
// silently dropped these refs, leaving the parent container's
// references list empty.
const CHOICE_REFERENCE_DEF = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>CanIf</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>CanIfHrhCfg</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>
              <REFERENCES>
                <ECUC-CHOICE-REFERENCE-DEF>
                  <SHORT-NAME>CanIfHrhCanCtrlRef</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <DESTINATION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/Can/CanConfigSet</DESTINATION-REF>
                </ECUC-CHOICE-REFERENCE-DEF>
              </REFERENCES>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

// ---------------------------------------------------------------------------
// parseBswmd — happy path
// ---------------------------------------------------------------------------

describe('parseBswmd — happy path', () => {
  it('parses minimal EB tresos BSW-MODULE-DESCRIPTION with module-id and provided-entries', () => {
    // Arrange + Act
    const r = parseBswmd(EB_TRESOS_MINIMAL);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.modules).toHaveLength(1);
    const mod = r.value.modules[0]!;
    expect(mod.dialect).toBe('bsw-module-description');
    expect(mod.shortName).toBe('Can');
    expect(mod.path).toBe('/AUTOSAR_Can/Can');
    expect(mod.moduleId).toBe(120);
    expect(mod.providedEntries).toHaveLength(2);
    expect(mod.providedEntries[0]!.shortName).toBe('Can_Init');
    expect(mod.providedEntries[0]!.entryRefPath).toBe('/AUTOSAR_Can/BswModuleEntrys/Can_Init');
    expect(mod.providedEntries[0]!.entryKind).toBe('BSW-MODULE-ENTRY');
    expect(mod.providedEntries[1]!.shortName).toBe('Can_MainFunction_Read');
    expect(mod.providedEntries[1]!.entryKind).toBe('BSW-MODULE-ENTRY');
    expect(mod.containers).toHaveLength(0);
    // Synthetic XML uses wrapper SHORT-NAME → no fallback warning fires.
    expect(r.value.warnings.join(' ')).not.toMatch(/provided entry omits wrapper/);
  });

  it('recovers EB tresos providedEntries when wrapper omits <SHORT-NAME> (real-data shape)', () => {
    // Arrange — exact shape observed in tests/fixtures/bswmd/Can_Bswmd.arxml.
    // Wrapper has no <SHORT-NAME>; inner <BSW-MODULE-ENTRY-REF> carries
    // @_DEST + the path text.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_Can</SHORT-NAME>
      <ELEMENTS>
        <BSW-MODULE-DESCRIPTION>
          <SHORT-NAME>Can</SHORT-NAME>
          <MODULE-ID>80</MODULE-ID>
          <PROVIDED-ENTRYS>
            <BSW-MODULE-ENTRY-REF-CONDITIONAL>
              <BSW-MODULE-ENTRY-REF DEST="BSW-MODULE-ENTRY">/AUTOSAR_Can/BswModuleEntrys/Can_Init</BSW-MODULE-ENTRY-REF>
            </BSW-MODULE-ENTRY-REF-CONDITIONAL>
            <BSW-MODULE-ENTRY-REF-CONDITIONAL>
              <BSW-MODULE-ENTRY-REF DEST="BSW-MODULE-ENTRY">/AUTOSAR_Can/BswModuleEntrys/Can_MainFunction_Mode</BSW-MODULE-ENTRY-REF>
            </BSW-MODULE-ENTRY-REF-CONDITIONAL>
          </PROVIDED-ENTRYS>
        </BSW-MODULE-DESCRIPTION>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert — entries recovered with shortName derived from ref path.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.modules[0]!;
    expect(mod.providedEntries).toHaveLength(2);
    expect(mod.providedEntries[0]!.shortName).toBe('Can_Init');
    expect(mod.providedEntries[0]!.entryRefPath).toBe('/AUTOSAR_Can/BswModuleEntrys/Can_Init');
    expect(mod.providedEntries[0]!.entryKind).toBe('BSW-MODULE-ENTRY');
    expect(mod.providedEntries[0]!.path).toBe('/AUTOSAR_Can/Can/Can_Init');
    expect(mod.providedEntries[1]!.shortName).toBe('Can_MainFunction_Mode');
    // Fallback warning recorded once per entry — never silently drops.
    const fallbackWarnings = r.value.warnings.filter((w) =>
      /provided entry omits wrapper <SHORT-NAME>/.test(w),
    );
    expect(fallbackWarnings.length).toBe(2);
  });

  it('skips an unrecoverable provided entry (no SHORT-NAME, no inner ref) and records a warning', () => {
    // Arrange
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>P</SHORT-NAME>
      <ELEMENTS>
        <BSW-MODULE-DESCRIPTION>
          <SHORT-NAME>M</SHORT-NAME>
          <MODULE-ID>1</MODULE-ID>
          <PROVIDED-ENTRYS>
            <BSW-MODULE-ENTRY-REF-CONDITIONAL/>
          </PROVIDED-ENTRYS>
        </BSW-MODULE-DESCRIPTION>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.modules[0]!;
    expect(mod.providedEntries).toHaveLength(0);
    const skipWarnings = r.value.warnings.filter((w) =>
      /no <SHORT-NAME> and no usable entry ref/.test(w),
    );
    expect(skipWarnings.length).toBe(1);
  });

  it('parses minimal AUTOSAR ECUC-MODULE-DEF with one container and one integer param', () => {
    // Arrange + Act
    const r = parseBswmd(AUTOSAR_MINIMAL);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.modules).toHaveLength(1);
    const mod = r.value.modules[0]!;
    expect(mod.dialect).toBe('ecuc-module-def');
    expect(mod.shortName).toBe('Can');
    expect(mod.path).toBe('/AUTOSAR_R22/EcucDefs/Can');
    expect(mod.moduleId).toBeNull();
    expect(mod.containers).toHaveLength(1);
    const c = mod.containers[0]!;
    expect(c.shortName).toBe('CanGeneral');
    expect(c.path).toBe('/AUTOSAR_R22/EcucDefs/Can/CanGeneral');
    expect(c.parameters).toHaveLength(1);
    const p = c.parameters[0]!;
    expect(p.shortName).toBe('CanDevErrorDetect');
    expect(p.kind).toBe('integer');
    expect(p.defaultValue).toBe(1);
    expect(p.minValue).toBe(0);
    expect(p.maxValue).toBe(1);
  });

  it('recurses two levels deep through SUB-CONTAINERS', () => {
    // Arrange + Act
    const r = parseBswmd(NESTED_SUB_CONTAINERS);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.modules[0]!;
    const top = mod.containers[0]!;
    expect(top.shortName).toBe('CanConfigSet');
    expect(top.subContainers).toHaveLength(1);
    const mid = top.subContainers[0]!;
    expect(mid.shortName).toBe('CanController');
    expect(mid.subContainers).toHaveLength(1);
    const leaf = mid.subContainers[0]!;
    expect(leaf.shortName).toBe('CanControllerConfig');
  });

  it('parses PARAMETERS of multiple kinds (integer / boolean / enumeration)', () => {
    // Arrange + Act
    const r = parseBswmd(MULTI_KIND_PARAMS);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const params = r.value.modules[0]!.containers[0]!.parameters;
    expect(params).toHaveLength(3);
    const integer = params.find((p) => p.shortName === 'ComSupportedIPduGroups')!;
    expect(integer.kind).toBe('integer');
    expect(integer.minValue).toBe(0);
    expect(integer.maxValue).toBe(255);
    const boolean = params.find((p) => p.shortName === 'ComConfigurationUseDet')!;
    expect(boolean.kind).toBe('boolean');
    expect(boolean.defaultValue).toBe(false);
    const enumeration = params.find((p) => p.shortName === 'ComPduIdType')!;
    expect(enumeration.kind).toBe('enumeration');
    expect(enumeration.enumerationLiterals).toEqual(['FULL', 'EXTENDED']);
    expect(enumeration.defaultValue).toBe('FULL');
  });

  it('parses ECUC-FUNCTION-NAME-DEF as kind "function-name" (distinct from string)', () => {
    // Arrange — ECUC-FUNCTION-NAME-DEF must NOT collapse to "string" because
    // Sprint 13's editor will validate against a symbol table, not free text.
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Os</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>OsHook</SHORT-NAME>
              <PARAMETERS>
                <ECUC-FUNCTION-NAME-DEF>
                  <SHORT-NAME>ErrorHook</SHORT-NAME>
                  <MIN-LENGTH>1</MIN-LENGTH>
                  <MAX-LENGTH>32</MAX-LENGTH>
                  <DEFAULT-VALUE>ErrorHook</DEFAULT-VALUE>
                </ECUC-FUNCTION-NAME-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fn = r.value.modules[0]!.containers[0]!.parameters[0]!;
    expect(fn.kind).toBe('function-name');
    expect(fn.kind).not.toBe('string');
    expect(fn.shortName).toBe('ErrorHook');
    expect(fn.defaultValue).toBe('ErrorHook');
    expect(fn.minLength).toBe(1);
    expect(fn.maxLength).toBe(32);
  });

  it('accepts the AUTOSAR numeric-format namespace (e.g. "00046")', () => {
    // Arrange — AUTOSAR release namespaces use either "r4.x" or a numeric
    // form like "00046". The regex must accept both shapes or newer BSWMD
    // releases will be rejected as unsupported-version.
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/00046">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>P</SHORT-NAME>
      <ELEMENTS></ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.version).toBe('00046');
  });

  it('parses REFERENCES (ECUC-REFERENCE-DEF and ECUC-FOREIGN-REFERENCE-DEF)', () => {
    // Arrange + Act
    const r = parseBswmd(REFERENCES_BOTH);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const refs = r.value.modules[0]!.containers[0]!.references;
    expect(refs).toHaveLength(2);
    const dom = refs.find((x) => x.shortName === 'PduRSrcPduRef')!;
    expect(dom.destKind).toBe('ECUC-PARAM-CONF-CONTAINER-DEF');
    expect(dom.upperMultiplicity).toBe(1);
    const foreign = refs.find((x) => x.shortName === 'PduRSrcPduForeignRef')!;
    expect(foreign.destKind).toBe('ECUC-FOREIGN-REFERENCE-DEF');
    expect(foreign.upperMultiplicity).toBe('infinite');
  });

  it('parses CHOICES (ECUC-CHOICE-ORIENTED-STRUCTURE-DEF) with nested choice containers', () => {
    // Arrange + Act
    const r = parseBswmd(CHOICES);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.value.modules[0]!.containers[0]!;
    expect(c.choices).toHaveLength(2);
    expect(c.choices[0]!.shortName).toBe('CanIfMailbox');
    expect(c.choices[1]!.shortName).toBe('CanIfFifo');
    expect(c.choices[0]!.path).toBe('/EcucDefs/CanIf/CanIfBufferCfg/CanIfMailbox');
  });

  it('maps UPPER-MULTIPLICITY-INFINITE=true to "infinite" on containers', () => {
    // Arrange + Act
    const r = parseBswmd(CHOICES);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.value.modules[0]!.containers[0]!;
    expect(c.upperMultiplicity).toBe('infinite');
  });

  it('parses CHOICES via Vector-style ECUC-CHOICE-CONTAINER-DEF (regression: bug — silent drop)', () => {
    // Arrange + Act
    const r = parseBswmd(CHOICE_CONTAINER_DEF);

    // Assert — same shape as the ECUC-CHOICE-ORIENTED-STRUCTURE-DEF
    // case: the choice container is registered in subContainers, its
    // `choices` field carries the two branches, and no "Unknown
    // container kind" warning is recorded.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings).toEqual([]);
    const spiParent = r.value.modules[0]!.containers[0]!;
    expect(spiParent.shortName).toBe('JWQSpiConfig');
    expect(spiParent.subContainers).toHaveLength(1);
    const choice = spiParent.subContainers[0]!;
    expect(choice.shortName).toBe('JWQSpiCsConfig');
    expect(choice.lowerMultiplicity).toBe(1);
    expect(choice.choices).toHaveLength(2);
    expect(choice.choices.map((c) => c.shortName)).toEqual(['SpiCsViaPher', 'SpiCsViaGPIO']);
  });

  it('parses REFERENCES via Vector-style ECUC-CHOICE-REFERENCE-DEF (regression: bug — silent drop)', () => {
    // Arrange + Act
    const r = parseBswmd(CHOICE_REFERENCE_DEF);

    // Assert — the choice-reference is surfaced in the parent
    // container's `references` list with the correct destKind
    // resolved from the inner DESTINATION-REF @_DEST attribute.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings).toEqual([]);
    const cfg = r.value.modules[0]!.containers[0]!;
    expect(cfg.references).toHaveLength(1);
    expect(cfg.references[0]!.shortName).toBe('CanIfHrhCanCtrlRef');
    expect(cfg.references[0]!.destKind).toBe('ECUC-PARAM-CONF-CONTAINER-DEF');
  });

  it('returns an empty modules list for an empty ELEMENTS block', () => {
    // Arrange
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.0"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.modules).toEqual([]);
    expect(r.value.warnings).toEqual([]);
  });

  it('collects warnings when an unknown ECUC-XXX-DEF kind is encountered', () => {
    // Arrange
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Foo</SHORT-NAME>
          <CONTAINERS>
            <ECUC-UNKNOWN-WIDGET-DEF>
              <SHORT-NAME>Unrecognized</SHORT-NAME>
            </ECUC-UNKNOWN-WIDGET-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings.length).toBeGreaterThan(0);
    expect(r.value.warnings.join(' ')).toMatch(/ECUC-UNKNOWN-WIDGET-DEF|Foo/);
  });

  // Sprint 13 Stage 5.D — default-value cross-check against enumerationLiterals.
  //
  // AUTOSAR allows an ECUC-ENUMERATION-PARAM-DEF to carry a `<DEFAULT-VALUE>`
  // outside its declared `<LITERALS>`. A vendor tool that does this produces
  // a BSWMD that the renderer can load but the user can't reliably set the
  // default to. We surface a warning (not a fatal error — same approach as
  // the unknown-kind warning above) so the project panel can show a banner.
  it('emits a default-value warning when DEFAULT-VALUE is not in enumerationLiterals', () => {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>M</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>C</SHORT-NAME>
              <SUB-CONTAINERS/>
              <PARAMETERS>
                <ECUC-ENUMERATION-PARAM-DEF>
                  <SHORT-NAME>Mode</SHORT-NAME>
                  <LITERALS>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>BAR</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>BAZ</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                  </LITERALS>
                  <DEFAULT-VALUE>FOO</DEFAULT-VALUE>
                </ECUC-ENUMERATION-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    const r = parseBswmd(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dvWarnings = r.value.warnings.filter((w) => /DEFAULT-VALUE/i.test(w));
    expect(dvWarnings).toHaveLength(1);
    expect(dvWarnings[0]).toMatch(/FOO/);
    expect(dvWarnings[0]).toMatch(/\/EcucDefs\/M\/C\/Mode/);
  });

  it('does not warn when DEFAULT-VALUE matches a declared LITERAL', () => {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>M</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>C</SHORT-NAME>
              <SUB-CONTAINERS/>
              <PARAMETERS>
                <ECUC-ENUMERATION-PARAM-DEF>
                  <SHORT-NAME>Mode</SHORT-NAME>
                  <LITERALS>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>BAR</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>BAZ</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                  </LITERALS>
                  <DEFAULT-VALUE>BAR</DEFAULT-VALUE>
                </ECUC-ENUMERATION-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    const r = parseBswmd(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dvWarnings = r.value.warnings.filter((w) => /DEFAULT-VALUE/i.test(w));
    expect(dvWarnings).toEqual([]);
  });

  it('does not warn about default-value for non-enumeration params', () => {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>M</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>C</SHORT-NAME>
              <SUB-CONTAINERS/>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>Count</SHORT-NAME>
                  <MIN>0</MIN>
                  <MAX>10</MAX>
                  <DEFAULT-VALUE>5</DEFAULT-VALUE>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-STRING-PARAM-DEF>
                  <SHORT-NAME>Name</SHORT-NAME>
                  <DEFAULT-VALUE>Hello</DEFAULT-VALUE>
                </ECUC-STRING-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    const r = parseBswmd(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dvWarnings = r.value.warnings.filter((w) => /DEFAULT-VALUE/i.test(w));
    expect(dvWarnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseBswmd — error path
// ---------------------------------------------------------------------------

describe('parseBswmd — error path', () => {
  it('returns xml-malformed for unclosed tag', () => {
    // Arrange
    const broken = '<?xml version="1.0"?><AUTOSAR><AR-PACKAGES><AR-PACKAGE>';

    // Act
    const r = parseBswmd(broken);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('xml-malformed');
  });

  it('returns missing-root when <AUTOSAR> is absent', () => {
    // Arrange
    const xml = '<?xml version="1.0"?><ROOT><AR-PACKAGES/></ROOT>';

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('missing-root');
  });

  it('returns missing-root when <AUTOSAR> is missing <AR-PACKAGES>', () => {
    // Branch coverage — line 226 in bswmd.ts fires when AR-PACKAGES is
    // missing from the AUTOSAR element.
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <OTHER/>
</AUTOSAR>`;
    const r = parseBswmd(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('missing-root');
  });

  it('returns unsupported-version for r3.x namespace', () => {
    // Arrange
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r3.5">
  <AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS></ELEMENTS></AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    if (r.error.kind === 'unsupported-version') {
      expect(r.error.version).toBe('3.5');
    } else {
      expect.fail(`expected unsupported-version, got ${r.error.kind}`);
    }
  });

  it('returns invalid-structure when ECUC-MODULE-DEF is missing SHORT-NAME', () => {
    // Arrange
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <CONTAINERS></CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-structure');
    if (r.error.kind === 'invalid-structure') {
      expect(r.error.message).toMatch(/SHORT-NAME/);
    }
  });

  // Sprint 13 Stage 5.D — defensive container-nesting depth limit.
  //
  // Pathological / hostile BSWMDs with deeply-nested SUB-CONTAINERS would
  // otherwise blow the V8 stack (`buildContainer` / `buildContainerList`
  // recurse without a depth check). We cap at 64 levels — well above
  // any real AUTOSAR schema (typically < 20) but well below the V8
  // default stack limit (~10000 frames). When the limit trips the
  // parser returns `invalid-structure` so the renderer can show a clean
  // error rather than crashing main.
  it('returns invalid-structure when container nesting depth exceeds the limit (64)', () => {
    // Arrange — build a fixture with 65 levels of nested containers.
    // The MODULE has a top-level CONTAINER (depth 1), each of which
    // contains one SUB-CONTAINER (depth 2, 3, ... 65).
    //
    // Build the structure iteratively: each `L${i}` container wraps the
    // next. The innermost (L64) has no SUB-CONTAINERS child; all others
    // have exactly one. The cap is 64, so depth 65 must trip.
    const NESTING = 65;
    let inner =
      '<SHORT-NAME>L64</SHORT-NAME><LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY><UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>';
    for (let i = NESTING - 2; i >= 0; i--) {
      inner =
        `<SHORT-NAME>L${i}</SHORT-NAME>` +
        `<LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>` +
        `<UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>` +
        `<SUB-CONTAINERS>` +
        `<ECUC-PARAM-CONF-CONTAINER-DEF>${inner}</ECUC-PARAM-CONF-CONTAINER-DEF>` +
        `</SUB-CONTAINERS>`;
    }
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>M</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>${inner}</ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    if (r.error.kind !== 'invalid-structure') {
      throw new Error(
        `expected invalid-structure, got ${r.error.kind}: ${'message' in r.error ? r.error.message : ''}`,
      );
    }
    expect(r.error.message).toMatch(/depth/i);
    expect(r.error.message).toMatch(/64/);
  });
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

describe('findModuleByPath', () => {
  it('finds a module by absolute path', () => {
    // Arrange
    const doc = parseBswmd(AUTOSAR_MINIMAL);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;

    // Act
    const mod = findModuleByPath(doc.value, '/AUTOSAR_R22/EcucDefs/Can');

    // Assert
    expect(mod).not.toBeNull();
    expect(mod?.shortName).toBe('Can');
  });

  it('returns null when the module path does not exist', () => {
    // Arrange
    const doc = parseBswmd(AUTOSAR_MINIMAL);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;

    // Act
    const mod = findModuleByPath(doc.value, '/AUTOSAR_R22/EcucDefs/Missing');

    // Assert
    expect(mod).toBeNull();
  });
});

describe('lookupContainerDef', () => {
  it('finds a top-level container by short name', () => {
    // Arrange
    const doc = parseBswmd(AUTOSAR_MINIMAL);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const mod = doc.value.modules[0]!;

    // Act
    const c = lookupContainerDef(mod, 'CanGeneral');

    // Assert
    expect(c).not.toBeNull();
    expect(c?.shortName).toBe('CanGeneral');
  });

  it('finds a nested sub-container by short name (recurses)', () => {
    // Arrange
    const doc = parseBswmd(NESTED_SUB_CONTAINERS);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const mod = doc.value.modules[0]!;

    // Act
    const leaf = lookupContainerDef(mod, 'CanControllerConfig');

    // Assert
    expect(leaf).not.toBeNull();
    expect(leaf?.path).toBe('/EcucDefs/Can/CanConfigSet/CanController/CanControllerConfig');
  });

  it('returns null when the container short name is unknown', () => {
    // Arrange
    const doc = parseBswmd(AUTOSAR_MINIMAL);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const mod = doc.value.modules[0]!;

    // Act
    const c = lookupContainerDef(mod, 'DoesNotExist');

    // Assert
    expect(c).toBeNull();
  });
});

describe('lookupParamDef', () => {
  it('finds a parameter by short name within a container', () => {
    // Arrange
    const doc = parseBswmd(MULTI_KIND_PARAMS);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const container = doc.value.modules[0]!.containers[0]!;

    // Act
    const p = lookupParamDef(container, 'ComPduIdType');

    // Assert
    expect(p).not.toBeNull();
    expect(p?.kind).toBe('enumeration');
    expect(p?.enumerationLiterals).toEqual(['FULL', 'EXTENDED']);
  });

  it('returns null when the parameter short name is unknown', () => {
    // Arrange
    const doc = parseBswmd(MULTI_KIND_PARAMS);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const container = doc.value.modules[0]!.containers[0]!;

    // Act
    const p = lookupParamDef(container, 'NotAParam');

    // Assert
    expect(p).toBeNull();
  });
});

describe('lookupReferenceDef', () => {
  it('finds a reference by short name within a container', () => {
    // Arrange
    const doc = parseBswmd(REFERENCES_BOTH);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const container = doc.value.modules[0]!.containers[0]!;

    // Act
    const r = lookupReferenceDef(container, 'PduRSrcPduRef');

    // Assert
    expect(r).not.toBeNull();
    expect(r?.destKind).toBe('ECUC-PARAM-CONF-CONTAINER-DEF');
  });

  it('returns null when the reference short name is unknown', () => {
    // Arrange
    const doc = parseBswmd(REFERENCES_BOTH);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const container = doc.value.modules[0]!.containers[0]!;

    // Act
    const r = lookupReferenceDef(container, 'NoSuchRef');

    // Assert
    expect(r).toBeNull();
  });

  // ---------- Sprint 13+ Q6 (duplicate definition diagnostics) ----------
  // Previously the parser silently kept every definition with a
  // colliding path/shortName; callers couldn't tell the schema had a
  // conflict. The fix routes collisions through `BswmdDocument.warnings`
  // so the BswmdPanel / FileListTab can show a ⚠️ badge per loaded file.
  // All three of these tests pin one warning per duplicate scope
  // (module / container / parameter) and verify the original
  // `parseBswmd` call still returns ok (the conflict is non-fatal).

  it('Q6: warns when two ECUC-MODULE-DEF share the same shortName', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>Vendor</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Can</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
        </ECUC-MODULE-DEF>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Can</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>2</UPPER-MULTIPLICITY>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    const result = parseBswmd(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both modules are still kept (existing behaviour — parser doesn't
    // dedupe), but a warning flags the collision.
    expect(result.value.modules).toHaveLength(2);
    expect(result.value.warnings.some((w) => /duplicate module/i.test(w) && /Can/.test(w))).toBe(
      true,
    );
  });

  it('Q6: warns when two ECUC-PARAM-CONF-CONTAINER-DEF share the same shortName in the same parent', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>Vendor</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Can</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>CanConfigSet</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>CanConfigSet</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    const result = parseBswmd(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const can = result.value.modules[0]!;
    expect(can.containers).toHaveLength(2);
    expect(
      result.value.warnings.some((w) => /duplicate container/i.test(w) && /CanConfigSet/.test(w)),
    ).toBe(true);
  });

  it('Q6: warns when two parameters share the same key in the same container', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>Vendor</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Can</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>CanGeneral</SHORT-NAME>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>BusOffProcessing</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>BusOffProcessing</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    const result = parseBswmd(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.value.modules[0]!.containers[0]!;
    expect(c.parameters).toHaveLength(2);
    expect(
      result.value.warnings.some(
        (w) => /duplicate parameter/i.test(w) && /BusOffProcessing/.test(w),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getContainerDefByPath (Sprint 15 — ECUC mutation support)
// ---------------------------------------------------------------------------

describe('getContainerDefByPath', () => {
  it('resolves a top-level container by single-segment subPath', () => {
    // Arrange
    const doc = parseBswmd(AUTOSAR_MINIMAL);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const mod = doc.value.modules[0]!;

    // Act
    const c = getContainerDefByPath(mod, 'CanGeneral');

    // Assert
    expect(c).not.toBeNull();
    expect(c?.shortName).toBe('CanGeneral');
    expect(c?.path).toBe('/AUTOSAR_R22/EcucDefs/Can/CanGeneral');
  });

  it('resolves a nested sub-container by multi-segment subPath', () => {
    // Arrange
    const doc = parseBswmd(NESTED_SUB_CONTAINERS);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const mod = doc.value.modules[0]!;

    // Act
    const leaf = getContainerDefByPath(mod, 'CanConfigSet/CanController/CanControllerConfig');

    // Assert
    expect(leaf).not.toBeNull();
    expect(leaf?.shortName).toBe('CanControllerConfig');
    expect(leaf?.path).toBe('/EcucDefs/Can/CanConfigSet/CanController/CanControllerConfig');
  });

  it('resolves a choice-branch container under an ECUC-CHOICE-ORIENTED-STRUCTURE-DEF', () => {
    // Arrange
    const doc = parseBswmd(CHOICES);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const mod = doc.value.modules[0]!;

    // Act
    const branch = getContainerDefByPath(mod, 'CanIfBufferCfg/CanIfMailbox');

    // Assert
    expect(branch).not.toBeNull();
    expect(branch?.shortName).toBe('CanIfMailbox');
  });

  it('returns null when a segment in the path does not exist', () => {
    // Arrange
    const doc = parseBswmd(NESTED_SUB_CONTAINERS);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const mod = doc.value.modules[0]!;

    // Act
    const missing = getContainerDefByPath(mod, 'CanConfigSet/DoesNotExist');

    // Assert
    expect(missing).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listContainerChildren (Sprint 15 — ECUC mutation support)
// ---------------------------------------------------------------------------

describe('listContainerChildren', () => {
  it('returns empty arrays for a leaf container with no params/refs/subContainers', () => {
    // Arrange
    const doc = parseBswmd(NESTED_SUB_CONTAINERS);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const mod = doc.value.modules[0]!;
    const leaf = getContainerDefByPath(mod, 'CanConfigSet/CanController/CanControllerConfig')!;
    expect(leaf).not.toBeNull();

    // Act
    const children = listContainerChildren(leaf);

    // Assert
    expect(children.parameters).toEqual([]);
    expect(children.references).toEqual([]);
    expect(children.subContainers).toEqual([]);
  });

  it('returns parameters, references, and sub-containers for a fully-populated container', () => {
    // Arrange — build a container with one of each kind by reading PduR
    // (which carries a reference) under a hypothetical parent.
    // Simpler: stack MULTI_KIND_PARAMS + REFERENCES_BOTH by using
    // NESTED_SUB_CONTAINERS for sub-containers and reading params/refs
    // from a hand-built composite fixture is overkill — assert via two
    // separate lookups instead, on the actual MULTI_KIND_PARAMS container.
    const doc = parseBswmd(MULTI_KIND_PARAMS);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const comGeneral = doc.value.modules[0]!.containers[0]!;

    // Act
    const children = listContainerChildren(comGeneral);

    // Assert
    expect(children.parameters).toHaveLength(3);
    expect(children.parameters.map((p) => p.shortName)).toEqual([
      'ComSupportedIPduGroups',
      'ComConfigurationUseDet',
      'ComPduIdType',
    ]);
    expect(children.references).toEqual([]);
    expect(children.subContainers).toEqual([]);
  });

  it('returns references for a container that defines them', () => {
    // Arrange
    const doc = parseBswmd(REFERENCES_BOTH);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const routingPath = doc.value.modules[0]!.containers[0]!;

    // Act
    const children = listContainerChildren(routingPath);

    // Assert
    expect(children.references).toHaveLength(2);
    expect(children.references.map((r) => r.shortName)).toEqual([
      'PduRSrcPduRef',
      'PduRSrcPduForeignRef',
    ]);
  });

  it('aggregates subContainers and choices into a single subContainers list', () => {
    // Arrange — CHOICES fixture: a choice container with two choice branches
    // and no regular sub-containers. listContainerChildren must surface the
    // choice branches under the unified `subContainers` field.
    const doc = parseBswmd(CHOICES);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const choiceContainer = doc.value.modules[0]!.containers[0]!;

    // Act
    const children = listContainerChildren(choiceContainer);

    // Assert
    expect(children.subContainers.map((c) => c.shortName)).toEqual(['CanIfMailbox', 'CanIfFifo']);
    expect(children.parameters).toEqual([]);
    expect(children.references).toEqual([]);
  });
});

// ─── S3 (P2) — <DESC> extraction ─────────────────────────────────────
// v1.7.1 ships end-to-end <DESC> text flow: BSWMD parser extracts the
// text content of <DESC> elements on containers and parameters into
// ContainerDef.desc / ParamDef.desc, which the skeleton then carries
// into ArxmlContainer.description. Previously the parser did NOT read
// <DESC> at all (zero matches in src/ pre-S3), so the BSWMD-side
// documentation never reached the value-side UI.

describe('parseBswmd — <DESC> extraction (v1.7.1 S3)', () => {
  const BSWMD_WITH_DESC = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-0-3.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>Can</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-DEF>
              <SHORT-NAME>Can</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>CanGeneral</SHORT-NAME>
                  <DESC>General CAN driver configuration.</DESC>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <PARAMETERS>
                    <ECUC-INTEGER-PARAM-DEF>
                      <SHORT-NAME>CanDevErrorDetect</SHORT-NAME>
                      <DESC>Enable development error detection.</DESC>
                      <MIN>0</MIN>
                      <MAX>1</MAX>
                      <DEFAULT-VALUE>1</DEFAULT-VALUE>
                    </ECUC-INTEGER-PARAM-DEF>
                  </PARAMETERS>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CONTAINERS>
            </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  it('extracts <DESC> text into ContainerDef.desc', () => {
    // Arrange + Act
    const r = parseBswmd(BSWMD_WITH_DESC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Assert — the container's <DESC> body is reachable on the parsed
    // ContainerDef.desc field. UI code can surface this as a tooltip
    // next to the container shortName in the tree.
    const c = r.value.modules[0]!.containers[0]!;
    expect(c.shortName).toBe('CanGeneral');
    expect(c.desc).toBe('General CAN driver configuration.');
  });

  it('extracts <DESC> text into ParamDef.desc', () => {
    // Arrange + Act
    const r = parseBswmd(BSWMD_WITH_DESC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Assert — the parameter's <DESC> body is reachable on the parsed
    // ParamDef.desc field. The renderer / ParamEditor uses this as the
    // per-param tooltip / helper text.
    const param = r.value.modules[0]!.containers[0]!.parameters[0]!;
    expect(param.shortName).toBe('CanDevErrorDetect');
    expect(param.desc).toBe('Enable development error detection.');
  });

  it('leaves desc undefined when the container has no <DESC>', () => {
    // Arrange + Act — AUTOSAR_MINIMAL has no <DESC> anywhere.
    const r = parseBswmd(AUTOSAR_MINIMAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Assert — `desc` is `undefined` (not the empty string), so the
    // UI can distinguish "no description declared" from "explicitly
    // empty description" if we ever want to.
    const c = r.value.modules[0]!.containers[0]!;
    expect(c.desc).toBeUndefined();
  });

  it('leaves desc undefined when <DESC></DESC> is present but empty', () => {
    // Arrange — minimal BSWMD with an explicitly empty <DESC>. Empty
    // string and "missing" must collapse to the same value
    // (undefined) so downstream code doesn't have to check both.
    const EMPTY_DESC = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-0-3.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>Can</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-DEF>
              <SHORT-NAME>Can</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>CanGeneral</SHORT-NAME>
                  <DESC></DESC>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CONTAINERS>
            </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
    const r = parseBswmd(EMPTY_DESC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Assert — empty <DESC></DESC> must NOT become an empty string;
    // the field stays undefined so the UI doesn't show an empty
    // tooltip box.
    const c = r.value.modules[0]!.containers[0]!;
    expect(c.desc).toBeUndefined();
  });
});
