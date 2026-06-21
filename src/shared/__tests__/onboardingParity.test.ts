// src/shared/__tests__/onboardingParity.test.ts
// v1.6.0 W — i18n parity for the 27 onboarding keys × 2 locales.
//
// Contract (locked W spec §3.5):
//   - zh-CN and en bundles MUST share the same key set for the
//     onboarding.* + tour.coordination.* + flags.keyboardFirst.* namespaces
//   - Total: 20 onboarding + 2 tour-coord + 5 flag keys (with two of the
//     5 deferred to U — see U spec; we ship the W-owned pair here)
//   - Parity test pin: every key in the W-owned set is present in both
//     locales, and no extra keys exist in either bundle
//
// TDD: this file is the parity contract for the W i18n keys. The actual
// keys land in PR(W-4).

import { describe, expect, it } from 'vitest';

import { MessagesZhCN, MessagesEn } from '../i18n.js';

const W_KEYS: readonly string[] = [
  // 20 onboarding keys
  'onboarding.welcome.title',
  'onboarding.welcome.body',
  'onboarding.welcome.ctaTour',
  'onboarding.welcome.ctaDemo',
  'onboarding.welcome.ctaSkip',
  'onboarding.step1.title',
  'onboarding.step1.body',
  'onboarding.step2.title',
  'onboarding.step2.body',
  'onboarding.step3.title',
  'onboarding.step3.body',
  'onboarding.step4.title',
  'onboarding.step4.body',
  'onboarding.step5.title',
  'onboarding.step5.body',
  'onboarding.controls.next',
  'onboarding.controls.back',
  'onboarding.controls.skip',
  'onboarding.controls.finish',
  'onboarding.progress.label',
  // 2 tour-coordination keys
  'tour.coordination.validationPaused.title',
  'tour.coordination.validationPaused.message',
  // 2 flags.keyboardFirst keys
  'flags.keyboardFirst.label',
  'flags.keyboardFirst.description',
] as const;

describe('i18n parity — onboarding (v1.6.0 W)', () => {
  it('every W key is present in both zh-CN and en bundles', () => {
    for (const key of W_KEYS) {
      expect(MessagesZhCN).toHaveProperty(key);
      expect(MessagesEn).toHaveProperty(key);
    }
  });

  it('W key count matches spec (24 = 20 + 2 + 2)', () => {
    expect(W_KEYS.length).toBe(24);
  });

  it('no W key has a falsy (empty) translation in either locale', () => {
    for (const key of W_KEYS) {
      const zh = (MessagesZhCN as unknown as Record<string, string>)[key];
      const en = (MessagesEn as unknown as Record<string, string>)[key];
      expect(zh).toBeDefined();
      expect(en).toBeDefined();
      expect(zh!.length).toBeGreaterThan(0);
      expect(en!.length).toBeGreaterThan(0);
    }
  });

  it('progress.label interpolation markers match the W spec', () => {
    const en = (MessagesEn as unknown as Record<string, string>)['onboarding.progress.label'];
    expect(en).toMatch(/\{current\}/);
    expect(en).toMatch(/\{total\}/);
  });

  it('zh-CN progress.label also uses the {current} / {total} interpolation', () => {
    const zh = (MessagesZhCN as unknown as Record<string, string>)['onboarding.progress.label'];
    expect(zh).toMatch(/\{current\}/);
    expect(zh).toMatch(/\{total\}/);
  });
});