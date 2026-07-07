// v1.32.0 MINOR T6 — Dcm 配置流程的 ODX 文件选择薄封装组件。
//
// 本组件无 JSX 渲染输出（返回 null）。存在目的：把 openOdx() 的 IPC 调用
// 封装到一个独立的生命周期单元中，让上游 launcher 不必直接依赖
// window.autosarApi（对应 lesson presentational-dialog-parity-port-pattern）。
//
// 技术细节（English）：
//   - The `mountedRef` guard (lines ~46-47) protects against React 19
//     strict-mode's double-invocation of the mount effect (lesson
//     re-entrancy-guard-via-useref-not-setstate-callback-state).
//   - `openOdx()` IPC takes no arguments; the .odx$ filter is hardcoded
//     in openOdxHandler.ts:28-60. A future odx:open-with-default IPC
//     (v1.33.0+) would let the renderer pass project-root hints.

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
