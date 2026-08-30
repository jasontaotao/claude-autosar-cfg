#!/usr/bin/env node
// scripts/codemod/hex-to-tokens.mjs — P1 色值收敛 codemod（spec §3.2 / §10.3）。
//
// 模式：
//   （无参数）  dry-run：输出每个文件的替换预览 + 偏差清单，不落盘
//   --write    落盘
//   --check    残留裸值即 exit 1（P1 门禁，spec §10.2）
//
// 映射语义 = 纯值映射（spec §9.7）。TOKEN_MAP / ALPHA_MAP / GRADIENT_MAP / EXCEPTIONS
// 是映射的唯一数据源，实施者不得另建映射。T3 偏差裁决后把裁决结果填入
// ALPHA_MAP / GRADIENT_MAP / EXCEPTIONS（seed TOKEN_MAP 不动）。

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

/** alpha/overlay 值映射；key = 空白归一化后的小写 rgba 串。T3 裁决前为空（§3.2 dry-run 先行）。 */
export const ALPHA_MAP = {};

/** 整条渐变映射；key = 空白归一化后的小写渐变串。T3 裁决前为空。 */
export const GRADIENT_MAP = {};

/** 用户裁决「保留原值」的豁免；元素形如 `<相对路径>:<小写色值>`。T3 裁决前为空。 */
export const EXCEPTIONS = new Set();

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_RE = /rgba?\([^)]*\)/gi;
const DANGLING_RE = /var\(--color-[a-z0-9-]+,\s*(#[0-9a-fA-F]{3,8}|rgba?\([0-9a-z.,\s%]+\))\s*\)/gi;
// 连同注释前的空白一起删除，避免残留尾随空格（spec §3.4）
const PLANNED_COMMENT_RE = /\s*\/\*\s*--color-[^*]*\*\//g;
const GRADIENT_RE = /linear-gradient\([^;]*?\)/gi;
const DARK_SELECTOR_RE = /\.dark[\s{.,:[>#]/;

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

/** --check 残留扫描：hex/rgb/悬空 var/计划注释/.dark 选择器；注释内 hex 不计。 */
export function scanResidue(css) {
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
  for (const m of maskedVars.matchAll(HEX_RE)) add(m.index, 'hex', m[0]);
  for (const m of maskedVars.matchAll(RGB_RE)) add(m.index, 'rgb', m[0]);
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
  const alphaMap = maps.alphaMap ?? ALPHA_MAP;
  const gradientMap = maps.gradientMap ?? GRADIENT_MAP;
  const exceptions = maps.exceptions ?? EXCEPTIONS;
  const deviations = new Map();
  const stats = { plannedCommentsStripped: 0, danglingRewritten: 0, replaced: 0 };
  const excepted = (value) =>
    exceptions.has(`${relFile.replaceAll('\\', '/')}:${value.toLowerCase()}`);
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
      const target = hex ? tokenMap[hex] : null;
      if (!target) {
        note(fallback);
        return whole;
      }
      stats.danglingRewritten += 1;
      return `var(${target})`;
    });
    out = out.replace(RGB_RE, (whole) => {
      const asHex = rgbSpaceToHex(whole);
      if (asHex && tokenMap[asHex]) {
        stats.replaced += 1;
        return `var(${tokenMap[asHex]})`;
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
      if (excepted(hex)) return whole;
      const target = tokenMap[hex];
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
      for (const r of scanResidue(readFileSync(f, 'utf8'))) {
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
