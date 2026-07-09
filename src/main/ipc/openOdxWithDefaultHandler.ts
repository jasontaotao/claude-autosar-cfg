// v1.33.0 MINOR T3 — odx:open-with-default IPC handler.
//
// 之前 DcmConfigPicker 调 openOdx()（无参,用户每次从 user-home 起始
// 选文件）。v1.33.0 新增本通道,允许 renderer 传 defaultPath,让 OS
// dialog 打开时定位到项目根目录(lesson
// additive-ipc-channels-over-extending-args — 不扩 openOdx() args,
// 走新通道避免 breaking change)。
//
// Shape: {defaultPath?, filters?} → {kind: 'opened'|'canceled'|'read-failed'}.
// filters 透传给 dialog.showOpenDialog;默认 .odx only (matches
// v1.22.0 openOdxHandler 的 default behavior)。
//
// v1.40.0 MINOR T1 (H1) — read uses the shared `readFileWithCap`
// helper (32 MiB cap). Both `too-large` and `read-failed` fold into
// the IPC-level `read-failed` envelope to preserve the renderer
// contract.

import { dialog, ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenOdxWithDefaultRequest, OpenOdxWithDefaultResult } from '../../shared/types.js';

import { readFileWithCap } from './sizeCap.js';

export async function openOdxWithDefaultDialog(
  req: OpenOdxWithDefaultRequest,
): Promise<OpenOdxWithDefaultResult> {
  const result = await dialog.showOpenDialog({
    title: 'Select ODX-D file',
    ...(req.defaultPath !== undefined ? { defaultPath: req.defaultPath } : {}),
    properties: ['openFile'],
    filters: req.filters?.map((f) => ({
      name: f.name,
      extensions: [...f.extensions],
    })) ?? [{ name: 'ODX', extensions: ['odx'] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { kind: 'canceled' };
  }
  const path = result.filePaths[0]!;
  const read = await readFileWithCap(path);
  if (read.ok) {
    return { kind: 'opened', path, content: read.content };
  }
  await dialog.showMessageBox({
    type: 'error',
    title: 'Failed to read ODX',
    message: read.message,
  });
  return {
    kind: 'read-failed',
    message: read.message,
  };
}

export function registerOpenOdxWithDefaultHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.ODX_OPEN_WITH_DEFAULT,
    async (_event, req: OpenOdxWithDefaultRequest): Promise<OpenOdxWithDefaultResult> =>
      openOdxWithDefaultDialog(req),
  );
}
