import { existsSync } from 'node:fs';

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

// `pnpm dev` launches the renderer in Vite HMR mode but runs main + preload
// from prebuilt `dist/main/index.js` and `dist/preload/index.cjs` (Vite does
// not serve main/preload in dev). Fresh clones don't have `dist/` yet, so
// fail fast with a clear next step instead of letting Electron silently
// miss its entry.
if (!existsSync('dist/main/index.js') || !existsSync('dist/preload/index.cjs')) {
  console.error(
    '[dev] Missing dist/main/index.js or dist/preload/index.cjs.\n' +
      '      Run `pnpm build` once before `pnpm dev` (fast: ~5-10s).',
  );
  process.exit(1);
}

// Resolve the Electron binary path from the local `electron` npm package.
// On Windows `require('electron')` returns e.g.
//   `D:\…\node_modules\electron\dist\electron.exe`
// which `spawn()` can launch directly — no `npx` wrapper, no `.cmd` shell
// dance. `spawn('npx', …)` failed with ENOENT on Windows because node's
// `spawn()` does not search for `.cmd` shims unless `shell: true` is set,
// and `npx.cmd` is what npm installs in `node_modules/.bin/`.
const electronBin = createRequire(import.meta.url)('electron');

const server = await createServer({
  configFile: './vite.renderer.config.ts',
  server: { port: 5173, strictPort: true },
});
await server.listen();
const url = `http://localhost:5173`;
process.env.VITE_DEV_SERVER_URL = url;

const electron = spawn(electronBin, ['dist/main/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

electron.on('close', () => {
  server.close();
  process.exit(0);
});
