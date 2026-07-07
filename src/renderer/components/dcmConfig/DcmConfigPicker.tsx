// v1.33.0 MINOR T3 — Dcm 配置流程的 ODX 文件选择薄封装组件。
//
// 本组件无 JSX 渲染输出（返回 null）。存在目的：把 odx:open-with-default
// 的 IPC 调用封装到一个独立的生命周期单元中，让上游 launcher 不必直接
// 依赖 window.autosarApi（对应 lesson presentational-dialog-parity-port-pattern）。
//
// 技术细节（English）：
//   - The `mountedRef` guard (lines ~46-47) protects against React 19
//     strict-mode's double-invocation of the mount effect (lesson
//     re-entrancy-guard-via-useref-not-setstate-callback-state).
//   - `openOdxWithDefault({ defaultPath })` IPC accepts a defaultPath
//     hint so the OS dialog opens at the project root (v1.33.0+). The
//     IPC envelope is additive on the wire (lesson
//     additive-ipc-channels-over-extending-args) — the v1.22.0
//     `odx:open` channel is preserved; this component migrated to the
//     new channel and gained a `defaultPath?` prop.

import { useEffect, useRef } from 'react';

interface DcmConfigPickerProps {
  readonly locale: 'en' | 'zh-CN';
  readonly onResolve: (odxPath: string) => void | Promise<void>;
  readonly onCancel: () => void;
  /**
   * v1.33.0 MINOR T3 — absolute path the OS dialog should open at.
   * Typically the open project's manifest directory. Optional; when
   * omitted, the OS dialog falls back to its default starting location.
   */
  readonly defaultPath?: string;
}

export function DcmConfigPicker(_props: DcmConfigPickerProps): null {
  const mountedRef = useRef(false);
  const propsRef = useRef(_props);
  propsRef.current = _props;

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    void (async () => {
      const result = await window.autosarApi.openOdxWithDefault({
        defaultPath: propsRef.current.defaultPath,
      });
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
