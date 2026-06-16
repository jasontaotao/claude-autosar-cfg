import { promises as fs } from 'node:fs';

import { dialog, ipcMain } from 'electron';

import { parseArxml } from '../../core/arxml/parser.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import type {
  FileError,
  OpenArxmlMultiResult,
  OpenArxmlResult,
  ParseArxmlRequest,
  ParseArxmlResponse,
  SaveArxmlRequest,
  SaveArxmlResponse,
} from '../../shared/types.js';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PING, async () => {
    return { ok: true, ts: Date.now() };
  });

  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, async () => {
    return '0.9.5';
  });

  ipcMain.handle(
    IPC_CHANNELS.OPEN_ARXML,
    async (_evt, opts?: { readonly title?: string }): Promise<OpenArxmlResult> => {
      const result = await dialog.showOpenDialog({
        title: opts?.title ?? 'Open ARXML',
        properties: ['openFile'],
        filters: [
          { name: 'ARXML', extensions: ['arxml'] },
          { name: 'XML', extensions: ['xml'] },
          { name: 'All', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }
      const path = result.filePaths[0]!;
      try {
        const content = await fs.readFile(path, 'utf8');
        return { canceled: false, path, content };
      } catch (err) {
        // Surface error via dialog but keep Result shape
        await dialog.showMessageBox({
          type: 'error',
          title: 'Failed to read ARXML',
          message: err instanceof Error ? err.message : String(err),
        });
        return { canceled: true };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PARSE_ARXML,
    async (_evt, req: ParseArxmlRequest): Promise<ParseArxmlResponse> => {
      return parseArxml(req.content);
    },
  );

  // Sprint 10 #2 — multi-file open. Returns a discriminated union so the
  // renderer can distinguish "user canceled" from "all opened" from
  // "some opened, some failed" from "OS-level read error". Replaces the
  // silent-failure pattern where a read-failure was collapsed into a
  // canceled result (silent-failure-hunter finding #4).
  ipcMain.handle(
    IPC_CHANNELS.OPEN_ARXML_MULTI,
    async (_evt, opts?: { readonly title?: string }): Promise<OpenArxmlMultiResult> => {
      const result = await dialog.showOpenDialog({
        title: opts?.title ?? 'Open ARXML',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'ARXML', extensions: ['arxml'] },
          { name: 'XML', extensions: ['xml'] },
          { name: 'All', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { kind: 'canceled' };
      }
      const opened: { path: string; content: string }[] = [];
      const failed: { path: string; message: string }[] = [];
      for (const path of result.filePaths) {
        try {
          const content = await fs.readFile(path, 'utf8');
          opened.push({ path, content });
        } catch (err) {
          failed.push({
            path,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (failed.length === 0) {
        return { kind: 'opened', results: opened };
      }
      if (opened.length === 0) {
        return {
          kind: 'read-failed',
          message: failed.map((f) => `${f.path}: ${f.message}`).join('\n'),
        };
      }
      return { kind: 'partial', opened, failed };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SAVE_ARXML,
    async (_evt, req: SaveArxmlRequest): Promise<SaveArxmlResponse> => {
      const defaultName = req.defaultName ?? 'untitled.arxml';
      const result = await dialog.showSaveDialog({
        title: 'Save ARXML',
        defaultPath: defaultName,
        filters: [{ name: 'ARXML', extensions: ['arxml'] }],
      });
      if (result.canceled || result.filePath === undefined) {
        return { ok: true, value: { canceled: true } };
      }
      const path = result.filePath;
      const serialized = serializeArxml(req.doc);
      if (!serialized.ok) {
        const err: FileError = {
          kind: 'write-failed',
          message: serialized.error.message,
        };
        return { ok: false, error: err };
      }
      try {
        await fs.writeFile(path, serialized.value, 'utf8');
        return { ok: true, value: { canceled: false, path } };
      } catch (e) {
        const err: FileError = {
          kind: 'write-failed',
          message: e instanceof Error ? e.message : String(e),
        };
        return { ok: false, error: err };
      }
    },
  );
}
