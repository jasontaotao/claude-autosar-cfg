// v1.33.0 MINOR T3 -- odx:open-with-default IPC handler.
//
// v1.52.0 MINOR T1: the picker+read+messagebox body was extracted
// to `src/main/io/pickFile.ts:pickFileWithCap`. The handler now
// delegates the entire shape to the helper, threading through
// `defaultPath` + `filters` from the request payload (a v1.33.0
// additive shape).

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type { OpenOdxWithDefaultRequest, OpenOdxWithDefaultResult } from '../../shared/types.js';
import { pickFileWithCap } from '../io/pickFile.js';

export async function openOdxWithDefaultDialog(
  req: OpenOdxWithDefaultRequest,
): Promise<OpenOdxWithDefaultResult> {
  return pickFileWithCap({
    title: 'Select ODX-D file',
    failureTitle: 'Failed to read ODX',
    ...(req.defaultPath !== undefined ? { defaultPath: req.defaultPath } : {}),
    filters: req.filters?.map((f) => ({
      name: f.name,
      extensions: [...f.extensions],
    })) ?? [{ name: 'ODX', extensions: ['odx'] }],
  });
}

export function registerOpenOdxWithDefaultHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.ODX_OPEN_WITH_DEFAULT,
    async (_event, req: OpenOdxWithDefaultRequest): Promise<OpenOdxWithDefaultResult> =>
      openOdxWithDefaultDialog(req),
  );
}
