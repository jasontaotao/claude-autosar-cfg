// dbcFullImportPreviewHandler — DBC full-import preview IPC tests.
//
// Covers the task-10 brief Step 1 cases: error envelopes, discovery-only
// mode, target-module discovery, deterministic preview hashes, row sorting,
// field-diff source labels, and the provenance conflict rule. The fixture
// pattern mirrors odxImportPreviewHandler.test.ts: a temp project directory
// with a `.autosarcfg.json` manifest, value ARXMLs (built via
// serializeArxml), an inline R22-style Com/CanIf/PduR BSWMD set, and an
// inline DBC source.

// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { serializeArxml } from '../../../core/arxml/serializer.js';
import type { ArxmlContainer, ArxmlModule, ArxmlPackage } from '../../../core/arxml/types.js';
import { hashContainerForProvenance } from '../../../core/import/threeWayMerge.js';
import type { DbcFullImportPreviewRequest } from '../../../shared/types/dbc-import.js';
import { dbcFullImportPreviewHandler } from '../dbcFullImportPreviewHandler.js';
import {
  __resetOpenProjectManifestPathForTests,
  setOpenProjectManifestPath,
} from '../project-manifest-state.js';

// ---------------------------------------------------------------------------
// Inline R22-style BSWMD fixtures (Com / CanIf / PduR).
// ---------------------------------------------------------------------------

const COM_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-DEF>
              <SHORT-NAME>Com</SHORT-NAME>
              <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>ComConfig</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <CONTAINERS>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>ComIPdu</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>65536</UPPER-MULTIPLICITY>
                      <PARAMETERS>
                        <ECUC-ENUMERATION-PARAM-DEF>
                          <SHORT-NAME>ComIPduDirection</SHORT-NAME>
                          <LITERALS>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>SEND</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>RECEIVE</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                          </LITERALS>
                        </ECUC-ENUMERATION-PARAM-DEF>
                        <ECUC-INTEGER-PARAM-DEF>
                          <SHORT-NAME>IPduDLC</SHORT-NAME>
                          <MIN>0</MIN><MAX>8</MAX><DEFAULT-VALUE>8</DEFAULT-VALUE>
                        </ECUC-INTEGER-PARAM-DEF>
                        <ECUC-ENUMERATION-PARAM-DEF>
                          <SHORT-NAME>ComIPduType</SHORT-NAME>
                          <LITERALS>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>NORMAL</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>TP</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                          </LITERALS>
                        </ECUC-ENUMERATION-PARAM-DEF>
                        <ECUC-INTEGER-PARAM-DEF>
                          <SHORT-NAME>ComHandleId</SHORT-NAME>
                          <MIN>0</MIN><MAX>65535</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE>
                        </ECUC-INTEGER-PARAM-DEF>
                      </PARAMETERS>
                      <CONTAINERS>
                        <ECUC-PARAM-CONF-CONTAINER-DEF>
                          <SHORT-NAME>ComSignal</SHORT-NAME>
                          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                          <UPPER-MULTIPLICITY>65536</UPPER-MULTIPLICITY>
                          <PARAMETERS>
                            <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>ComBitPosition</SHORT-NAME><MIN>0</MIN><MAX>65535</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                            <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>ComBitSize</SHORT-NAME><MIN>1</MIN><MAX>64</MAX><DEFAULT-VALUE>1</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                            <ECUC-ENUMERATION-PARAM-DEF>
                              <SHORT-NAME>ComSignalEndianness</SHORT-NAME>
                              <LITERALS>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>LITTLE_ENDIAN</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>BIG_ENDIAN</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                              </LITERALS>
                            </ECUC-ENUMERATION-PARAM-DEF>
                            <ECUC-ENUMERATION-PARAM-DEF>
                              <SHORT-NAME>ComSignalType</SHORT-NAME>
                              <LITERALS>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>BOOLEAN</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>UINT8</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>UINT16</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>UINT32</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>UINT64</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>SINT8</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>SINT16</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>SINT32</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>SINT64</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>FLOAT32</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>FLOAT64</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                              </LITERALS>
                            </ECUC-ENUMERATION-PARAM-DEF>
                            <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>ComSignalDataInvalidValue</SHORT-NAME><MIN>0</MIN><MAX>4294967295</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                            <ECUC-ENUMERATION-PARAM-DEF>
                              <SHORT-NAME>ComTransferProperty</SHORT-NAME>
                              <LITERALS>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>PENDING</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>TRIGGERED</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>TRIGGERED_ON_CHANGE</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                              </LITERALS>
                            </ECUC-ENUMERATION-PARAM-DEF>
                          </PARAMETERS>
                        </ECUC-PARAM-CONF-CONTAINER-DEF>
                        <ECUC-PARAM-CONF-CONTAINER-DEF>
                          <SHORT-NAME>ComTxIPdu</SHORT-NAME>
                          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                          <CONTAINERS>
                            <ECUC-PARAM-CONF-CONTAINER-DEF>
                              <SHORT-NAME>ComTxModeTrue</SHORT-NAME>
                              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                              <CONTAINERS>
                                <ECUC-PARAM-CONF-CONTAINER-DEF>
                                  <SHORT-NAME>ComTxMode</SHORT-NAME>
                                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                                  <PARAMETERS>
                                    <ECUC-ENUMERATION-PARAM-DEF>
                                      <SHORT-NAME>ComTxModeMode</SHORT-NAME>
                                      <LITERALS>
                                        <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>PERIODIC</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                        <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>DIRECT</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                        <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>MIXED</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                                      </LITERALS>
                                    </ECUC-ENUMERATION-PARAM-DEF>
                                    <ECUC-FLOAT-PARAM-DEF><SHORT-NAME>ComTxModeTimePeriod</SHORT-NAME><MIN>0</MIN><MAX>65535</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-FLOAT-PARAM-DEF>
                                  </PARAMETERS>
                                </ECUC-PARAM-CONF-CONTAINER-DEF>
                              </CONTAINERS>
                            </ECUC-PARAM-CONF-CONTAINER-DEF>
                          </CONTAINERS>
                        </ECUC-PARAM-CONF-CONTAINER-DEF>
                      </CONTAINERS>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                  </CONTAINERS>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CONTAINERS>
            </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const CANIF_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-DEF>
              <SHORT-NAME>CanIf</SHORT-NAME>
              <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>CanIfInitCfg</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <CONTAINERS>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>CanIfTxPduCfg</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>65536</UPPER-MULTIPLICITY>
                      <PARAMETERS>
                        <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>CanIfTxPduCanId</SHORT-NAME><MIN>0</MIN><MAX>536870911</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                        <ECUC-ENUMERATION-PARAM-DEF>
                          <SHORT-NAME>CanIfTxPduCanIdType</SHORT-NAME>
                          <LITERALS>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>STANDARD_CAN</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>EXTENDED_CAN</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                          </LITERALS>
                        </ECUC-ENUMERATION-PARAM-DEF>
                        <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>CanIfTxPduDlc</SHORT-NAME><MIN>0</MIN><MAX>8</MAX><DEFAULT-VALUE>8</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                        <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>CanIfTxPduId</SHORT-NAME><MIN>0</MIN><MAX>65535</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                        <ECUC-ENUMERATION-PARAM-DEF>
                          <SHORT-NAME>CanIfTxPduType</SHORT-NAME>
                          <LITERALS>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>STATIC</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>DYNAMIC</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                          </LITERALS>
                        </ECUC-ENUMERATION-PARAM-DEF>
                        <ECUC-STRING-PARAM-DEF><SHORT-NAME>CanIfTxPduUserTxConfirmationUL</SHORT-NAME></ECUC-STRING-PARAM-DEF>
                      </PARAMETERS>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>CanIfRxPduCfg</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>65536</UPPER-MULTIPLICITY>
                      <PARAMETERS>
                        <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>CanIfRxPduCanId</SHORT-NAME><MIN>0</MIN><MAX>536870911</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                        <ECUC-ENUMERATION-PARAM-DEF>
                          <SHORT-NAME>CanIfRxPduCanIdType</SHORT-NAME>
                          <LITERALS>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>STANDARD_CAN</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>EXTENDED_CAN</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                          </LITERALS>
                        </ECUC-ENUMERATION-PARAM-DEF>
                        <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>CanIfRxPduDlc</SHORT-NAME><MIN>0</MIN><MAX>8</MAX><DEFAULT-VALUE>8</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                        <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>CanIfRxPduId</SHORT-NAME><MIN>0</MIN><MAX>65535</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                        <ECUC-ENUMERATION-PARAM-DEF>
                          <SHORT-NAME>CanIfRxPduType</SHORT-NAME>
                          <LITERALS>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>STATIC</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                            <ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>DYNAMIC</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF>
                          </LITERALS>
                        </ECUC-ENUMERATION-PARAM-DEF>
                        <ECUC-STRING-PARAM-DEF><SHORT-NAME>CanIfRxPduUserRxIndicationUL</SHORT-NAME></ECUC-STRING-PARAM-DEF>
                      </PARAMETERS>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                  </CONTAINERS>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CONTAINERS>
            </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const PDUR_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-DEF>
              <SHORT-NAME>PduR</SHORT-NAME>
              <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>PduRRoutingPaths</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <CONTAINERS>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>PduRRoutingPath</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>65536</UPPER-MULTIPLICITY>
                      <CONTAINERS>
                        <ECUC-PARAM-CONF-CONTAINER-DEF>
                          <SHORT-NAME>PduRSrcPdu</SHORT-NAME>
                          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                          <PARAMETERS>
                            <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>PduRSrcPduHandleId</SHORT-NAME><MIN>0</MIN><MAX>65535</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                          </PARAMETERS>
                          <REFERENCES>
                            <ECUC-REFERENCE-DEF>
                              <SHORT-NAME>PduRSrcPduRef</SHORT-NAME>
                              <DESTINATION-REF DEST="ECUC-CONTAINER-VALUE"/>
                            </ECUC-REFERENCE-DEF>
                          </REFERENCES>
                        </ECUC-PARAM-CONF-CONTAINER-DEF>
                        <ECUC-PARAM-CONF-CONTAINER-DEF>
                          <SHORT-NAME>PduRDestPdu</SHORT-NAME>
                          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                          <PARAMETERS>
                            <ECUC-INTEGER-PARAM-DEF><SHORT-NAME>PduRDestPduHandleId</SHORT-NAME><MIN>0</MIN><MAX>65535</MAX><DEFAULT-VALUE>0</DEFAULT-VALUE></ECUC-INTEGER-PARAM-DEF>
                          </PARAMETERS>
                          <REFERENCES>
                            <ECUC-REFERENCE-DEF>
                              <SHORT-NAME>PduRDestPduRef</SHORT-NAME>
                              <DESTINATION-REF DEST="ECUC-CONTAINER-VALUE"/>
                            </ECUC-REFERENCE-DEF>
                          </REFERENCES>
                        </ECUC-PARAM-CONF-CONTAINER-DEF>
                      </CONTAINERS>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                  </CONTAINERS>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CONTAINERS>
            </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

// ---------------------------------------------------------------------------
// Inline DBC fixture.
// ---------------------------------------------------------------------------

const DBC_CONTENT = `VERSION "t10-test-v1"

NS_ :
    NS_DESC_
    CM_
    BA_DEF_
    BA_
    VAL_
    CAT_DEF_
    CAT_
    FILTER
    BA_DEF_DEF_
    EV_DATA_
    ENVVAR_DATA_
    SGTYPE_
    SGTYPE_VAL_
    BA_DEF_SGTYPE_
    BA_SGTYPE_
    SIG_TYPE_REF_
    VAL_TABLE_
    SIG_GROUP_
    SIG_VALTYPE_
    SIGTYPE_VALTYPE_
    BO_TX_BU_
    BA_DEF_REL_
    BA_REL_
    BA_DEF_DEF_REL_
    BU_SG_REL_
    BU_EV_REL_
    BU_BO_REL_
    SG_MUL_VAL_

BS_:

BU_: ECM TCM

BO_ 272 EngState: 8 ECM
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" TCM

BO_ 544 TransState: 8 TCM
 SG_ Gear : 0|4@1+ (1,0) [0|7] "" ECM

BA_DEF_ "GenMsgCycleTime" INT 0 30000;
BA_ "GenMsgCycleTime" BO_ 272 100;
`;

const DBC_NO_MESSAGES = DBC_CONTENT.replace(/^BO_ .*$/gm, '')
  .replace(/^ SG_ .*$/gm, '')
  .replace(/^BA_ .*$/gm, '');

const DBC_INVALID = 'this is not a valid dbc file at all';

// ---------------------------------------------------------------------------
// Temp project helpers (mirror odxImportPreviewHandler.test.ts).
// ---------------------------------------------------------------------------

let tmpDir: string;

function moduleDoc(moduleShortName: string, containers: ArxmlContainer[]): string {
  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: moduleShortName,
    params: {},
    children: containers,
    references: [],
  };
  const pkg: ArxmlPackage = {
    shortName: 'P',
    path: '/P',
    elements: [module],
  };
  const result = serializeArxml({ path: moduleShortName, version: '4.4', packages: [pkg] });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function container(
  shortName: string,
  params: ArxmlContainer['params'] = {},
  children: readonly ArxmlContainer[] = [],
  definitionRef?: string,
): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params,
    children: [...children],
    ...(definitionRef !== undefined ? { definitionRef } : {}),
  };
}

/** 最小 Com module：ComConfig > EngState（含一个 ComHandleId 参数）。 */
function comValueDoc(options: { readonly withEngState?: boolean } = {}): string {
  const pdu = container('EngState', { ComHandleId: { type: 'integer', value: 0 } });
  const comConfig = container('ComConfig', {}, options.withEngState === false ? [] : [pdu]);
  return moduleDoc('Com', [comConfig]);
}

function writeProject(options: {
  readonly bswmds?: readonly string[];
  readonly values?: readonly string[];
}): string {
  const bswmds = options.bswmds ?? [];
  const values = options.values ?? [];
  for (const [index, content] of bswmds.entries()) {
    writeFileSync(join(tmpDir, `Bswmd${index}.arxml`), content, 'utf8');
  }
  for (const [index, content] of values.entries()) {
    writeFileSync(join(tmpDir, `Values${index}.arxml`), content, 'utf8');
  }
  const manifest = {
    schemaVersion: '1',
    id: 'test-project',
    name: 'test',
    valueArxmlPaths: values.map((_, index) => `Values${index}.arxml`),
    bswmdPaths: bswmds.map((_, index) => `Bswmd${index}.arxml`),
    ecucSources: {},
    scripts: [],
  };
  const manifestPath = join(tmpDir, 'project.autosarcfg.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  setOpenProjectManifestPath(manifestPath);
  return manifestPath;
}

function writeDbc(content = DBC_CONTENT): string {
  const path = join(tmpDir, 'input.dbc');
  writeFileSync(path, content, 'utf8');
  return path;
}

function writeProvenanceManifest(manifest: unknown): string {
  const stateDir = join(tmpDir, '.autosarcfg');
  mkdirSync(stateDir, { recursive: true });
  const path = join(stateDir, 'dbc-import-manifest.json');
  writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf8');
  return path;
}

/** 当前请求源的身份 id（与 runtime 的 sourceId 算法一致，spec §9.2）。 */
function sourceIdFor(input: {
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly targetNode: string;
  readonly profileId: string;
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

type MappingRequestOverrides = Partial<Omit<DbcFullImportPreviewRequest, 'dbcPath'>>;

function mappingRequest(
  dbcPath: string,
  overrides: MappingRequestOverrides = {},
): DbcFullImportPreviewRequest {
  return {
    dbcPath,
    targetNode: overrides.targetNode ?? 'ECM',
    dirtyDocPaths: overrides.dirtyDocPaths ?? [],
    profileId: overrides.profileId ?? 'autosar-r22-can',
    // exactOptionalPropertyTypes：可选字段条件展开。
    ...(overrides.pduIdPolicy !== undefined ? { pduIdPolicy: overrides.pduIdPolicy } : {}),
    ...(overrides.upperLayerNaming !== undefined
      ? { upperLayerNaming: overrides.upperLayerNaming }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests — task-10 brief Step 1.
// ---------------------------------------------------------------------------

describe('dbcFullImportPreviewHandler', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dbc-preview-'));
    __resetOpenProjectManifestPathForTests();
  });

  afterEach(() => {
    __resetOpenProjectManifestPathForTests();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Brief item 1: no open project.
  it('returns read-failed when no project is open', async () => {
    const result = await dbcFullImportPreviewHandler({
      dbcPath: writeDbc(),
      dirtyDocPaths: [],
      profileId: 'autosar-r22-can',
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'read-failed', message: 'No project is open' },
    });
  });

  // Brief item 2: missing / malformed / too-large DBC.
  it('returns read-failed when the DBC file is missing', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const result = await dbcFullImportPreviewHandler({
      dbcPath: join(tmpDir, 'missing.dbc'),
      dirtyDocPaths: [],
      profileId: 'autosar-r22-can',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('read-failed');
  });

  it('returns dbc-malformed for invalid DBC text', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const result = await dbcFullImportPreviewHandler({
      dbcPath: writeDbc(DBC_INVALID),
      dirtyDocPaths: [],
      profileId: 'autosar-r22-can',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-malformed');
  });

  it('returns dbc-too-large when the DBC exceeds the 32 MiB cap', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const size = 32 * 1024 * 1024 + 1;
    writeFileSync(dbcPath, Buffer.alloc(size, 0x20), 'latin1');
    const result = await dbcFullImportPreviewHandler({
      dbcPath,
      dirtyDocPaths: [],
      profileId: 'autosar-r22-can',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-too-large');
  });

  // Brief item 3: DBC without messages.
  it('returns dbc-no-messages when the DBC has no messages', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const result = await dbcFullImportPreviewHandler({
      dbcPath: writeDbc(DBC_NO_MESSAGES),
      dirtyDocPaths: [],
      profileId: 'autosar-r22-can',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-no-messages');
  });

  // Brief item 4: discovery-only preview (no targetNode, no BSWMD needed).
  it('returns a discovery-only preview without loading BSWMDs when targetNode is omitted', async () => {
    // 故意不提供任何 BSWMD：discovery 模式不得要求 BSWMD。
    writeProject({ values: [comValueDoc()] });
    const result = await dbcFullImportPreviewHandler({
      dbcPath: writeDbc(),
      dirtyDocPaths: [],
      profileId: 'autosar-r22-can',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toEqual(['ECM', 'TCM']);
    expect(result.value.targetModules.Com).toEqual({
      exists: true,
      docPath: join(tmpDir, 'Values0.arxml'),
      dirty: false,
    });
    expect(result.value.targetModules.CanIf).toEqual({ exists: false, dirty: false });
    expect(result.value.targetModules.PduR).toEqual({ exists: false, dirty: false });
    expect(result.value.rows).toEqual([]);
    // discovery 模式 stats 为空（brief Step 1 item 4："empty stats"）。
    expect(result.value.stats).toEqual({
      messages: 0,
      signals: 0,
      skippedIrrelevantMessages: 0,
      skippedMultiplexedSignals: 0,
    });
    expect(result.value.previewHash).toBe('');
  });

  // Brief item 5: invalid mapping targetNode.
  it('returns dbc-target-node-invalid when targetNode is not a DBC node', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const result = await dbcFullImportPreviewHandler(
      mappingRequest(writeDbc(), { targetNode: 'NOT_A_NODE' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-target-node-invalid');
  });

  // Brief item 6: missing BSWMD.
  it('returns dbc-bswmd-not-loaded when a required module BSWMD is absent', async () => {
    writeProject({ bswmds: [COM_BSWMD] }); // 只有 Com，缺 CanIf / PduR。
    const result = await dbcFullImportPreviewHandler(mappingRequest(writeDbc()));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-bswmd-not-loaded');
  });

  // Brief item 7: same module in multiple value files.
  it('returns dbc-module-ambiguous when the same module occurs in two documents', async () => {
    const doc = comValueDoc();
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [doc, doc],
    });
    const result = await dbcFullImportPreviewHandler(mappingRequest(writeDbc()));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-module-ambiguous');
  });

  // Brief item 8: dirty target from dirtyDocPaths.
  it('returns dbc-target-dirty when a target value document is dirty', async () => {
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [comValueDoc()],
    });
    const result = await dbcFullImportPreviewHandler(
      mappingRequest(writeDbc(), {
        dirtyDocPaths: [join(tmpDir, 'Values0.arxml')],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ kind: 'dbc-target-dirty' });
  });

  // Brief item 9: unknown profile.
  it('returns dbc-profile-not-found for an unknown profile id', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const result = await dbcFullImportPreviewHandler(
      mappingRequest(writeDbc(), { profileId: 'no-such-profile' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-profile-not-found');
  });

  // Brief item 10: preview must not write any file.
  it('previews a fresh project without writing any file', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const snapshot = (): string =>
      [join(tmpDir, 'project.autosarcfg.json'), join(tmpDir, 'Values0.arxml')]
        .filter((p) => existsSync(p))
        .map((p) => readFileSync(p, 'utf8'))
        .join('\n')
        .trim();
    writeFileSync(join(tmpDir, 'Values0.arxml'), comValueDoc({ withEngState: false }), 'utf8');
    const before = snapshot();
    const result = await dbcFullImportPreviewHandler(mappingRequest(dbcPath));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.length).toBeGreaterThan(0);
    expect(result.value.rows.every((row) => row.category === 'added')).toBe(true);
    // 关键断言：preview 之后项目目录没有任何新增/修改文件。
    expect(existsSync(join(tmpDir, '.autosarcfg'))).toBe(false);
    expect(snapshot()).toBe(before);
    expect(existsSync(dbcPath)).toBe(true);
  });

  // Brief item 11: identical calls → identical previewHash.
  it('returns the same previewHash for two identical mapping previews', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const request = mappingRequest(dbcPath);
    const first = await dbcFullImportPreviewHandler(request);
    const second = await dbcFullImportPreviewHandler(request);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.previewHash).toBe(first.value.previewHash);
    expect(second.value.previewHash).toMatch(/^[a-f0-9]{64}$/);
    // 两次完整结果应完全一致（确定性）。
    expect(second.value).toEqual(first.value);
  });

  // Brief item 12: policy override changes previewHash.
  it('changes previewHash when a policy override differs', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const base = await dbcFullImportPreviewHandler(mappingRequest(dbcPath));
    const overridden = await dbcFullImportPreviewHandler(
      mappingRequest(dbcPath, { pduIdPolicy: { txBase: 0x0200 } }),
    );
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    expect(overridden.ok).toBe(true);
    if (!overridden.ok) return;
    expect(base.value.previewHash).not.toBe(overridden.value.previewHash);
    // override 本身确定：相同 override 两次调用 hash 一致。
    const again = await dbcFullImportPreviewHandler(
      mappingRequest(dbcPath, { pduIdPolicy: { txBase: 0x0200 } }),
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.previewHash).toBe(overridden.value.previewHash);
  });

  // Brief item 13: rows sorted by module then path (code-unit order).
  it('sorts preview rows by module then path', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const result = await dbcFullImportPreviewHandler(mappingRequest(writeDbc()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.length).toBeGreaterThan(0);
    for (let i = 1; i < result.value.rows.length; i += 1) {
      const prev = result.value.rows[i - 1]!;
      const curr = result.value.rows[i]!;
      if (prev.module !== curr.module) {
        expect(prev.module < curr.module).toBe(true);
      } else {
        expect(prev.path < curr.path).toBe(true);
      }
    }
  });

  // Brief item 14: field diffs carry source labels and warning codes.
  it('attaches field diffs with source labels and closed-set warning codes', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const result = await dbcFullImportPreviewHandler(mappingRequest(writeDbc()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sources = [
      ...new Set(result.value.rows.flatMap((row) => row.fieldDiffs.map((d) => d.source))),
    ];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(['Auto', 'Derived', 'Profile-default', 'Unmapped', 'Error']).toContain(source);
    }
    const rowWithDiffs = result.value.rows.find((row) => row.fieldDiffs.length > 0);
    expect(rowWithDiffs).toBeDefined();
    for (const warning of result.value.warnings) {
      expect(warning.code).toMatch(/^dbc-/);
      expect(typeof warning.elementRef).toBe('string');
      expect(typeof warning.message).toBe('string');
    }
  });

  // Provenance conflict rule（spec §9.2）：非本 source 拥有的容器 → conflict。
  it('classifies containers owned by another DBC source as conflict', async () => {
    // 当前值文件已有 /Com/ComConfig/EngState 容器（含一个手工参数，与
    // mapper 生成内容不同的 hash，同时 foreign source 的 entry hash 对齐
    // 当前内容 → 若无 owner 规则会被归类为 updated）。
    const pdu = container('EngState', {
      ComHandleId: { type: 'integer', value: 0 },
      ManualParam: { type: 'integer', value: 7 },
    });
    const module: ArxmlModule = {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Com',
      params: {},
      children: [container('ComConfig', {}, [pdu])],
      references: [],
    };
    const pkg: ArxmlPackage = { shortName: 'P', path: '/P', elements: [module] };
    const serialized = serializeArxml({ path: 'Com', version: '4.4', packages: [pkg] });
    if (!serialized.ok) throw new Error(serialized.error.message);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [serialized.value],
    });
    const currentHash = hashContainerForProvenance(pdu);
    writeProvenanceManifest({
      version: 1,
      sources: [
        {
          sourceId: 'foreign-source',
          sourceFile: 'other.dbc',
          sourceHash: 'sha256:other',
          targetNode: 'TCM',
          profileId: 'autosar-r22-can',
          importedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              module: 'Com',
              containerPath: '/Com/ComConfig/EngState',
              contentHash: currentHash,
            },
          ],
        },
      ],
    });
    const result = await dbcFullImportPreviewHandler(mappingRequest(writeDbc()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.value.rows.find(
      (r) => r.path === '/Com/ComConfig/EngState' && r.module === 'Com',
    );
    expect(row).toBeDefined();
    expect(row?.category).toBe('conflict');
    expect(row?.defaultDecision).toBe('keep-local');
  });

  // Malformed / wrong-version provenance manifest → warning + 按空处理。
  it('ignores invalid provenance manifests as no-history', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    writeProvenanceManifest('not-json');
    const result = await dbcFullImportPreviewHandler(mappingRequest(writeDbc()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings.some((w) => w.code === 'dbc-manifest-ignored')).toBe(true);
  });

  // 同 source（owner）的条目按正常 base 处理：base===current（值文件未动）、
  // incoming 内容不同 → updated（不会误报 foreign-owner conflict）。
  it('treats current-owner provenance as a normal base', async () => {
    const pdu = container('EngState', { ComHandleId: { type: 'integer', value: 0 } });
    const doc = moduleDoc('Com', [container('ComConfig', {}, [pdu])]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [doc],
    });
    const currentHash = hashContainerForProvenance(pdu);
    // DBM 的 sourceHash 带 `sha256:` 前缀（dbmBuilder），sourceId 必须与
    // handler 计算的一致才被识别为 owner。
    const sourceHash = `sha256:${createHash('sha256').update(DBC_CONTENT).digest('hex')}`;
    writeProvenanceManifest({
      version: 1,
      sources: [
        {
          sourceId: sourceIdFor({
            sourceFile: 'input.dbc',
            sourceHash,
            targetNode: 'ECM',
            profileId: 'autosar-r22-can',
          }),
          sourceFile: 'input.dbc',
          sourceHash,
          targetNode: 'ECM',
          profileId: 'autosar-r22-can',
          importedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              module: 'Com',
              containerPath: '/Com/ComConfig/EngState',
              contentHash: currentHash,
            },
          ],
        },
      ],
    });
    const result = await dbcFullImportPreviewHandler(mappingRequest(writeDbc()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.value.rows.find(
      (r) => r.path === '/Com/ComConfig/EngState' && r.module === 'Com',
    );
    expect(row?.category).toBe('updated');
    expect(row?.defaultDecision).toBe('import');
  });
});
