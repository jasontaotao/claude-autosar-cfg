// dbcFullImportCommitHandler — DBC full-import commit IPC tests.
//
// Covers the task-11 brief Step 1 cases: mismatch defense, unknown
// decision paths, decision semantics (added/keep-local/conflict/delete),
// existing-module overwrite + current-only preservation, missing-module
// creation + manifest registration + path-escape rejection, provenance
// source grouping, and the atomic-write rollback contract. The fixture
// pattern mirrors dbcFullImportPreviewHandler.test.ts (temp project
// directory + inline BSWMD set + inline DBC) and the ODX commit handler
// tests for error-envelope shape.

// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseArxml } from '../../../core/arxml/parser.js';
import { serializeArxml } from '../../../core/arxml/serializer.js';
import type { ArxmlContainer, ArxmlModule, ArxmlPackage } from '../../../core/arxml/types.js';
import {
  collectImportContainers,
  hashContainerForProvenance,
} from '../../../core/import/threeWayMerge.js';
import { isPathInsideReal } from '../../../shared/paths/isPathInsideReal.js';
import type {
  DbcFullImportCommitRequest,
  DbcImportDecision,
  DbcImportRow,
} from '../../../shared/types/dbc-import.js';
import { dbcFullImportCommitHandler } from '../dbcFullImportCommitHandler.js';
import { dbcFullImportPreviewHandler } from '../dbcFullImportPreviewHandler.js';
import { computeDbcFullImportMappedModules, dbcManifestSourceId } from '../dbcFullImportRuntime.js';
import {
  __resetOpenProjectManifestPathForTests,
  setOpenProjectManifestPath,
} from '../project-manifest-state.js';

// Task 11 的实现尚不存在：import 失败会让全部用例 RED（TDD 第一步）。

// 路径逃逸校验注入点：默认放行，测试 4 单独改为拒绝。handler 只在
// missing-module 路径上调用 isPathInsideReal，其它测试不受影响。
vi.mock('../../../shared/paths/isPathInsideReal.js', () => ({
  isPathInsideReal: vi.fn(async () => true),
}));

// writeAtomic 失败注入：failOnce 中列出的路径在首次写入时抛错（随后从集合
// 中移除），使 rollback 阶段对同一路径的恢复写入可以成功。回滚测试 9/10/11
// 依赖此机制；其它测试 failOnce 为空，行为与真实 writeAtomic 一致。
const writeAtomicState = vi.hoisted(() => ({
  failOnce: new Set<string>(),
}));

vi.mock('../../io/writeAtomic.js', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    writeAtomic: (file: string, content: string) => Promise<void>;
  };
  return {
    ...actual,
    writeAtomic: vi.fn(async (path: string, content: string) => {
      if (writeAtomicState.failOnce.has(path)) {
        writeAtomicState.failOnce.delete(path);
        throw new Error(`injected writeAtomic failure: ${path}`);
      }
      return actual.writeAtomic(path, content);
    }),
  };
});

// ---------------------------------------------------------------------------
// Inline R22-style BSWMD fixtures (Com / CanIf / PduR) — identical to the
// preview tests so the mapping pipeline is deterministic.
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

// ---------------------------------------------------------------------------
// Temp project helpers (mirror dbcFullImportPreviewHandler.test.ts).
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
    id: 'commit-project',
    name: 'commit',
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
  writeFileSync(
    join(stateDir, 'dbc-import-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  return join(stateDir, 'dbc-import-manifest.json');
}

function provenancePath(): string {
  return join(tmpDir, '.autosarcfg', 'dbc-import-manifest.json');
}

/** 与 preview 一致的标准请求（targetNode=ECM, profile=autosar-r22-can）。 */
function previewRequest(dbcPath: string) {
  return {
    dbcPath,
    targetNode: 'ECM',
    dirtyDocPaths: [] as readonly string[],
    profileId: 'autosar-r22-can',
  };
}

function commitRequest(
  dbcPath: string,
  previewHash: string,
  decisions: readonly {
    module: 'Com' | 'CanIf' | 'PduR';
    path: string;
    decision: DbcImportDecision;
  }[],
): DbcFullImportCommitRequest {
  return {
    dbcPath,
    targetNode: 'ECM',
    dirtyDocPaths: [],
    profileId: 'autosar-r22-can',
    previewHash,
    decisions,
  };
}

async function runPreview(dbcPath: string) {
  const result = await dbcFullImportPreviewHandler(previewRequest(dbcPath));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('preview failed');
  return result.value;
}

/** 当前请求源的 sourceId（与 commit handler 的 dbcManifestSourceId 同参）。 */
function currentSourceId(): string {
  return dbcManifestSourceId({
    sourceFile: 'input.dbc',
    sourceHash: `sha256:${createHash('sha256').update(DBC_CONTENT).digest('hex')}`,
    targetNode: 'ECM',
    profileId: 'autosar-r22-can',
  });
}

function allImportDecisions(rows: readonly DbcImportRow[]) {
  return rows.map((row) => ({
    module: row.module,
    path: row.path,
    decision: 'import' as const,
  }));
}

/** 读取 provenance 文件并解析（测试专用，不做容错）。 */
function readProvenance(): {
  version: number;
  sources: Array<
    Record<string, unknown> & { sourceId: string; entries: Array<Record<string, unknown>> }
  >;
} {
  return JSON.parse(readFileSync(provenancePath(), 'utf8'));
}

// ---------------------------------------------------------------------------
// Tests — task-11 brief Step 1.
// ---------------------------------------------------------------------------

describe('dbcFullImportCommitHandler', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dbc-commit-'));
    __resetOpenProjectManifestPathForTests();
    vi.mocked(isPathInsideReal).mockResolvedValue(true);
    writeAtomicState.failOnce.clear();
  });

  afterEach(() => {
    __resetOpenProjectManifestPathForTests();
    vi.mocked(isPathInsideReal).mockReset();
    writeAtomicState.failOnce.clear();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Brief item 1: preview hash mismatch → dbc-commit-mismatch, no writes.
  it('returns dbc-commit-mismatch when the preview hash differs', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const result = await dbcFullImportCommitHandler(commitRequest(dbcPath, '0'.repeat(64), []));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-commit-mismatch');
    expect(existsSync(join(tmpDir, 'ecuc'))).toBe(false);
    expect(existsSync(join(tmpDir, '.autosarcfg'))).toBe(false);
  });

  // Brief item 2: unknown decision path → dbc-commit-mismatch.
  it('returns dbc-commit-mismatch for an unknown decision path', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const decisions = [
      {
        module: 'Com' as const,
        path: '/Com/ComConfig/NoSuchContainer',
        decision: 'import' as const,
      },
    ];
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, decisions),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('dbc-commit-mismatch');
  });

  // Brief item 3: existing module → overwrite-module preserves current-only
  // containers while importing the mapped ones.
  it('imports into an existing module while preserving current-only containers', async () => {
    const manualCom = moduleDoc('Com', [
      container('ComConfig', {}, [container('ManualContainer', {})]),
    ]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [manualCom],
    });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, allImportDecisions(preview.rows)),
    );
    expect(result.ok).toBe(true);
    const content = readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8');
    expect(content).toContain('ManualContainer');
    expect(content).toContain('EngState');
  });

  // Brief item 4: missing module → creates `<Module>_EcucValues.arxml`,
  // registers a relative POSIX path in valueArxmlPaths, and rejects
  // resolved targets outside the project.
  it('creates missing-module ECUC files and registers POSIX paths in the manifest', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, allImportDecisions(preview.rows)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(existsSync(join(tmpDir, 'ecuc', 'Com_EcucValues.arxml'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(tmpDir, 'project.autosarcfg.json'), 'utf8'));
    expect(manifest.valueArxmlPaths).toContain('ecuc/Com_EcucValues.arxml');
  });

  it('rejects a resolved target path that escapes the project directory', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    vi.mocked(isPathInsideReal).mockResolvedValue(false);
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, allImportDecisions(preview.rows)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('write-failed');
    }
    expect(existsSync(join(tmpDir, 'ecuc'))).toBe(false);
  });

  // Brief item 5: added defaults to import, explicit delete removes the
  // container, locally-modified defaults to keep-local.
  it('applies added as import and explicit delete as removal', async () => {
    // 现有 Com 模块（含一个空的 EngState 占位）：EngState 无 base、无 current 差异
    // → 分类 added → 默认 import；但对它显式 delete → 容器被移除。
    const existing = moduleDoc('Com', [container('ComConfig', {}, [container('EngState', {})])]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [existing],
    });
    const dbcPath = writeDbc();
    const preview1 = await runPreview(dbcPath);
    const engStateRow = preview1.rows.find((row) => row.path === '/Com/ComConfig/EngState');
    expect(engStateRow).toBeDefined();
    expect(engStateRow?.category).toBe('added'); // 无 base、无 current 差异 → added → 默认 import
    const decisions = preview1.rows.map((row) => ({
      module: row.module,
      path: row.path,
      decision: row.path === '/Com/ComConfig/EngState' ? ('delete' as const) : ('import' as const),
    }));
    const result1 = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview1.previewHash, decisions),
    );
    expect(result1.ok).toBe(true);
    const afterDelete = readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8');
    expect(afterDelete).not.toContain('EngState');
    // 其余 added 容器被导入（默认 import）。
    expect(afterDelete).toContain('ComConfig');
  });

  it('keeps locally-modified rows as keep-local by default', async () => {
    // 构造 base == incoming：先写出 current 值文件（EngState 带 ComHandleId），
    // 再用 computeDbcFullImportMappedModules 拿到同一项目状态下的 incoming
    // EngState 容器 hash 作为 provenance base。
    const dbcPath = writeDbc();
    const currentEng = container('EngState', { ComHandleId: { type: 'integer', value: 0 } });
    const currentDoc = moduleDoc('Com', [container('ComConfig', {}, [currentEng])]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [currentDoc],
    });
    const mappedModules = await computeDbcFullImportMappedModules(previewRequest(dbcPath));
    const incomingCom = mappedModules.get('Com');
    expect(incomingCom).toBeDefined();
    const incomingEng = collectImportContainers(incomingCom!).get('/Com/ComConfig/EngState');
    expect(incomingEng).toBeDefined();
    const baseHash = hashContainerForProvenance(incomingEng!);
    // 本地改动：在保留 ComHandleId 的前提下加一个本地参数（currentIds 不变 →
    // incoming 与 base 一致 → locally-modified）。
    writeProvenanceManifest({
      version: 1,
      sources: [
        {
          sourceId: currentSourceId(),
          sourceFile: 'input.dbc',
          sourceHash: `sha256:${createHash('sha256').update(DBC_CONTENT).digest('hex')}`,
          targetNode: 'ECM',
          profileId: 'autosar-r22-can',
          importedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            { module: 'Com', containerPath: '/Com/ComConfig/EngState', contentHash: baseHash },
          ],
        },
      ],
    });
    const modifiedEng = container('EngState', {
      ComHandleId: { type: 'integer', value: 0 },
      LocalParam: { type: 'integer', value: 9 },
    });
    writeFileSync(
      join(tmpDir, 'Values0.arxml'),
      moduleDoc('Com', [container('ComConfig', {}, [modifiedEng])]),
      'utf8',
    );
    const preview = await runPreview(dbcPath);
    const locallyRow = preview.rows.find((row) => row.path === '/Com/ComConfig/EngState');
    expect(locallyRow?.category).toBe('locally-modified');
    expect(locallyRow?.defaultDecision).toBe('keep-local');
    // 空 decisions → 全部用默认（keep-local）→ 本地参数保留。
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, []),
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8')).toContain('LocalParam');
  });

  // Brief item 6: success writes .autosarcfg/dbc-import-manifest.json.
  it('writes the DBC provenance manifest on success', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, allImportDecisions(preview.rows)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(existsSync(provenancePath())).toBe(true);
    const manifest = readProvenance();
    expect(manifest.version).toBe(1);
    expect(manifest.sources.length).toBe(1);
    expect(manifest.sources[0]!.sourceId).toBe(currentSourceId());
    expect(manifest.sources[0]!.sourceFile).toBe('input.dbc');
    expect(manifest.sources[0]!.entries.length).toBeGreaterThan(0);
  });

  // Brief item 7: same sourceId replaces all of its entries; other sources untouched.
  it('replaces the current source entries and leaves other sources intact', async () => {
    // 值文件：EngState（当前源拥有，base=current → updated → import）。
    const engState = container('EngState', { ComHandleId: { type: 'integer', value: 0 } });
    const currentHash = hashContainerForProvenance(engState);
    const doc = moduleDoc('Com', [container('ComConfig', {}, [engState])]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [doc],
    });
    const dbcPath = writeDbc();
    const foreignSourceId = 'foreign-source-7';
    writeProvenanceManifest({
      version: 1,
      sources: [
        {
          sourceId: foreignSourceId,
          sourceFile: 'other.dbc',
          sourceHash: 'sha256:other',
          targetNode: 'TCM',
          profileId: 'autosar-r22-can',
          importedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              module: 'Com',
              containerPath: '/Com/ComConfig/ForeignContainer',
              contentHash: 'f00d',
            },
          ],
        },
        {
          sourceId: currentSourceId(),
          sourceFile: 'input.dbc',
          sourceHash: `sha256:${createHash('sha256').update(DBC_CONTENT).digest('hex')}`,
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
    const preview = await runPreview(dbcPath);
    const engRow = preview.rows.find((row) => row.path === '/Com/ComConfig/EngState');
    expect(engRow?.category).toBe('updated'); // base==current、incoming 不同 → 默认 import
    // 只 import EngState，其余行 keep-local：当前源 entries 覆盖所有 merge 后
    // 存活且归当前源的容器（EngState + keep-local 存活容器）。
    const decisions = preview.rows.map((row) => ({
      module: row.module,
      path: row.path,
      decision:
        row.path === '/Com/ComConfig/EngState' ? ('import' as const) : ('keep-local' as const),
    }));
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, decisions),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const manifest = readProvenance();
    expect(manifest.sources.length).toBe(2);
    const foreign = manifest.sources.find((s) => s.sourceId === foreignSourceId);
    expect(foreign).toBeDefined();
    expect(foreign!.entries).toEqual([
      { module: 'Com', containerPath: '/Com/ComConfig/ForeignContainer', contentHash: 'f00d' },
    ]);
    const current = manifest.sources.find((s) => s.sourceId === currentSourceId());
    expect(current).toBeDefined();
    // 新语义（ODX parity）：entry 按「merge 后存活的容器」记录，与 decision
    // 无关 —— EngState（import）与 keep-local 存活容器都要有 baseline。
    expect(current!.entries.some((e) => e.containerPath === '/Com/ComConfig/EngState')).toBe(true);
    // 当前源 entry 的 contentHash 已更新为 post-merge 容器 hash（与旧 base 不同）。
    const engEntry = current!.entries.find((e) => e.containerPath === '/Com/ComConfig/EngState');
    expect(engEntry).not.toMatchObject({ contentHash: currentHash });
    // 完整同构校验：entries 集合 == 所有已提交文档 merge 后存活、且出现在
    // preview rows 中的容器路径集合（Com 在 Values0；CanIf/PduR 为新建 ecuc）。
    const surviving = new Set<string>();
    for (const docPath of [
      join(tmpDir, 'Values0.arxml'),
      join(tmpDir, 'ecuc', 'CanIf_EcucValues.arxml'),
      join(tmpDir, 'ecuc', 'PduR_EcucValues.arxml'),
    ]) {
      const parsed = parseArxml(readFileSync(docPath, 'utf8'));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      for (const element of parsed.value.packages[0]!.elements) {
        if (element.kind !== 'module') continue;
        for (const containerPath of collectImportContainers(element).keys()) {
          surviving.add(containerPath);
        }
      }
    }
    const expectedPaths = preview.rows
      .filter((row) => surviving.has(row.path))
      .map((row) => row.path)
      .sort();
    expect(current!.entries.map((e) => e.containerPath).sort()).toEqual(expectedPaths);
  });

  // Brief item 8: a container owned by another DBC source is treated as conflict.
  it('keeps a container owned by another DBC source as keep-local conflict', async () => {
    // 当前值文件：Com/ComConfig/EngState（带一个手工参数，hash 与 incoming 不同）。
    const pdu = container('EngState', {
      ComHandleId: { type: 'integer', value: 0 },
      ManualParam: { type: 'integer', value: 7 },
    });
    const doc = moduleDoc('Com', [container('ComConfig', {}, [pdu])]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [doc],
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
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const row = preview.rows.find(
      (r) => r.path === '/Com/ComConfig/EngState' && r.module === 'Com',
    );
    expect(row?.category).toBe('conflict');
    expect(row?.defaultDecision).toBe('keep-local');
    // 空 decisions → 全部用默认（keep-local）→ 本地 ManualParam 保留。
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, []),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const content = readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8');
    expect(content).toContain('ManualParam');
    // 当前源不认领该容器（§9.2：owner 是其他 source 的容器不得被当前源认领）。
    const manifest = readProvenance();
    const current = manifest.sources.find((s) => s.sourceId === currentSourceId());
    expect(current?.entries.some((e) => e.containerPath === '/Com/ComConfig/EngState')).toBe(false);
    // 正向对照：同一 commit 中 owner 缺失/归当前源的存活容器仍被当前源记录。
    expect(current?.entries.some((e) => e.containerPath === '/Com/ComConfig')).toBe(true);
  });

  // 回归：keep-local 容器也必须留下 provenance baseline（ODX parity —— entry
  // 按「merge 后存活」记录，与 decision 无关），否则下一轮 classifyImportRows
  // 因 baseHash === undefined 把它当 added（默认 import），用户的 keep-local
  // 决定与后续手工修改会被点击默认值静默覆盖。
  it('records a provenance baseline for keep-local containers so the next import classifies them as locally-modified', async () => {
    const dbcPath0 = writeDbc();
    const currentEng = container('EngState', {
      ComHandleId: { type: 'integer', value: 0 },
      LocalParam: { type: 'integer', value: 9 },
    });
    const currentDoc = moduleDoc('Com', [container('ComConfig', {}, [currentEng])]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [currentDoc],
    });
    const dbcPath = dbcPath0;
    // base == incoming：先在当前项目状态下取 incoming EngState hash 作为 base。
    const mappedModules = await computeDbcFullImportMappedModules(previewRequest(dbcPath));
    const incomingCom = mappedModules.get('Com');
    expect(incomingCom).toBeDefined();
    const incomingEng = collectImportContainers(incomingCom!).get('/Com/ComConfig/EngState');
    expect(incomingEng).toBeDefined();
    const baseHash = hashContainerForProvenance(incomingEng!);
    const currentHash = hashContainerForProvenance(currentEng);
    // GhostContainer 只存在于 base（本地与 incoming 均无）→ removed-in-dbc。
    writeProvenanceManifest({
      version: 1,
      sources: [
        {
          sourceId: currentSourceId(),
          sourceFile: 'input.dbc',
          sourceHash: `sha256:${createHash('sha256').update(DBC_CONTENT).digest('hex')}`,
          targetNode: 'ECM',
          profileId: 'autosar-r22-can',
          importedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            { module: 'Com', containerPath: '/Com/ComConfig/EngState', contentHash: baseHash },
            {
              module: 'Com',
              containerPath: '/Com/ComConfig/GhostContainer',
              contentHash: 'dead',
            },
          ],
        },
      ],
    });
    const preview = await runPreview(dbcPath);
    const row = preview.rows.find((r) => r.path === '/Com/ComConfig/EngState');
    expect(row?.category).toBe('locally-modified');
    expect(row?.defaultDecision).toBe('keep-local');
    // 空 decisions → 全部用默认（keep-local）。
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, []),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const manifest = readProvenance();
    const current = manifest.sources.find((s) => s.sourceId === currentSourceId());
    expect(current).toBeDefined();
    // keep-local 容器获得 baseline（post-merge 内容 == 本地内容）。
    expect(
      current!.entries.some(
        (e) =>
          e.containerPath === '/Com/ComConfig/EngState' &&
          e.module === 'Com' &&
          e.contentHash === currentHash,
      ),
    ).toBe(true);
    // removed-in-dbc（merge 后容器不存在）不得获得 entry。
    expect(current!.entries.some((e) => e.containerPath === '/Com/ComConfig/GhostContainer')).toBe(
      false,
    );
    // 下一轮：baseline 存在 → 不再是 added（那是丢 baseline 的 bug 行为，
    // 会以默认 import 静默覆盖）。同一 DBC 再导入且本地未再改动 → base==current
    // → updated；本地在 keep-local 之后又手工改动 → conflict + 默认 keep-local
    // （用户的决定与手工修改被记住，不会被点击默认值覆盖）。
    const nextPreview = await runPreview(dbcPath);
    const nextRow = nextPreview.rows.find((r) => r.path === '/Com/ComConfig/EngState');
    expect(nextRow?.category).not.toBe('added');
    expect(nextRow?.category).toBe('updated');
    // keep-local 之后的进一步手工修改 → conflict，默认 keep-local（受保护）。
    const editedEng = container('EngState', {
      ComHandleId: { type: 'integer', value: 0 },
      LocalParam: { type: 'integer', value: 9 },
      AnotherParam: { type: 'integer', value: 5 },
    });
    writeFileSync(
      join(tmpDir, 'Values0.arxml'),
      moduleDoc('Com', [container('ComConfig', {}, [editedEng])]),
      'utf8',
    );
    const thirdPreview = await runPreview(dbcPath);
    const thirdRow = thirdPreview.rows.find((r) => r.path === '/Com/ComConfig/EngState');
    expect(thirdRow?.category).toBe('conflict');
    expect(thirdRow?.defaultDecision).toBe('keep-local');
  });

  // Brief item 9: ECUC write failure rolls back already-written ECUC files and
  // does not update project manifest/provenance.
  it('rolls back earlier ECUC writes when a later ECUC write fails', async () => {
    const comDoc = moduleDoc('Com', [container('ComConfig', {}, [container('ManualCom', {})])]);
    const canIfDoc = moduleDoc('CanIf', [
      container('CanIfInitCfg', {}, [container('ManualCanIf', {})]),
    ]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [comDoc, canIfDoc],
    });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const originalCom = readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8');
    const originalCanIf = readFileSync(join(tmpDir, 'Values1.arxml'), 'utf8');
    const originalManifest = readFileSync(join(tmpDir, 'project.autosarcfg.json'), 'utf8');
    // 注入：CanIf 所在的 Values1.arxml 写入失败（Com 先写成功，必须回滚）。
    writeAtomicState.failOnce.add(join(tmpDir, 'Values1.arxml'));
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, allImportDecisions(preview.rows)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('write-failed');
      if (result.error.kind === 'write-failed') {
        expect(result.error.rolledBack).toBe(true);
      }
    }
    // 已写入的 Com 被回滚，原文件内容不变。
    expect(readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8')).toBe(originalCom);
    expect(readFileSync(join(tmpDir, 'Values1.arxml'), 'utf8')).toBe(originalCanIf);
    // project manifest 未更新（无 ecuc/ 路径），provenance 未写入。
    expect(readFileSync(join(tmpDir, 'project.autosarcfg.json'), 'utf8')).toBe(originalManifest);
    expect(existsSync(provenancePath())).toBe(false);
  });

  // Brief item 10: provenance write failure rolls back ECUC and project manifest writes.
  it('rolls back ECUC files and the project manifest when the provenance write fails', async () => {
    // 空项目：三个模块均为新增 → ECUC 新文件 + manifest 更新 + provenance 写入。
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const originalManifest = readFileSync(join(tmpDir, 'project.autosarcfg.json'), 'utf8');
    writeAtomicState.failOnce.add(provenancePath());
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, allImportDecisions(preview.rows)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('write-failed');
      if (result.error.kind === 'write-failed') {
        expect(result.error.rolledBack).toBe(true);
      }
    }
    // ECUC 新文件被删除、manifest 恢复、provenance 不存在。
    expect(existsSync(join(tmpDir, 'ecuc', 'Com_EcucValues.arxml'))).toBe(false);
    expect(existsSync(join(tmpDir, 'ecuc', 'CanIf_EcucValues.arxml'))).toBe(false);
    expect(existsSync(join(tmpDir, 'ecuc', 'PduR_EcucValues.arxml'))).toBe(false);
    expect(readFileSync(join(tmpDir, 'project.autosarcfg.json'), 'utf8')).toBe(originalManifest);
    expect(existsSync(provenancePath())).toBe(false);
  });

  // Brief item 11: new-module manifest write failure rolls back ECUC files and
  // leaves original files intact.
  it('rolls back new ECUC files when the project manifest write fails', async () => {
    // 已有 Com 值文件（原文件）→ 更新 manifest 失败时应保持原文件不动。
    const comDoc = moduleDoc('Com', [container('ComConfig', {}, [container('ManualCom', {})])]);
    writeProject({
      bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD],
      values: [comDoc],
    });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const originalCom = readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8');
    const originalManifest = readFileSync(join(tmpDir, 'project.autosarcfg.json'), 'utf8');
    writeAtomicState.failOnce.add(join(tmpDir, 'project.autosarcfg.json'));
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, allImportDecisions(preview.rows)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('write-failed');
      if (result.error.kind === 'write-failed') {
        expect(result.error.rolledBack).toBe(true);
      }
    }
    // 新增 ECUC 文件被回滚，原有值文件与 manifest 保持不变。
    expect(readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8')).toBe(originalCom);
    expect(readFileSync(join(tmpDir, 'project.autosarcfg.json'), 'utf8')).toBe(originalManifest);
    expect(existsSync(join(tmpDir, 'ecuc', 'CanIf_EcucValues.arxml'))).toBe(false);
    expect(existsSync(join(tmpDir, 'ecuc', 'PduR_EcucValues.arxml'))).toBe(false);
    expect(existsSync(provenancePath())).toBe(false);
  });

  // Brief item 12: success response returns applied/kept/deleted counts and
  // the provenance manifest path.
  it('returns applied/kept/deleted counts and the manifest path on success', async () => {
    writeProject({ bswmds: [COM_BSWMD, CANIF_BSWMD, PDUR_BSWMD] });
    const dbcPath = writeDbc();
    const preview = await runPreview(dbcPath);
    const decisions = preview.rows.slice(0, 3).map((row, index) => ({
      module: row.module,
      path: row.path,
      decision: (index === 0
        ? 'import'
        : index === 1
          ? 'keep-local'
          : 'delete') as DbcImportDecision,
    }));
    const result = await dbcFullImportCommitHandler(
      commitRequest(dbcPath, preview.previewHash, decisions),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      applied: 1,
      kept: 1,
      deleted: 1,
      manifestPath: provenancePath(),
    });
    expect(existsSync(provenancePath())).toBe(true);
  });
});
