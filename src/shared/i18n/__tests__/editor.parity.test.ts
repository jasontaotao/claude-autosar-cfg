// editor.parity.test.ts — Phase P1 T4 collection-header keys parity.
//
// Pins the 4 keys added for the multi-instance CollectionHeader component:
//   - tree.expandCollection
//   - tree.collapseCollection
//   - tree.collectionAdd
//   - tree.collectionAtMax
//
// Each key MUST be present in BOTH the en and zh-CN bundles (parity
// invariant) AND MUST be non-empty (defensive against silent
// half-translation). The full bundle parity sweep in
// `src/shared/__tests__/i18n.test.ts` already enforces the key-count
// invariant via the `Messages` type assignment, but this dedicated
// file documents the per-key translations for the collection header
// so a future translation drift in these 4 specific keys is caught
// by name, not just by "some key moved".
//
// Location note: this file lives under `src/shared/i18n/__tests__/` —
// the only dedicated __tests__ directory under `src/shared/i18n/`.
// The other i18n tests live in `src/shared/__tests__/i18n.test.ts`
// because they exercise the cross-cluster barrel; this file is
// editor-cluster scoped and intentionally separate.

import { describe, it, expect } from 'vitest';

import { EditorEn } from '../../i18n.en/editor.js';
import { EditorZhCN } from '../../i18n.zh-CN/editor.js';

describe('i18n — Phase P1 T4 collection-header keys parity', () => {
  const KEYS = [
    'tree.expandCollection',
    'tree.collapseCollection',
    'tree.collectionAdd',
    'tree.collectionAtMax',
  ] as const;

  it('every collection-header key is present in BOTH en and zh-CN bundles', () => {
    for (const key of KEYS) {
      // Cast through unknown because EditorEn/EditorZhCN are typed as
      // EditorMessages which does NOT yet include these keys (T4
      // adds them). The cast documents the intent: this test pins
      // the keys regardless of interface status.
      const en = (EditorEn as unknown as Record<string, string>)[key] as string | undefined;
      const zh = (EditorZhCN as unknown as Record<string, string>)[key] as string | undefined;
      expect(en, `en.${key} missing`).toBeTruthy();
      expect(zh, `zh.${key} missing`).toBeTruthy();
      // Narrow: toBeTruthy() doesn't narrow under strict TS, so the
      // non-null assertions below are guarded by the assertions above.
      expect(en!.trim().length, `en.${key} is empty`).toBeGreaterThan(0);
      expect(zh!.trim().length, `zh.${key} is empty`).toBeGreaterThan(0);
    }
  });

  it('renders tree.expandCollection / tree.collapseCollection (zh-CN + en)', () => {
    expect(EditorEn['tree.expandCollection']).toBe('Expand collection');
    expect(EditorZhCN['tree.expandCollection']).toBe('展开集合');
    expect(EditorEn['tree.collapseCollection']).toBe('Collapse collection');
    expect(EditorZhCN['tree.collapseCollection']).toBe('折叠集合');
  });

  it('renders tree.collectionAdd / tree.collectionAtMax (zh-CN + en)', () => {
    expect(EditorEn['tree.collectionAdd']).toBe('Add another instance to this collection');
    expect(EditorZhCN['tree.collectionAdd']).toBe('在此集合中再添加一个实例');
    expect(EditorEn['tree.collectionAtMax']).toBe('Reached upper bound — cannot add more');
    expect(EditorZhCN['tree.collectionAtMax']).toBe('已达上限 — 无法继续添加');
  });
});
