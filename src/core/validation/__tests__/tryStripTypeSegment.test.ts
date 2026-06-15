// Unit tests for Sprint 9 #1 — `tryStripTypeSegment` helper.
//
// Sprint 8 #1 closed the cross-fixture VALUE-REF *namespace* mismatch
// (definition-side `/EAS/...` → value-side `/EcucDefs/...`). It left a
// second mismatch unaddressed: every fixture VALUE-REF carries an extra
// schema-side *type* segment between the parent container and the
// instance shortName (e.g. `/EcuC/EcucPduCollection/Pdu/<instance>`
// or `/Com/ComConfig/ComIPdu/<instance>`). The path index built by
// `walkPathIndex` keys directly off the instance shortName, so the
// type segment must be stripped before the lookup.
//
// Maintenance contract: when `ECUC_SUBSET_SCHEMA` / `ECUC_CONTAINER_SCHEMA`
// gain new per-instance container types (Sprint 9 #14 CanIf + others),
// extend `KNOWN_TYPE_SEGMENTS` in lockstep so the new module's
// VALUE-REFs keep resolving. See PROGRESS.md Sprint 9 #1 for details.

import { describe, it, expect } from 'vitest';

import { tryStripTypeSegment } from '../index.js';

describe('tryStripTypeSegment', () => {
  // 1. 主用例 —— ComIPdu 段删除
  it('strips /ComIPdu/ between parent container and instance shortName', () => {
    expect(tryStripTypeSegment('/EcucDefs/Com/ComConfig/ComIPdu/ComConfigSet_Tx_X')).toBe(
      '/EcucDefs/Com/ComConfig/ComConfigSet_Tx_X',
    );
  });

  // 2. 多段：Pdu 段 + 后面是 instance
  it('strips /Pdu/ in the middle of a value-side path', () => {
    expect(
      tryStripTypeSegment('/EcucDefs/EcuC/EcucPduCollection/Pdu/CanConfigSet_Rx_CAN_Network_X'),
    ).toBe('/EcucDefs/EcuC/EcucPduCollection/CanConfigSet_Rx_CAN_Network_X');
  });

  // 3. 4 段全覆盖 —— Pdu / ComIPdu / ComSignal / ComIPduGroup
  it('strips /Pdu/', () => {
    expect(tryStripTypeSegment('/EcucDefs/EcuC/EcucPduCollection/Pdu/X')).toBe(
      '/EcucDefs/EcuC/EcucPduCollection/X',
    );
  });
  it('strips /ComIPdu/', () => {
    expect(tryStripTypeSegment('/EcucDefs/Com/ComConfig/ComIPdu/X')).toBe(
      '/EcucDefs/Com/ComConfig/X',
    );
  });
  it('strips /ComSignal/', () => {
    expect(tryStripTypeSegment('/EcucDefs/Com/ComConfig/ComSignal/X')).toBe(
      '/EcucDefs/Com/ComConfig/X',
    );
  });
  it('strips /ComIPduGroup/', () => {
    expect(tryStripTypeSegment('/EcucDefs/Com/ComConfig/ComIPduGroup/X')).toBe(
      '/EcucDefs/Com/ComConfig/X',
    );
  });

  // 4. 无 type 段：原样返回
  it('leaves paths without a known type segment unchanged', () => {
    expect(tryStripTypeSegment('/EcucDefs/Det/DetGeneral/DetDebugLoop')).toBe(
      '/EcucDefs/Det/DetGeneral/DetDebugLoop',
    );
  });

  // 5. 空字符串：原样返回 —— 让 isUnsetPlaceholder 处理
  it('returns empty string unchanged', () => {
    expect(tryStripTypeSegment('')).toBe('');
  });

  // 6. 末尾斜杠占位：strip 段但保留末尾斜杠（让 isUnsetPlaceholder 处理）
  it('preserves trailing-slash placeholder when stripping a middle type segment', () => {
    expect(tryStripTypeSegment('/EcucDefs/EcuC/EcucPduCollection/Pdu/X/')).toBe(
      '/EcucDefs/EcuC/EcucPduCollection/X/',
    );
  });

  // 7. 大小写边界：小写 pdu 不被 strip（ECUC type 段恒为大写）
  it('is case-sensitive: lowercase "pdu" is NOT stripped', () => {
    expect(tryStripTypeSegment('/EcucDefs/EcuC/EcucPduCollection/pdu/X')).toBe(
      '/EcucDefs/EcuC/EcucPduCollection/pdu/X',
    );
  });

  // 8. 防御性：PduR（不在白名单）不被 strip
  it('does not strip "PduR" (only exact whitelist match)', () => {
    expect(
      tryStripTypeSegment('/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRoutingPath_X'),
    ).toBe('/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable/PduRoutingPath_X');
  });

  // 9. 多段同命中：单趟扫描应一次 strip 多个命中段
  it('strips multiple known type segments in one path', () => {
    expect(tryStripTypeSegment('/EcucDefs/Com/ComConfig/ComIPduGroup/ComIPdu/X')).toBe(
      '/EcucDefs/Com/ComConfig/X',
    );
  });
});
