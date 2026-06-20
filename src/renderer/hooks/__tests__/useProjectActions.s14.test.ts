// @vitest-environment jsdom
//
// `confirm.cascade.*` i18n contract — Sprint 14 → 17 P2.
//
// Background: this file used to hold 4 behavioral tests for the OLD
// `useProjectActions.removeBswmdWithCascade` (Sprint 14 Task 12). P2
// replaced that function with `removeBswmdWithFullFlow` (4-option
// dialog + dirty-guard merge); behavioral coverage moved to
// `useProjectActions.removeBswmd.test.ts` (P2) which adds 7 cases
// covering all 4 dialog outcomes + dirty-guard + no-deps + unknown.
//
// What remains here is the i18n contract for the ECUC container-delete
// cascade dialog (3-option, still served by `CascadeConfirmDialog`).
// `confirm.cascade.*` keys are still consumed by that component for
// the ECUC flow, so a future key rename should be caught in CI even
// though the ECUC cascade path is no longer coupled to BSWMD removal.

import { describe, expect, it } from 'vitest';

describe('confirm.cascade.* i18n contract (CascadeConfirmDialog for ECUC container delete)', () => {
  it('localizes the cascade dialog via confirm.cascade keys (zh-CN)', async () => {
    const { t, MessagesZhCN } = await import('../../../shared/i18n.js');
    expect(t('zh-CN', 'confirm.cascade.title', { name: 'Can.arxml' })).toBe("删除 'Can.arxml'?");
    expect(MessagesZhCN['confirm.cascade.only']).toBe('仅删容器');
    expect(MessagesZhCN['confirm.cascade.cascade']).toBe('一并删引用');
  });
});
