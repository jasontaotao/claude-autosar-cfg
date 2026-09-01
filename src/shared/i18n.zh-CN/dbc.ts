// i18n — zh-CN bundle: dbc cluster.

import type { DbcMessages } from '../i18n/dbc.js';

export const DbcZhCN: DbcMessages = {
  // DbcViewer
  'dbc.viewer.title': 'DBC 网络',
  'dbc.viewer.close': '关闭',
  'dbc.viewer.version': '版本',
  'dbc.viewer.nodes': '节点',
  'dbc.viewer.messages': '报文',
  'dbc.viewer.column.id': 'ID',
  'dbc.viewer.column.name': '名称',
  'dbc.viewer.column.dlc': 'DLC',
  'dbc.viewer.column.transmitter': '发送节点',
  'dbc.viewer.column.signals': '信号数',
  'dbc.viewer.column.frame': '帧类型',
  'dbc.viewer.frame.standard': '标准帧',
  'dbc.viewer.frame.extended': '扩展帧',
  'dbc.viewer.errorTitle': 'DBC 解析失败',
  'dbc.open.failed': '打开 DBC 失败：{message}',
  'dbc.parse.failed': '解析 DBC 失败：{message}',

  // v1.23.0 MINOR T4 — DBC→Com-Stack 3-step wizard
  'dbc.import.wizard.title': '导入 DBC → Com 栈',
  'dbc.import.step.preview': '预览映射',
  'dbc.import.step.confirm': '确认应用',
  'dbc.import.menu.label': '导入 DBC → Com 栈…',
  'dbc.import.select.button': '选择 DBC 文件…',
  'dbc.import.preview.messages': '将导入 {count} 条消息',
  'dbc.import.preview.search': '搜索报文',
  'dbc.import.preview.filter.all': '全部帧',
  'dbc.import.preview.filter.standard': '标准帧',
  'dbc.import.preview.filter.extended': '扩展帧',
  'dbc.import.preview.noMatches': '没有符合筛选条件的报文',
  'dbc.import.preview.table.name': '名称',
  'dbc.import.preview.table.id': 'CAN ID',
  'dbc.import.preview.table.frame': '帧类型',
  'dbc.import.preview.table.dlc': 'DLC',
  'dbc.import.preview.table.transmitter': '发送节点',
  'dbc.import.preview.table.signals': '信号数',
  'dbc.import.preview.next': '下一步',
  'dbc.import.confirm.warning':
    '此操作将原子写入 3 个 ARXML 文件（Com / CanIf / PduR），目标节点 {targetNode}。',
  'dbc.import.confirm.apply': '应用',
  'dbc.import.confirm.applying': '正在应用…',
  'dbc.import.close': '关闭',
  'dbc.import.error.read': '读取 DBC 文件失败：{message}',
  'dbc.import.error.bridge': '桥映射失败：{message}',
  'dbc.import.error.write': '写入 3 个 ARXML 文件失败：{message}',
  // v1.23.1 T1 code-review MEDIUM-1 — see i18n.ts for the rationale.
  'dbc.import.error.write.rolledBack':
    '写入 3 个 ARXML 文件失败：{message}（已回滚，项目未变更，请重试）',
  'dbc.import.error.write.partial':
    '写入 3 个 ARXML 文件失败：{message}（部分回滚，请检查 git 状态）',
  'dbc.import.warning.noChanges': '导入完成，但没有新增条目（可能是全部已存在）。',
  'dbc.import.error.noMessages': 'DBC 中没有可导入的消息（缺少 BO_ 条目）。',
  'dbc.import.success': '成功导入 {count} 条消息',

  // v1.24.0 MINOR T3 — ODX→Diagnostic Extract export UI.
  'odx.export.diagnosticExtract.button': '导出诊断抽取',
  'odx.export.diagnosticExtract.exporting': '导出中…',
  'odx.export.diagnosticExtract.success.title': '诊断抽取已导出',
  'odx.export.diagnosticExtract.success.body':
    '已生成 {dtcCount} 个 DemEvent、{didCount} 个 DID、{routineCount} 个 Routine。',
  'odx.export.diagnosticExtract.error': '导出失败：{error}',
  // v1.24.0 T3.1 — mirrors the v1.23.1 T1 MEDIUM-1 DBC wizard
  // 2-key split. Both keys are 100% translated, no template-string
  // concatenation with hardcoded English parenthetical (per v1.23.1
  // T1 L1 i18n-bypass-pattern lesson).
  'odx.export.diagnosticExtract.error.write.rolledBack':
    '导出诊断抽取失败：{message}（已回滚，项目未变更，请重试）',
  'odx.export.diagnosticExtract.error.write.partial':
    '导出诊断抽取失败：{message}（部分回滚，请检查 git 状态）',
};
