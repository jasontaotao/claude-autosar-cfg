import { describe, expect, it } from 'vitest';
import {
  ALPHA_MAP,
  TOKEN_MAP,
  expandHex,
  findCssFiles,
  rgbSpaceToHex,
  scanResidue,
  transformCss,
} from '../../../scripts/codemod/hex-to-tokens.mjs';

describe('基础归一化', () => {
  it('expandHex：3/6 位小写归一', () => {
    expect(expandHex('#FFF')).toBe('#ffffff');
    expect(expandHex('#1E1E2E')).toBe('#1e1e2e');
  });
  it('rgbSpaceToHex：空格语法 → hex', () => {
    expect(rgbSpaceToHex('rgb(59 130 246)')).toBe('#3b82f6');
    expect(rgbSpaceToHex('rgba(15, 23, 42, 0.5)')).toBeNull(); // 带归一化语义，交给 ALPHA_MAP
  });
});

describe('纯值映射（spec §9.7）', () => {
  it('直映射命中（含大小写/缩写）', () => {
    const { output, stats } = transformCss('color: #FFF;\nborder-top: 1px solid #CBD5E1;', 'a.css');
    expect(output).toBe(
      'color: var(--surface-panel);\nborder-top: 1px solid var(--border-strong);',
    );
    expect(stats.replaced).toBe(2);
  });
  it('Catppuccin 反转逐行一对一（spec §3.3）', () => {
    const css = 'background: #1e1e2e; color: #cdd6f4; border-color: #45475a;';
    const { output } = transformCss(css, 'dialog.css');
    expect(output).toBe(
      'background: var(--surface-panel); color: var(--text-primary); border-color: var(--border-strong);',
    );
  });
  it('seed TOKEN_MAP 关键项抽查', () => {
    expect(TOKEN_MAP['#f8fafc']).toBe('--surface-app');
    expect(TOKEN_MAP['#89b4fa']).toBe('--brand-500');
    expect(TOKEN_MAP['#b45309']).toBe('--accent-amber-strong');
    expect(TOKEN_MAP['#1c2128']).toBe('--surface-menu');
  });
  it('未命中 → 原样保留 + 偏差记录', () => {
    const { output, deviations } = transformCss('color: #6b7280;', 'a.css');
    expect(output).toBe('color: #6b7280;');
    expect(deviations.map((d) => d.value)).toContain('#6b7280');
  });
  it('EXCEPTIONS 命中 → 原样保留且不计偏差', () => {
    const { output, deviations } = transformCss('color: #1a1d23;', 'a.css', {
      exceptions: new Set(['a.css:#1a1d23']),
    });
    expect(output).toBe('color: #1a1d23;');
    expect(deviations).toHaveLength(0);
  });
});

describe('悬空 var(--color-*, fallback)（spec §3.2）', () => {
  it('fallback 可映射 → 改写 + 删 fallback', () => {
    const maps = { tokenMap: { ...TOKEN_MAP, '#6b7280': '--text-muted' } };
    const { output, stats } = transformCss(
      'color: var(--color-text-muted, #6b7280);',
      'a.css',
      maps,
    );
    expect(output).toBe('color: var(--text-muted);');
    expect(stats.danglingRewritten).toBe(1);
  });
  it('fallback 不可映射 → 原样 + 偏差', () => {
    const { output, deviations } = transformCss('color: var(--color-accent, #4a90e2);', 'a.css');
    expect(output).toBe('color: var(--color-accent, #4a90e2);');
    expect(deviations.map((d) => d.value)).toContain('#4a90e2');
  });
});

describe('渐变与注释', () => {
  it('渐变内 hex 不做单值替换：未精确命中 → 原样 + 偏差（spec §9.7）', () => {
    const css = 'background: linear-gradient(180deg, #1f232b 0%, #1a1d23 100%);';
    const { output, deviations } = transformCss(css, 'sp.css');
    expect(output).toBe(css);
    expect(deviations.some((d) => d.value.startsWith('gradient:'))).toBe(true);
  });
  it('整条渐变精确命中 GRADIENT_MAP → 整体替换', () => {
    const g = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
    const { output } = transformCss(`background: ${g};`, 'a.css', {
      gradientMap: { [g.replace(/\s+/g, ' ').toLowerCase()]: 'var(--surface-header)' },
    });
    expect(output).toBe('background: var(--surface-header);');
  });
  it('计划注释 /* --color-* */ 删除（spec §3.4），正文照常替换', () => {
    const { output, stats } = transformCss(
      'border: 1px solid #313244; /* --color-border */',
      'a.css',
    );
    expect(output).toBe('border: 1px solid var(--border-subtle);');
    expect(stats.plannedCommentsStripped).toBe(1);
  });
  it('普通文档注释内 hex 不替换、不计偏差', () => {
    const css = '/* uses #2d323b for the border */\n.x { color: #fff; }';
    const { output, deviations } = transformCss(css, 'a.css');
    expect(output).toContain('#2d323b');
    expect(deviations).toHaveLength(0);
  });
});

describe('alpha / overlay', () => {
  it('ALPHA_MAP 命中（空白归一）→ var()；未命中 → 偏差', () => {
    const maps = { alphaMap: { 'rgba(0,0,0,0.5)': '--overlay-scrim' } };
    const hit = transformCss('background: rgba(0, 0, 0, 0.5);', 'a.css', maps);
    expect(hit.output).toBe('background: var(--overlay-scrim);');
    const miss = transformCss('background: rgba(0, 0, 0, 0.55);', 'a.css', maps);
    expect(miss.output).toBe('background: rgba(0, 0, 0, 0.55);');
    expect(miss.deviations.map((d) => d.value)).toContain('rgba(0, 0, 0, 0.55)');
  });
  it('seed ALPHA_MAP 裁决前为空（Task 3 checkpoint 强制）', () => {
    expect(Object.keys(ALPHA_MAP)).toHaveLength(0);
  });
});

describe('scanResidue / findCssFiles（--check 支撑）', () => {
  it('报告 hex/rgb/悬空 var/.dark 残留，忽略注释内 hex', () => {
    const css = [
      '/* doc #2d323b */',
      '.x { color: #111; background: rgba(0,0,0,0.5); }',
      '.y { color: var(--color-text, #111); }',
      '.dark .z { color: #fff; }',
    ].join('\n');
    const kinds = scanResidue(css).map((r) => r.kind);
    expect(kinds).toContain('hex');
    expect(kinds).toContain('rgb');
    expect(kinds).toContain('dangling-var');
    expect(kinds).toContain('dark-selector');
    expect(kinds.filter((k) => k === 'hex')).toHaveLength(2); // 注释内不计
  });
  it('findCssFiles：递归 32 个 CSS 且排除 tokens.css', () => {
    const files = findCssFiles();
    expect(files.length).toBe(32);
    expect(files.some((f) => f.replace(/\\/g, '/').endsWith('styles/tokens.css'))).toBe(false);
  });
});
