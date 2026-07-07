// v1.33.0 MINOR T2 — Override UI 的 Browse + Clear 按钮组。
//
// 之前 v1.32.1 PATCH 的 Override <details> 是半成品(无 Browse 按钮,
// 输入框 disabled)。本组件激活 Override UX,允许用户选 BSWMD 文件
// 来覆盖 launcher 的 autofill 默认值 (lesson
// disable-input-without-browse-button-is-debt)。
//
// 关联 lesson: presentational-dialog-parity-port-pattern — 本组件
// 自身不调 IPC,只把 IPC 调用封装到一个按钮 handler,让父 dialog
// (DcmConfigSuccessDialog) 不必直接 import window.autosarApi。

import { DCM_MODULE_SHORT_NAME } from '../../../core/bridge/dcmConstants.js';
import { arxmlModuleShortNames } from '../../arxml/arxmlModuleShortNames.js';

interface DcmConfigOverridePickerProps {
  readonly value: string;
  readonly onChange: (path: string) => void;
  readonly onCancel: () => void;
}

export function DcmConfigOverridePicker(props: DcmConfigOverridePickerProps): JSX.Element {
  const handleBrowse = async (): Promise<void> => {
    const result = await window.autosarApi.bswmdPick();
    if (result.kind === 'canceled') {
      props.onCancel();
      return;
    }
    // Sanity check: verify the picked file actually contains a Dcm BSWMD.
    const modules = arxmlModuleShortNames(result.content);
    if (!modules.includes(DCM_MODULE_SHORT_NAME)) {
      console.warn(
        `DcmConfigOverridePicker: picked file is not a valid Dcm BSWMD (modules: ${
          modules.join(', ') || 'none'
        })`,
      );
      props.onCancel();
      return;
    }
    props.onChange(result.path);
  };

  const handleClear = (): void => {
    props.onChange('');
  };

  return (
    <div className="dcm-config-override-picker">
      <button type="button" onClick={handleBrowse} data-testid="dcm-config-override-browse">
        Browse...
      </button>
      <button
        type="button"
        onClick={handleClear}
        disabled={props.value === ''}
        data-testid="dcm-config-override-clear"
      >
        Clear
      </button>
    </div>
  );
}
