// src/renderer/onboarding/suppressWindow.ts
// v1.6.0 W — 7-day suppress window helper.
//
// 设计要点 (locked W spec §3.1):
//   - 7 天滚动窗口 (strict greater-than: 7 days elapsed → suppress)
//   - 当 dismissedAt 为 null 时, 不进入 suppress 状态 (never dismissed)
//   - 常量导出, 方便文档化 / 未来配置接入
//
// This module is pure-functional (no React, no store); the slice reducer
// calls `shouldSuppress({ dismissedAt, now })` on boot to compute the
// initial state per W spec §3.1 "any → 7-day timer → suppressed".

export const SUPPRESS_WINDOW_DAYS = 7;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const SUPPRESS_WINDOW_MS = SUPPRESS_WINDOW_DAYS * ONE_DAY_MS;

/**
 * Determine whether the tour should be suppressed given the
 * persisted `dismissedAt` timestamp and the current time.
 *
 * Semantics (locked per W spec §3.1):
 *   - `dismissedAt === null` → never dismissed, never suppress (return false)
 *   - `now - dismissedAt > SUPPRESS_WINDOW_MS` → suppress (return true)
 *   - `now - dismissedAt <= SUPPRESS_WINDOW_MS` → still in suppress window (return false)
 *
 * "Strict greater-than" means at exactly 7 days elapsed, the tour is
 * NOT yet suppressed (gives the user a clean day-of boundary).
 */
export function shouldSuppress(input: {
  readonly dismissedAt: number | null;
  readonly now: number;
}): boolean {
  if (input.dismissedAt === null) {
    return false;
  }
  const elapsed = input.now - input.dismissedAt;
  return elapsed > SUPPRESS_WINDOW_MS;
}