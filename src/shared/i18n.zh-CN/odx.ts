// i18n — zh-CN bundle: odx cluster.

import type { OdxMessages } from '../i18n/odx.js';

export const OdxZhCN: OdxMessages = {
  'odx.viewer.title': 'ODX-D 诊断数据库',
  'odx.viewer.close': '关闭',
  'odx.viewer.tabs.dtc': 'DTC',
  'odx.viewer.tabs.did': 'DID',
  'odx.viewer.tabs.routine': '例程',
  'odx.viewer.stats.dtc': '{count} 个 DTC',
  'odx.viewer.stats.did': '{count} 个 DID',
  'odx.viewer.stats.routine': '{count} 个例程',
  'odx.viewer.dtc.id': 'ID',
  'odx.viewer.dtc.name': 'DOP 名称',
  'odx.viewer.dtc.code': '故障码',
  'odx.viewer.dtc.text': '诊断说明',
  'odx.viewer.did.id': 'ID',
  'odx.viewer.did.name': '名称',
  'odx.viewer.routine.id': 'ID',
  'odx.viewer.routine.name': '名称',
  'odx.viewer.empty': '此 ODX 文件中没有{kind}。',
  'odx.viewer.errorTitle': 'ODX 解析失败',
  'odx.open.failed': '打开 ODX 失败：{message}',
  'odx.parse.failed': '解析 ODX 失败：{message}',
  // v1.31.0 PATCH — Dcm config renderer UX
  'odx.export.dcmConfig.success.title': 'Dcm 配置生成成功',
  'odx.export.dcmConfig.success.body':
    '已生成 Dcm 配置：{dspCount} 个 DID + {routineCount} 个例程，共应用 {appliedStepCount} 个步骤',
  'odx.export.dcmConfig.success.close': '关闭',
  'odx.export.dcmConfig.error.bswmdUnreadable': '无法读取 BSWMD 文件：{message}',
  'odx.export.dcmConfig.error.odxUnreadable': '无法读取 ODX 文件：{message}',
  'odx.export.dcmConfig.error.odxParseFailed': 'ODX 解析失败：{message}',
  'odx.export.dcmConfig.error.bswmdMapMissing': 'BSWMD 缺少 Dcm 模块：{message}',
  'odx.export.dcmConfig.error.atomicWriteFailed': '写入失败：{message}',
  'odx.export.dcmConfig.error.unexpected': '发生意外错误：{message}',
  'odx.export.dcmConfig.error.dismiss': '关闭',
  'dcmConfig.action.generate': '生成 Dcm 配置',
  'dcmConfig.action.generateAria': '为 {name} 生成 Dcm 配置',
  'dcmConfig.error.noDcmBswmd': '需要先加载 Dcm BSWMD',
  'app.open.dcmConfig': '打开 Dcm 配置',
  'app.open.dcmConfig.busy': '生成中…',
  // v1.32.0 MINOR T7 — ODX-D picker + bswmdPath autofill label
  // (picker.title removed in v1.32.1 PATCH P3 — unused, OS owns the title).
  'dcmConfig.picker.cancelled': '已取消 ODX 选择',
  'dcmConfig.bswmdPath.autofill': '已从项目清单自动选择',
  'dcmConfig.bswmdPath.override': '覆盖 BSWMD 路径',
  // v1.33.0 MINOR T7 — applied step count surface (SuccessDialog).
  'dcmConfig.appliedCount.summary': '已应用 {count} 行 xlsx 数据',
};
