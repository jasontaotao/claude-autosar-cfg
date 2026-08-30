#!/usr/bin/env node
// scripts/codemod/hex-to-tokens.mjs — P1 色值收敛 codemod（spec §3.2 / §10.3）。
//
// 模式：
//   （无参数）  dry-run：输出每个文件的替换预览 + 偏差清单，不落盘
//   --write    落盘
//   --check    残留裸值即 exit 1（P1 门禁，spec §10.2）
//
// 映射语义 = 纯值映射（spec §9.7）。TOKEN_MAP（seed，冻结 27 键）/ ADJUDICATED_TOKEN_MAP /
// ALPHA_MAP / GRADIENT_MAP / FILE_OVERRIDES / EXCEPTIONS 是映射的唯一数据源，实施者不得另建
// 映射。T3 偏差裁决结果（2026-08-30 用户整体确认）已填入 ADJUDICATED_TOKEN_MAP / ALPHA_MAP /
// GRADIENT_MAP / EXCEPTIONS（seed TOKEN_MAP 不动；B9/B16/B18 上下文拆分入 FILE_OVERRIDES）。

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CSS_ROOT = 'src/renderer';
// join() 归一化分隔符：walk 产出的路径与 TOKENS_CSS 必须同构，否则 Windows 上排除失效。
const TOKENS_CSS = join('src/renderer', 'styles', 'tokens.css');

/** seed：直映射（spec §3.1）+ Catppuccin 反转（spec §3.3，逐行一对一）。 */
export const TOKEN_MAP = {
  // —— mockup 直映射 ——
  '#f8fafc': '--surface-app',
  '#ffffff': '--surface-panel',
  '#fff': '--surface-panel',
  // #f1f5f9 / #cbd5e1 与 --text-inverse / --text-inverse-muted 同值（spec §3.1）。
  // 纯值映射取 surface/border 侧；header 等深色面上的文本用法由重灾区人工 review 改为 inverse token（§9.7）。
  '#f1f5f9': '--surface-subtle',
  '#e2e8f0': '--border-subtle',
  '#cbd5e1': '--border-strong',
  '#0f172a': '--text-primary',
  '#475569': '--text-secondary',
  '#94a3b8': '--text-muted',
  '#3b82f6': '--brand-500',
  '#60a5fa': '--brand-400',
  '#93c5fd': '--brand-300',
  '#b45309': '--accent-amber-strong',
  '#10b981': '--accent-emerald',
  '#1c2128': '--surface-menu',
  '#c9d1d9': '--text-inverse-muted',
  // —— Catppuccin 反转（§3.3）——
  '#1e1e2e': '--surface-panel',
  '#181825': '--surface-elevated',
  '#313244': '--border-subtle',
  '#45475a': '--border-strong',
  '#cdd6f4': '--text-primary',
  '#a6adc8': '--text-secondary',
  '#6c7086': '--text-muted',
  '#89b4fa': '--brand-500',
  '#f38ba8': '--accent-rose',
  '#a6e3a1': '--accent-emerald',
  '#f9e2af': '--accent-amber',
};

/**
 * T3 偏差裁决 hex→token 映射（2026-08-30 用户整体确认；数据源 =
 * docs/superpowers/plans/2026-08-30-p1-visual-foundation-deviations.md，dry-run 实测）。
 * key = 展开 6 位小写 hex。seed TOKEN_MAP 冻结 27 键不动，裁决映射只进本表；
 * B9/B16/B18 的 styles.css 上下文拆分走 FILE_OVERRIDES。
 */
export const ADJUDICATED_TOKEN_MAP = {
  // B1 灰字 → --text-muted（rgb 空格语法 rgb(100 116 139) 经 rgbSpaceToHex 归一为 #64748b 同档）
  '#6b7280': '--text-muted',
  '#64748b': '--text-muted',
  '#9ca3af': '--text-muted',
  // B2 中灰字 → --text-secondary
  '#555555': '--text-secondary',
  '#666666': '--text-secondary',
  '#4b5563': '--text-secondary',
  '#374151': '--text-secondary',
  '#757575': '--text-secondary',
  // B3 深字 → --text-primary
  '#111111': '--text-primary',
  '#222222': '--text-primary',
  '#1f2937': '--text-primary',
  // B4 浅边 → --border-subtle
  '#e5e7eb': '--border-subtle',
  '#e4e6eb': '--border-subtle',
  '#e8ecf1': '--border-subtle',
  '#dce0e6': '--border-subtle',
  '#eeeeee': '--border-subtle',
  '#eef1f6': '--border-subtle',
  // B5 中灰边 → --border-strong
  '#cccccc': '--border-strong',
  '#d1d5db': '--border-strong',
  '#dddddd': '--border-strong',
  '#d4d6db': '--border-strong',
  // B6 近白底 → --surface-app
  '#fafafa': '--surface-app',
  '#f5f7fa': '--surface-app',
  '#f9fafb': '--surface-app',
  // B7 浅灰底 → --surface-subtle
  '#f3f4f6': '--surface-subtle',
  '#f3f3f3': '--surface-subtle',
  '#f1f3f5': '--surface-subtle',
  '#f5f5f5': '--surface-subtle',
  '#f0f0f0': '--surface-subtle',
  // B8 蓝变体 → --brand-500
  '#2563eb': '--brand-500',
  '#4a90e2': '--brand-500',
  '#4f46e5': '--brand-500',
  '#357abd': '--brand-500',
  '#1e40af': '--brand-500',
  '#82aaff': '--brand-500',
  '#1e88e5': '--brand-500',
  // B9 深蓝 → 文字 --text-primary（styles.css 深色区底拆分走 FILE_OVERRIDES --chrome-border）
  '#1e3a8a': '--text-primary',
  // B10 天蓝 → --accent-cyan
  '#0ea5e9': '--accent-cyan',
  // B11 红族 → --accent-rose
  '#ff5370': '--accent-rose',
  '#ff8a80': '--accent-rose',
  '#cc0000': '--accent-rose',
  '#ef4444': '--accent-rose',
  '#f87171': '--accent-rose',
  '#e53935': '--accent-rose',
  // B12 深琥珀字 → --accent-amber-strong
  '#92400e': '--accent-amber-strong',
  '#8a6d00': '--accent-amber-strong',
  '#9a3412': '--accent-amber-strong',
  // B13 琥珀变体 → --accent-amber
  '#ffcb6b': '--accent-amber',
  '#e0c070': '--accent-amber',
  '#f57c00': '--accent-amber',
  // B14 绿族 → --accent-emerald
  '#43a047': '--accent-emerald',
  '#16a34a': '--accent-emerald',
  '#15803d': '--accent-emerald',
  '#166534': '--accent-emerald',
  '#065f46': '--accent-emerald',
  '#115e59': '--accent-emerald',
  '#81c784': '--accent-emerald',
  // B15 Catppuccin 表外 → 逐值归档
  '#585b70': '--border-strong',
  '#74c7ec': '--brand-300',
  '#eba0ac': '--accent-rose',
  '#b4befe': '--brand-400',
  '#94e2d5': '--accent-cyan',
  '#fab387': '--accent-amber',
  // B16 深色 chrome（全局 = 浅色区文字用法；styles.css 深色 chrome 底拆分走 FILE_OVERRIDES）
  '#1e293b': '--text-primary',
  '#2d323b': '--chrome-border',
  '#3d424b': '--chrome-border',
  '#30363d': '--chrome-border',
  '#484f58': '--chrome-border',
  '#22262e': '--chrome-bg-deep',
  '#262a31': '--chrome-bg-deep',
  '#1a1d23': '--chrome-bg-deep',
  // B18 中灰字 → --text-secondary（styles.css 保暗区拆分走 FILE_OVERRIDES --chrome-border）
  '#334155': '--text-secondary',
  // B19 红 tint 面
  '#fef2f2': '--rose-tint',
  '#fee2e2': '--rose-tint-strong',
  '#fecaca': '--rose-tint-strong',
  // B20 琥珀 tint 面
  '#fef3c7': '--amber-tint',
  '#fff8e1': '--amber-tint',
  '#fff7ed': '--amber-tint',
  '#ffedd5': '--amber-tint',
  // B21 绿 tint 面
  '#dcfce7': '--emerald-tint',
  '#a7f3d0': '--emerald-tint',
  '#ecfdf5': '--emerald-tint',
  '#f0fdfa': '--emerald-tint',
  // B22 蓝 tint 面
  '#dbeafe': '--brand-tint',
  '#bfdbfe': '--brand-tint',
  '#eef2ff': '--brand-tint-soft',
  '#eff6ff': '--brand-tint-soft',
  // B23 深红字 → --accent-rose-strong
  '#991b1b': '--accent-rose-strong',
  '#b91c1c': '--accent-rose-strong',
  '#7f1d1d': '--accent-rose-strong',
};

/** alpha/overlay 值映射；key = 空白归一化后的小写 rgba 串。T3 裁决已填（R1–R5、R8）。 */
export const ALPHA_MAP = {
  // R1 弹窗/浮层遮罩 → --overlay-scrim
  'rgba(0,0,0,0.4)': '--overlay-scrim',
  'rgba(0,0,0,0.45)': '--overlay-scrim',
  'rgba(0,0,0,0.5)': '--overlay-scrim',
  'rgba(0,0,0,0.55)': '--overlay-scrim',
  // R2 弱遮罩/浅投影 → --overlay-scrim-soft
  'rgba(0,0,0,0.06)': '--overlay-scrim-soft',
  'rgba(0,0,0,0.1)': '--overlay-scrim-soft',
  'rgba(0,0,0,0.2)': '--overlay-scrim-soft',
  'rgba(0,0,0,0.25)': '--overlay-scrim-soft',
  'rgba(0,0,0,0.35)': '--overlay-scrim-soft',
  // R8 slate 基遮罩 → --overlay-scrim（视觉归一）
  'rgba(15,23,42,0.55)': '--overlay-scrim',
  // R3 brand alpha（59,130,246 直档 + 137,180,250 反转面等价档）
  'rgba(59,130,246,0.12)': '--brand-alpha',
  'rgba(59,130,246,0.15)': '--brand-alpha',
  'rgba(137,180,250,0.05)': '--brand-alpha',
  'rgba(137,180,250,0.12)': '--brand-alpha',
  'rgba(137,180,250,0.13)': '--brand-alpha',
  'rgba(137,180,250,0.18)': '--brand-alpha',
  'rgba(59,130,246,0.06)': '--brand-alpha-soft',
  'rgba(59,130,246,0.08)': '--brand-alpha-soft',
  // R4 保暗区发丝线/高光 → --chrome-hairline
  'rgba(255,255,255,0.02)': '--chrome-hairline',
  'rgba(255,255,255,0.03)': '--chrome-hairline',
  'rgba(255,255,255,0.04)': '--chrome-hairline',
  'rgba(255,255,255,0.05)': '--chrome-hairline',
  'rgba(255,255,255,0.1)': '--chrome-hairline',
  'rgba(255,255,255,0.18)': '--chrome-hairline',
  'rgba(255,255,255,0.2)': '--chrome-hairline',
  // R5 alpha 底 → 实 tint 底（视觉归一，裁决 R9）
  'rgba(185,28,28,0.06)': '--rose-tint',
  'rgba(252,165,165,0.1)': '--rose-tint-strong',
  'rgba(14,165,233,0.15)': '--brand-tint-soft',
  'rgba(249,226,175,0.25)': '--amber-tint',
  'rgba(249,226,175,0.15)': '--amber-tint',
  'rgba(245,158,11,0.3)': '--amber-tint',
  'rgba(245,158,11,0.12)': '--amber-tint',
  'rgba(243,139,168,0.1)': '--rose-tint',
  'rgba(244,67,54,0.12)': '--rose-tint',
  'rgba(67,160,71,0.12)': '--emerald-tint',
};

/** 整条渐变映射；key = 空白归一化后的小写渐变串。G1：ScriptPanel 渐变两 stop 同族，坍缩为纯色。 */
export const GRADIENT_MAP = {
  'linear-gradient(180deg, #1f232b 0%, #1a1d23 100%)': 'var(--chrome-bg-deep)',
};

/**
 * 用户裁决「保留原值」的豁免（B17/B24/B25/B26/B27，全部为 hex）；元素形如
 * `src/renderer/<相对路径（正斜杠）>:<展开6位小写hex>`，与 CLI 传入的 relFile 同构。
 * 保留值在 transformCss 中原样保留，并在行尾注入 stylelint-disable-line color-no-hex 豁免注释。
 */
export const EXCEPTIONS = new Set([
  // B17 Diff/语义高亮专色（#9333ea 按 dry-run 实测在 styles.css，其余 4 值在 ValidationPanel.css）
  'src/renderer/styles.css:#9333ea',
  'src/renderer/components/ValidationPanel.css:#6b21a8',
  'src/renderer/components/ValidationPanel.css:#f3e8ff',
  'src/renderer/components/ValidationPanel.css:#9d174d',
  'src/renderer/components/ValidationPanel.css:#fdf2f8',
  // B24 styles.css 保暗区橙（spec §3.1 明示 #c2410c/#ea580c 不预先合并）
  'src/renderer/styles.css:#c2410c',
  'src/renderer/styles.css:#ea580c',
  // B25 ScriptPanel 保暗区散值（现有/提案 token 均无对应档）
  'src/renderer/components/ScriptPanel/ScriptPanel.css:#b4b8bf',
  'src/renderer/components/ScriptPanel/ScriptPanel.css:#8a8f99',
  'src/renderer/components/ScriptPanel/ScriptPanel.css:#4d525b',
  'src/renderer/components/ScriptPanel/ScriptPanel.css:#1e1e1e',
  // B26 tint 面红描边（裁决 R5：「待定」两选项中取保守项，保留原值）
  'src/renderer/components/dcmConfig/DcmConfigErrorToast.css:#fca5a5',
  'src/renderer/styles.css:#fca5a5',
  'src/renderer/components/ErrorBanner.css:#fca5a5',
  'src/renderer/components/ConfirmDialog2.css:#fca5a5',
  // B27 indigo-800 单发语义高亮（ValidationPanel.css）
  'src/renderer/components/ValidationPanel.css:#3730a3',
]);

/**
 * 上下文拆分（B9/B16/B18）：同一 hex 在 styles.css 深色 chrome 区与其余浅色区映射不同 token。
 * key1 = 正斜杠相对路径（与 CLI relFile 同构），key2 = 展开 6 位小写 hex。
 * 查找链（hex pass / rgb 空格语法 pass / 悬空 fallback pass 共用）：
 * fileOverrides[relFile][hex] → adjudicatedMap[hex] → tokenMap[hex]。
 */
export const FILE_OVERRIDES = {
  'src/renderer/styles.css': {
    '#1e293b': '--chrome-bg', // B16: styles.css 6 处深色 chrome 底；其余 13 处浅色区文字走全局 --text-primary
    '#334155': '--chrome-border', // B18: styles.css 6 处保暗区；ErrorBanner/ProjectPanel/LeftPanel 7 处走全局 --text-secondary
    '#1e3a8a': '--chrome-border', // B9: styles.css 2 处深色区底；其余 10 处文字走全局 --text-primary
  },
};

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_RE = /rgba?\([^)]*\)/gi;
const DANGLING_RE = /var\(--color-[a-z0-9-]+,\s*(#[0-9a-fA-F]{3,8}|rgba?\([0-9a-z.,\s%]+\))\s*\)/gi;
// 连同注释前的空白一起删除，避免残留尾随空格（spec §3.4）
const PLANNED_COMMENT_RE = /\s*\/\*\s*--color-[^*]*\*\//g;
// 括号平衡匹配（一层嵌套足够）：嵌套 rgba()/rgb() stop 的渐变必须整条捕获，
// 否则在首个 ) 处截断，尾部 hex 逃逸掩码被单值替换、偏差串残缺（spec §9.7）
const GRADIENT_RE = /linear-gradient\((?:[^()]|\([^()]*\))*\)/gi;
const DARK_SELECTOR_RE = /\.dark[\s{.,:[>#]/;
// 例外保留行尾注入（裁决 R8）：--write 与 dry-run 预览一致，行尾已有则跳过
const STYLELINT_DISABLE_MARKER = ' /* stylelint-disable-line color-no-hex */';

export function expandHex(hex) {
  const h = hex.toLowerCase();
  if (h.length === 4 || h.length === 5) {
    return '#' + [...h.slice(1)].map((c) => c + c).join('');
  }
  return h;
}

/** 'rgb(59 130 246)' → '#3b82f6'；带 alpha 或解析失败 → null（带 alpha 走 ALPHA_MAP）。 */
export function rgbSpaceToHex(fn) {
  const m = fn.match(/^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/i);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, parseInt(n, 10))));
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export function normalizeAlpha(fn) {
  return fn.toLowerCase().replace(/\s+/g, '');
}

export function findCssFiles(root = CSS_ROOT) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.css') && p !== TOKENS_CSS) files.push(p);
    }
  };
  walk(root);
  return files.sort();
}

/**
 * --check 残留扫描：hex/rgb/悬空 var/计划注释/.dark 选择器；注释内 hex 不计。
 * 例外感知（裁决 R8）：hex/rgb 残留命中 `relFile:色值`（EXCEPTIONS）时过滤——
 * 裁决保留值不算残留；planned-comment / dangling-var / dark-selector 永不过滤。
 */
export function scanResidue(css, relFile, exceptions = EXCEPTIONS) {
  const normRel = relFile ? relFile.replaceAll('\\', '/') : undefined;
  const exceptedValue = (value) =>
    normRel !== undefined && exceptions.has(`${normRel}:${value.toLowerCase()}`);
  const residue = [];
  const add = (index, kind, value) => {
    const line = css.slice(0, index).split('\n').length;
    residue.push({ line, kind, value });
  };
  // 计划注释在掩码前检测（掩码会把注释内容替换为空格）
  for (const m of css.matchAll(/\/\*\s*--color-/g)) add(m.index, 'planned-comment', m[0]);
  const maskComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const masked = maskComments(css);
  for (const m of masked.matchAll(/var\(--color-[a-z0-9-]+/gi)) add(m.index, 'dangling-var', m[0]);
  // 悬空 var（含 fallback）整段等长掩码：fallback 内的 hex/rgb 已计入 dangling-var，不重复计为 hex/rgb 残留
  const maskedVars = masked.replace(/var\(--color-[a-z0-9-]+(?:,[^)]*)?\)/gi, (m) =>
    ' '.repeat(m.length),
  );
  for (const m of maskedVars.matchAll(HEX_RE)) {
    if (!exceptedValue(expandHex(m[0]))) add(m.index, 'hex', m[0]);
  }
  for (const m of maskedVars.matchAll(RGB_RE)) {
    if (!exceptedValue(normalizeAlpha(m[0]))) add(m.index, 'rgb', m[0]);
  }
  const dark = masked.match(DARK_SELECTOR_RE);
  if (dark) add(dark.index, 'dark-selector', '.dark');
  return residue;
}

function noteDeviation(deviations, value) {
  const key = value.toLowerCase();
  const d = deviations.get(key) ?? { value: key, count: 0 };
  d.count += 1;
  deviations.set(key, d);
}

export function transformCss(css, relFile, maps = {}) {
  const tokenMap = maps.tokenMap ?? TOKEN_MAP;
  const adjudicatedMap = maps.adjudicatedMap ?? ADJUDICATED_TOKEN_MAP;
  const fileOverrides = maps.fileOverrides ?? FILE_OVERRIDES;
  const alphaMap = maps.alphaMap ?? ALPHA_MAP;
  const gradientMap = maps.gradientMap ?? GRADIENT_MAP;
  const exceptions = maps.exceptions ?? EXCEPTIONS;
  const deviations = new Map();
  const stats = { plannedCommentsStripped: 0, danglingRewritten: 0, replaced: 0 };
  const normRel = relFile.replaceAll('\\', '/');
  const excepted = (value) => exceptions.has(`${normRel}:${value.toLowerCase()}`);
  const keptExceptions = new Set();
  // hex 查找链（hex pass / rgb 空格语法 pass / 悬空 fallback pass 共用，裁决 R6/R7）：
  // 文件级覆盖（B9/B16/B18 上下文拆分）→ 裁决映射 → seed 映射
  const lookup = (hex) => fileOverrides?.[normRel]?.[hex] ?? adjudicatedMap?.[hex] ?? tokenMap[hex];
  const note = (value) => noteDeviation(deviations, value);

  // 1) 计划注释删除（spec §3.4）
  let text = css.replace(PLANNED_COMMENT_RE, () => {
    stats.plannedCommentsStripped += 1;
    return '';
  });

  // 2) 切分代码段/注释段：只变换代码段，注释原样保留（注释内 hex 不替换、不计偏差）
  const segments = [];
  let i = 0;
  for (;;) {
    const open = text.indexOf('/*', i);
    if (open === -1) {
      segments.push({ code: text.slice(i) });
      break;
    }
    const close = text.indexOf('*/', open + 2);
    const end = close === -1 ? text.length : close + 2;
    if (open > i) segments.push({ code: text.slice(i, open) });
    segments.push({ comment: text.slice(open, end) });
    i = end;
    if (close === -1) break;
  }

  const mapCode = (code) => {
    // 渐变最先处理并用占位符屏蔽：未精确命中的渐变内的 hex/rgb 不得被后续 pass 单值替换（spec §9.7）
    const hidden = [];
    let out = code.replace(GRADIENT_RE, (whole) => {
      const key = whole.replace(/\s+/g, ' ').toLowerCase();
      if (gradientMap[key]) {
        stats.replaced += 1;
        return gradientMap[key];
      }
      hidden.push(whole);
      return `\u0000${hidden.length - 1}\u0000`;
    });
    out = out.replace(DANGLING_RE, (whole, fallback) => {
      const hex = fallback.startsWith('#') ? expandHex(fallback) : rgbSpaceToHex(fallback);
      // 裁决例外（如 B26 #fca5a5）：fallback 原样保留，整段 var() 不动、不记偏差（hex pass 照常豁免）
      if (hex && excepted(hex)) return whole;
      // hex 查找链未命中时，rgba fallback 查 ALPHA_MAP（R4/R5 裁决值，如 --chrome-hairline）
      const target = hex ? lookup(hex) : (alphaMap[normalizeAlpha(fallback)] ?? null);
      if (!target) {
        note(fallback);
        return whole;
      }
      stats.danglingRewritten += 1;
      return `var(${target})`;
    });
    out = out.replace(RGB_RE, (whole) => {
      const asHex = rgbSpaceToHex(whole);
      const solid = asHex ? lookup(asHex) : null;
      if (solid) {
        stats.replaced += 1;
        return `var(${solid})`;
      }
      const key = normalizeAlpha(whole);
      if (alphaMap[key]) {
        stats.replaced += 1;
        return `var(${alphaMap[key]})`;
      }
      note(whole);
      return whole;
    });
    out = out.replace(HEX_RE, (whole) => {
      const hex = expandHex(whole);
      if (excepted(hex)) {
        keptExceptions.add(whole.toLowerCase());
        return whole;
      }
      const target = lookup(hex);
      if (!target) {
        note(whole);
        return whole;
      }
      stats.replaced += 1;
      return `var(${target})`;
    });
    out = out.replace(/\u0000(\d+)\u0000/g, (_, n) => {
      const whole = hidden[Number(n)];
      note(`gradient: ${whole.replace(/\s+/g, ' ').toLowerCase()}`);
      return whole;
    });
    return out;
  };

  let output = '';
  for (const seg of segments) output += seg.code !== undefined ? mapCode(seg.code) : seg.comment;

  // 例外保留行的行尾豁免注入（裁决 R8）：在 \r\n 或 \n 前插入，已注入则跳过
  if (keptExceptions.size > 0) {
    output = output
      .split('\n')
      .map((line) => {
        const lower = line.toLowerCase();
        if (![...keptExceptions].some((h) => lower.includes(h))) return line;
        const hasCr = line.endsWith('\r');
        const body = (hasCr ? line.slice(0, -1) : line).replace(/[ \t]+$/, '');
        if (body.includes('stylelint-disable-line color-no-hex')) return line;
        return `${body}${STYLELINT_DISABLE_MARKER}${hasCr ? '\r' : ''}`;
      })
      .join('\n');
  }

  for (const d of deviations.values()) {
    const at = output.toLowerCase().indexOf(d.value);
    d.firstLine = at === -1 ? 0 : output.slice(0, at).split('\n').length;
  }
  return { output, deviations: [...deviations.values()], stats };
}

function scanDarkGuard() {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|html)$/.test(name)) {
        const src = readFileSync(p, 'utf8');
        src.split('\n').forEach((line, idx) => {
          if (/\bdark:[a-z]/i.test(line))
            offenders.push(`${p}:${idx + 1}: dark-variant ${line.trim().slice(0, 80)}`);
        });
      }
    }
  };
  walk(CSS_ROOT);
  return offenders;
}

function main(argv) {
  const mode = argv.includes('--write') ? 'write' : argv.includes('--check') ? 'check' : 'dry';
  const files = findCssFiles();

  if (mode === 'check') {
    const offenders = [];
    for (const f of files) {
      const rel = f.replaceAll('\\', '/');
      for (const r of scanResidue(readFileSync(f, 'utf8'), rel)) {
        offenders.push(`${f}:${r.line}: ${r.kind} ${r.value}`);
      }
    }
    offenders.push(...scanDarkGuard());
    if (offenders.length > 0) {
      console.error(`[hex-to-tokens] --check 失败：残留 ${offenders.length} 处`);
      for (const o of offenders) console.error(`  ${o}`);
      process.exit(1);
    }
    console.log('[hex-to-tokens] --check 通过：0 残留（spec §10.2 P1 门禁）');
    return;
  }

  let totalReplaced = 0;
  let totalDangling = 0;
  let totalComments = 0;
  let totalDeviations = 0;
  for (const f of files) {
    const rel = f.replaceAll('\\', '/');
    const { output, deviations, stats } = transformCss(readFileSync(f, 'utf8'), rel);
    totalReplaced += stats.replaced;
    totalDangling += stats.danglingRewritten;
    totalComments += stats.plannedCommentsStripped;
    totalDeviations += deviations.length;
    const changed =
      stats.replaced + stats.danglingRewritten + stats.plannedCommentsStripped + deviations.length >
      0;
    if (!changed) continue;
    console.log(
      `\n== ${rel}  (替换 ${stats.replaced} / 悬空改写 ${stats.danglingRewritten} / 删注释 ${stats.plannedCommentsStripped})`,
    );
    for (const d of deviations)
      console.log(`   偏差 ${d.value}  ×${d.count}  (首现 L${d.firstLine})`);
    if (mode === 'write') writeFileSync(f, output);
  }
  console.log(
    `\n[${mode === 'write' ? '--write' : 'dry-run'}] 替换 ${totalReplaced} / 悬空改写 ${totalDangling} / 删注释 ${totalComments}；未映射偏差 ${totalDeviations} 种`,
  );
  if (mode === 'dry') {
    console.log(
      '[dry-run] 未落盘。按 spec §3.2 dry-run 先行：偏差裁决（Task 3 checkpoint）后才允许 --write。',
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2));
}
