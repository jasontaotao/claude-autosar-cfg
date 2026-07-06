// v1.30.0 MINOR — minimal Dcm config trigger component.
//
// Renders a single "Generate Dcm Config" button that calls
// `window.autosarApi.dcmConfig({odxPath, xlsxRows, bswmdPath?})`
// and surfaces the IpcResult in a `<pre>` block.
//
// This is intentionally MINIMAL — no Dialog, no toast, no animation.
// Full success dialog (`DcmConfigSuccessDialog.tsx`) and the renderer-
// wide integration (`ContextMenu.tsx`, `AppHeader.tsx`, ODX file
// picker) land in the 1.31.0 PATCH. v1.30.0 only commits the wire-up
// so the IPC bridge has at least one consumer at the renderer layer
// (otherwise the channel is dead-on-arrival from the renderer's POV).

import { useState } from 'react';

import type { DcmConfigHandlerResult, EcucInstanceRow } from '../../../shared/types.js';

export interface DcmConfigTriggerProps {
  /** Absolute path of the ODX-D file. */
  readonly odxPath: string;
  /** xlsx rows (the 5 Dcm service kinds + per-row params). */
  readonly xlsxRows: readonly EcucInstanceRow[];
  /**
   * v1.30.0 MINOR — optional real-OEM BSWMD override. When set,
   * the IPC bridge skips the sample-fixture discovery walk and
   * reads this file directly. Defaults to undefined (legacy
   * v1.27.0 behavior — sample-fixture discovery).
   */
  readonly bswmdPath?: string;
}

/**
 * Minimal button + `<pre>` result surface. The `<pre>` shows the
 * raw IpcResult so a future iteration that wires up a Dialog can
 * swap the surface without touching the IPC contract.
 */
export function DcmConfigTrigger({
  odxPath,
  xlsxRows,
  bswmdPath,
}: DcmConfigTriggerProps): JSX.Element {
  const [result, setResult] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const onClick = async (): Promise<void> => {
    setPending(true);
    try {
      // Cast through `unknown` to bypass the augmented `Window.autosarApi`
      // type (which is a strict object type defined elsewhere in
      // `useCreateEcucFromBswmd.ts`). The runtime contract is the
      // preload bridge — TS-level type assertion is the standard
      // pattern when interacting with that bridge from a leaf component.
      const res = await (
        window as unknown as {
          autosarApi: {
            dcmConfig: (
              req: unknown,
            ) => Promise<
              | { readonly ok: true; readonly value: DcmConfigHandlerResult }
              | { readonly ok: false; readonly error: { readonly message: string } }
            >;
          };
        }
      ).autosarApi.dcmConfig({
        odxPath,
        xlsxRows,
        bswmdPath,
      });
      setResult(res);
    } finally {
      setPending(false);
    }
  };

  return (
    <div data-testid="dcm-config-trigger">
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
        disabled={pending || odxPath.length === 0}
      >
        {pending ? 'Generating…' : 'Generate Dcm Config'}
      </button>
      {result !== null && (
        <pre data-testid="dcm-config-result">{JSON.stringify(result, null, 2)}</pre>
      )}
    </div>
  );
}
