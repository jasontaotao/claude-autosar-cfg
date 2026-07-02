#!/usr/bin/env node
// gen-icons.mjs — 从主源 SVG 派生多尺寸 PNG + Windows .ico。
//
// 输入：`src/renderer/assets/autosarcfg-logo.svg`（手写设计源）
// 输出：
//   - `src/renderer/assets/autosarcfg-icon-{16,32,48,64,128,256}.png`（备用）
//   - `src/renderer/assets/autosarcfg-icon.png`（32x32，main process 加载用）
//   - `build/icon.ico`（electron-builder 用）
//
// 工具链：sharp（SVG → PNG 栅格化）+ to-ico（PNG → ICO 多尺寸容器）。
//
// 用法：`pnpm gen-icons`（在 install 之后）。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const svgPath = join(root, 'src/renderer/assets/autosarcfg-logo.svg');
const assetsDir = join(root, 'src/renderer/assets');
const buildDir = join(root, 'build');

const SIZES = [16, 32, 48, 64, 128, 256];

async function main() {
  let svgBuffer;
  try {
    svgBuffer = await readFile(svgPath);
  } catch (e) {
    console.error(`gen-icons: cannot read source SVG at ${svgPath}`);
    console.error(`  ${(e instanceof Error ? e.message : String(e))}`);
    process.exit(1);
  }
  if (svgBuffer.length === 0) {
    console.error(`gen-icons: source SVG at ${svgPath} is empty`);
    process.exit(1);
  }
  console.log(`gen-icons: source SVG ${svgBuffer.length} bytes`);

  // Render every required size to a PNG buffer in parallel.
  const pngBuffers = await Promise.all(
    SIZES.map(async (size) => {
      return sharp(svgBuffer).resize(size, size).png().toBuffer();
    }),
  );

  await mkdir(assetsDir, { recursive: true });
  for (let i = 0; i < SIZES.length; i++) {
    const size = SIZES[i];
    const buf = pngBuffers[i];
    const outPath = join(assetsDir, `autosarcfg-icon-${size}.png`);
    await writeFile(outPath, buf);
    console.log(`  PNG ${size}x${size} → ${outPath} (${buf.length} bytes)`);
  }

  // 32x32 is the conventional main-process icon size.
  const mainIconPath = join(assetsDir, 'autosarcfg-icon.png');
  await writeFile(mainIconPath, pngBuffers[1]);
  console.log(`  PNG 32x32 → ${mainIconPath} (main-process icon)`);

  // Mirror the main-process icon into src/main/assets/ so the Vite
  // `publicDir` for the main build (see vite.main.config.ts) picks it up
  // and copies it to dist/main/assets/autosarcfg-icon.png at build time.
  // src/main/ is normally renderer-free, but the assets/ subtree is the
  // documented seam where main-process static files live (analogue of
  // renderer/public/).
  const mainMirrorDir = join(root, 'src/main/assets');
  await mkdir(mainMirrorDir, { recursive: true });
  const mainMirrorPath = join(mainMirrorDir, 'autosarcfg-icon.png');
  await writeFile(mainMirrorPath, pngBuffers[1]);
  console.log(`  PNG 32x32 → ${mainMirrorPath} (main-process build mirror)`);

  // Build a multi-size .ico from every rendered PNG.
  const icoBuffer = await toIco(pngBuffers);
  await mkdir(buildDir, { recursive: true });
  const icoPath = join(buildDir, 'icon.ico');
  await writeFile(icoPath, icoBuffer);
  console.log(`  ICO multi-size → ${icoPath} (${icoBuffer.length} bytes)`);

  console.log('gen-icons: done.');
}

main().catch((err) => {
  console.error('gen-icons: failed:', err);
  process.exit(1);
});