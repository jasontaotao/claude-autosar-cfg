#!/usr/bin/env node
// copy-main-assets.mjs — 把 main process 需要的静态资源从源目录复制到
// Vite main build 的产物目录。
//
// 为什么需要这个脚本：
//   Vite 的 `build.lib` 模式（main bundle 用法）会**静默忽略 publicDir**。
//   也就是说 `vite.main.config.ts` 里设的 `publicDir` 在 lib 模式下
//   不生效，源目录里的资产不会自动复制到 `dist/main/`。这个脚本是
//   `build:main` 流水线的前置步骤，显式做这件事。
//
// 当前复制的内容：
//   - src/main/assets/autosarcfg-icon.png → dist/main/assets/autosarcfg-icon.png
//   （用于 BrowserWindow 的 taskbar / Alt-Tab 图标）
//
// 依赖：`scripts/gen-icons.mjs` 必须先跑过，否则源文件不存在。

import { copyFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

const COPIES = [
  {
    from: join(root, 'src/main/assets/autosarcfg-icon.png'),
    to: join(root, 'dist/main/assets/autosarcfg-icon.png'),
  },
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let copiedCount = 0;
  for (const { from, to } of COPIES) {
    if (!(await exists(from))) {
      console.error(`copy-main-assets: source missing at ${from}`);
      console.error(`  run \`pnpm gen-icons\` first to generate the source PNGs.`);
      process.exit(1);
    }
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    console.log(`  ${from.replace(`${root}/`, '')} → ${to.replace(`${root}/`, '')}`);
    copiedCount++;
  }
  console.log(`copy-main-assets: done (${copiedCount} file${copiedCount === 1 ? '' : 's'}).`);
}

main().catch((err) => {
  console.error('copy-main-assets: failed:', err);
  process.exit(1);
});