// Sprint 14 #1 T10 — sample validator script (kind: 'validator').
//
// Scans every ComIPdu in the open project and verifies that
// `ComTxIPduUnusedAreasDefault` (the real-world PduId-equivalent
// integer param exposed by the parser; see Phase A report §3
// adaptation #3) is unique. When a duplicate is found, the script
// emits a `script:` violation so the renderer can surface it inside
// the Validation panel under the dedicated "Script validations" group.
//
// This fixture is the example referenced by spec §3.4 + Phase D T17
// E2E test. It uses the ctx API per spec §4 (findContainers, getParam,
// validator.addViolation, log.info) and the shared path helper via
// the ctx._import('utils/path.js') resolver (Phase A T2).

import { basename } from './utils/path.js';

const seen = new Map();
const ipdus = ctx.project.findContainers({ def: '/Com/ComConfig/ComIPdu' });

for (const ipdu of ipdus) {
  // PduId-equivalent integer — Phase A adaptation pointed us at
  // ComTxIPduUnusedAreasDefault because the parser exposes this as
  // an integer param on ComIPdu, while ComPduId only appears as a
  // ComPduIdRef reference.
  const idParam = ipdu.getParam('ComTxIPduUnusedAreasDefault');
  if (idParam === null) continue;
  const id = idParam.asInteger();
  if (seen.has(id)) {
    ctx.validator.addViolation({
      kind: 'script:pduid-duplicate',
      severity: 'error',
      containerPath: ipdu.path,
      message: `PduId ${id} 已被 ${basename(seen.get(id))} 占用`,
    });
  } else {
    seen.set(id, ipdu.path);
  }
}

ctx.log.info(`扫描完成: ${ipdus.length} 个 ComIPdu, ${seen.size} 个独立 PduId`);