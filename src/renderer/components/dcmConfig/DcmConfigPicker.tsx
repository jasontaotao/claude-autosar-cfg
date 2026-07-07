// v1.32.0 MINOR T6 — thin wrapper around openOdx() IPC for the Dcm config flow.
//
// No JSX of its own. The component render-gates the openOdx() invocation
// so the launcher doesn't import window.autosarApi directly (lesson
// presentational-dialog-parity-port-pattern).
//
// React 19 strict-mode invokes the mount effect twice. A `mountedRef`
// guard (lesson re-entrancy-guard-via-useref-not-setstate-callback-state)
// ensures openOdx fires exactly once per logical mount.
//
// openOdx() IPC takes no arguments — defaultPath and filters are
// hardcoded in openOdxHandler.ts:28-60. A future odx:open-with-default
// IPC would let the renderer pass project-root hints (v1.33.0+).

import { useEffect, useRef } from 'react';

interface DcmConfigPickerProps {
  readonly locale: 'en' | 'zh-CN';
  readonly onResolve: (odxPath: string) => void | Promise<void>;
  readonly onCancel: () => void;
}

export function DcmConfigPicker(_props: DcmConfigPickerProps): null {
  const mountedRef = useRef(false);
  const propsRef = useRef(_props);
  propsRef.current = _props;

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    void (async () => {
      const result = await window.autosarApi.openOdx();
      const { onResolve, onCancel } = propsRef.current;
      if (result.kind === 'opened') {
        await onResolve(result.path);
      } else if (result.kind === 'canceled') {
        onCancel();
      } else {
        // 'read-failed' — the OS dialog has already shown the error.
        console.warn(`DcmConfigPicker: ODX read failed: ${result.message}`);
        onCancel();
      }
    })();
  }, []);

  return null;
}