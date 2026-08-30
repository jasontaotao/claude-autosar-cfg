import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const tokensCss = read('../styles/tokens.css');
const stylesCss = read('../styles.css');

// spec §3.1 token 清单 + §9.8 --surface-menu + §9.14 字体栈（关键项抽查）
const REQUIRED_TOKENS: Array<[string, string]> = [
  ['--surface-app', '#f8fafc'],
  ['--surface-panel', '#ffffff'],
  ['--surface-elevated', '#ffffff'],
  ['--surface-subtle', '#f1f5f9'],
  ['--surface-header', 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'],
  ['--surface-menu', '#1c2128'],
  ['--brand-500', '#3b82f6'],
  ['--brand-400', '#60a5fa'],
  ['--brand-300', '#93c5fd'],
  ['--accent-cyan', '#38bdf8'],
  ['--accent-amber', '#f59e0b'],
  ['--accent-emerald', '#10b981'],
  ['--accent-rose', '#f43f5e'],
  ['--accent-amber-strong', '#b45309'],
  ['--text-primary', '#0f172a'],
  ['--text-secondary', '#475569'],
  ['--text-muted', '#94a3b8'],
  ['--text-inverse', '#f1f5f9'],
  ['--text-inverse-muted', '#cbd5e1'],
  ['--border-subtle', '#e2e8f0'],
  ['--border-strong', '#cbd5e1'],
  ['--shadow-sm', '0 1px 2px rgba(15, 23, 42, 0.05)'],
  ['--shadow-md', '0 4px 12px rgba(15, 23, 42, 0.08)'],
  ['--shadow-lg', '0 12px 32px rgba(15, 23, 42, 0.12)'],
  ['--radius-sm', '4px'],
  ['--radius-md', '6px'],
  ['--radius-lg', '10px'],
  ['--text-xs', '11px'],
  ['--text-base', '13px'],
  ['--text-lg', '16px'],
  ['--space-1', '4px'],
  ['--space-5', '16px'],
  // 字体栈按 tokens.css §9.14 完整声明逐字断言（含 'Microsoft YaHei' / Consolas 关键回退）
  ['--font-sans', "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"],
  ['--font-mono', 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('P1 tokens.css（spec §3.1 / §10.3 唯一定义处）', () => {
  it.each(REQUIRED_TOKENS)('定义 %s = %s', (name, value) => {
    expect(tokensCss).toMatch(new RegExp(`${escapeRe(name)}:\\s*${escapeRe(value)}`));
  });

  it('经 styles.css @import 接入，且位于所有 @import 之首', () => {
    const idx = stylesCss.indexOf("@import url('./styles/tokens.css');");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(stylesCss.indexOf("@import url('./keyboard/keyboard.css');"));
    expect(idx).toBeLessThan(stylesCss.indexOf('@tailwind'));
  });
});

// T3 偏差裁决新增 15 token（2026-08-30，docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md）
const T3_ADJUDICATED_TOKENS: Array<[string, string]> = [
  ['--brand-tint', '#dbeafe'],
  ['--brand-tint-soft', '#eff6ff'],
  ['--accent-rose-strong', '#b91c1c'],
  ['--chrome-bg', '#1e293b'],
  ['--chrome-bg-deep', '#1a1d23'],
  ['--chrome-border', '#334155'],
  ['--chrome-hairline', 'rgba(255, 255, 255, 0.1)'],
  ['--rose-tint', '#fef2f2'],
  ['--rose-tint-strong', '#fee2e2'],
  ['--amber-tint', '#fef3c7'],
  ['--emerald-tint', '#dcfce7'],
  ['--overlay-scrim', 'rgba(0, 0, 0, 0.5)'],
  ['--overlay-scrim-soft', 'rgba(0, 0, 0, 0.2)'],
  ['--brand-alpha', 'rgba(59, 130, 246, 0.12)'],
  ['--brand-alpha-soft', 'rgba(59, 130, 246, 0.06)'],
];

describe('T3 裁决新增 token（偏差裁决 2026-08-30）', () => {
  it.each(T3_ADJUDICATED_TOKENS)('定义 %s = %s', (name, value) => {
    expect(tokensCss).toMatch(new RegExp(`${escapeRe(name)}:\\s*${escapeRe(value)}`));
  });

  it('每个 T3 token 均带「T3 裁决新增」标注', () => {
    for (const [name] of T3_ADJUDICATED_TOKENS) {
      const line = tokensCss.split('\n').find((l) => l.includes(`${name}:`));
      expect(line).toBeDefined();
      expect(line).toContain('T3 裁决新增');
    }
  });
});
