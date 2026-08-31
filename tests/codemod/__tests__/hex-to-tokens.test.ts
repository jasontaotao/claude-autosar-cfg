import { describe, expect, it } from 'vitest';

import {
  ADJUDICATED_TOKEN_MAP,
  ALPHA_MAP,
  EXCEPTIONS,
  FILE_OVERRIDES,
  GRADIENT_MAP,
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
    const { output, deviations } = transformCss('color: #123456;', 'a.css');
    expect(output).toBe('color: #123456;');
    expect(deviations.map((d) => d.value)).toContain('#123456');
  });
  it('EXCEPTIONS 命中 → 原样保留且不计偏差，行尾注入 stylelint-disable', () => {
    const { output, deviations } = transformCss('color: #1a1d23;', 'a.css', {
      exceptions: new Set(['a.css:#1a1d23']),
    });
    expect(output).toBe('color: #1a1d23; /* stylelint-disable-line color-no-hex */');
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
    const { output, deviations } = transformCss('color: var(--color-accent, #123456);', 'a.css');
    expect(output).toBe('color: var(--color-accent, #123456);');
    expect(deviations.map((d) => d.value)).toContain('#123456');
  });
  it('fallback 为裁决例外 hex → 整段原样保留、不记偏差，行尾注入 stylelint-disable（B26）', () => {
    const css = 'border-color: var(--color-error-border, #fca5a5);';
    const { output, deviations } = transformCss(css, 'src/renderer/components/ErrorBanner.css');
    expect(output).toBe(
      'border-color: var(--color-error-border, #fca5a5); /* stylelint-disable-line color-no-hex */',
    );
    expect(deviations).toHaveLength(0);
  });
  it('fallback 为 alpha 值 → 查 ALPHA_MAP 改写（R4/R5 裁决）', () => {
    const { output, stats, deviations } = transformCss(
      'background: var(--color-surface-2, rgba(255, 255, 255, 0.03));',
      'src/renderer/styles.css',
    );
    expect(output).toBe('background: var(--chrome-hairline);');
    expect(stats.danglingRewritten).toBe(1);
    expect(deviations).toHaveLength(0);
  });
});

describe('渐变与注释', () => {
  it('渐变内 hex 不做单值替换：未精确命中 → 原样 + 偏差（spec §9.7）', () => {
    const css = 'background: linear-gradient(180deg, #1f232b 0%, #262a31 100%);';
    const { output, deviations } = transformCss(css, 'sp.css');
    expect(output).toBe(css);
    expect(deviations.some((d) => d.value.startsWith('gradient:'))).toBe(true);
  });
  it('G1：ScriptPanel 渐变精确命中 GRADIENT_MAP → 坍缩为 var(--chrome-bg-deep)', () => {
    const { output, deviations } = transformCss(
      'background: linear-gradient(180deg, #1f232b 0%, #1a1d23 100%);',
      'src/renderer/components/ScriptPanel/ScriptPanel.css',
    );
    expect(output).toBe('background: var(--chrome-bg-deep);');
    expect(deviations).toHaveLength(0);
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
  it('嵌套括号渐变（rgba stop）整体捕获：内部 hex 不被单值替换（spec §9.7）', () => {
    const css = 'background: linear-gradient(180deg, rgba(0,0,0,0.5) 0%, #1a1d23 100%);';
    const { output, deviations } = transformCss(css, 'sp.css');
    expect(output).toBe(css);
    const g = deviations.find((d) => d.value.startsWith('gradient:'));
    expect(g).toBeDefined();
    // 偏差值必须是完整括号平衡的整条渐变，而非在首个 ) 处截断的残串
    expect(g?.value).toContain('rgba(0,0,0,0.5)');
    expect(g?.value).toContain('#1a1d23');
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
  it('裁决后状态：ALPHA_MAP / GRADIENT_MAP / EXCEPTIONS 已填（Task 3 裁决落盘）', () => {
    expect(ALPHA_MAP['rgba(0,0,0,0.5)']).toBe('--overlay-scrim');
    expect(ALPHA_MAP['rgba(15,23,42,0.55)']).toBe('--overlay-scrim');
    expect(GRADIENT_MAP['linear-gradient(180deg, #1f232b 0%, #1a1d23 100%)']).toBe(
      'var(--chrome-bg-deep)',
    );
    expect(EXCEPTIONS.has('src/renderer/styles.css:#c2410c')).toBe(true);
    expect(EXCEPTIONS.has('src/renderer/components/ValidationPanel.css:#3730a3')).toBe(true);
    expect(
      EXCEPTIONS.has('src/renderer/components/dcmConfig/DcmConfigErrorToast.css:#fca5a5'),
    ).toBe(true);
  });
});

describe('T3 裁决落盘（ADJUDICATED_TOKEN_MAP / FILE_OVERRIDES / 例外门禁）', () => {
  it('seed TOKEN_MAP 冻结 27 键（裁决映射只进 ADJUDICATED_TOKEN_MAP）', () => {
    expect(Object.keys(TOKEN_MAP)).toHaveLength(27);
  });
  it('ADJUDICATED_TOKEN_MAP 裁决抽查（B1/B8/B15/B16 全局）', () => {
    expect(ADJUDICATED_TOKEN_MAP['#6b7280']).toBe('--text-muted');
    expect(ADJUDICATED_TOKEN_MAP['#2563eb']).toBe('--brand-500');
    expect(ADJUDICATED_TOKEN_MAP['#585b70']).toBe('--border-strong');
    expect(ADJUDICATED_TOKEN_MAP['#1e293b']).toBe('--text-primary'); // styles.css 走 FILE_OVERRIDES
  });
  it('FILE_OVERRIDES 上下文拆分（B16）：styles.css 走覆盖，其余文件走全局映射', () => {
    const css = 'color: #1e293b;';
    const inStyles = transformCss(css, 'src/renderer/styles.css');
    expect(inStyles.output).toBe('color: var(--chrome-bg);');
    const elsewhere = transformCss(css, 'src/renderer/components/ProjectPanel.css');
    expect(elsewhere.output).toBe('color: var(--text-primary);');
  });
  it('EXCEPTIONS 与 FILE_OVERRIDES 均为裁决数据源（存在性抽查）', () => {
    expect(FILE_OVERRIDES['src/renderer/styles.css']).toEqual({
      '#1e293b': '--chrome-bg',
      '#334155': '--chrome-border',
      '#1e3a8a': '--chrome-border',
    });
  });
  it('例外保留行尾注入 stylelint-disable（裁决 R8），已注入则跳过', () => {
    const css = [
      'color: #9333ea;',
      'border-color: #9333ea; /* stylelint-disable-line color-no-hex */',
      'margin: 0;',
    ].join('\n');
    const { output, deviations } = transformCss(css, 'src/renderer/styles.css');
    const lines = output.split('\n');
    expect(lines[0]).toBe('color: #9333ea; /* stylelint-disable-line color-no-hex */');
    expect(lines[1]).toBe('border-color: #9333ea; /* stylelint-disable-line color-no-hex */');
    expect(lines[2]).toBe('margin: 0;');
    expect(deviations).toHaveLength(0);
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
  it('例外感知（裁决 R8）：relFile:hex 命中 EXCEPTIONS → 过滤；未命中 → 保留', () => {
    const css = '.x { color: #9333ea; border-color: #9333eb; }';
    const hit = scanResidue(css, 'src/renderer/styles.css');
    expect(hit.filter((r) => r.kind === 'hex').map((r) => r.value)).toEqual(['#9333eb']);
    const miss = scanResidue(css, 'src/renderer/components/ErrorBanner.css');
    expect(miss.filter((r) => r.kind === 'hex')).toHaveLength(2);
  });
  it('findCssFiles：递归 36 个 CSS 且排除 tokens.css（P2 新增 3 个组件样式 + DiagnosticsPanel.css）', () => {
    const files = findCssFiles();
    expect(files.length).toBe(36);
    expect(files.some((f) => f.replace(/\\/g, '/').endsWith('styles/tokens.css'))).toBe(false);
  });
});
