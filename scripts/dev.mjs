import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer({
  configFile: './vite.renderer.config.ts',
  server: { port: 5173, strictPort: true },
});
await server.listen();
const url = `http://localhost:5173`;
process.env.VITE_DEV_SERVER_URL = url;

const electron = spawn('npx', ['electron', 'dist/main/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

electron.on('close', () => {
  server.close();
  process.exit(0);
});