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
  'dbc.viewer.errorTitle': 'DBC 解析失败',
  'dbc.open.failed': '打开 DBC 失败：{message}',
  'dbc.parse.failed': '解析 DBC 失败：{message}',

  // v1.23.0 MINOR T4 — DBC→Com-Stack 3-step wizard
  'dbc.import.wizard.title': '导入 DBC → Com 栈',
  'dbc.import.step.preview': '预览映射',
  'dbc.import.step.confirm': '确认应用',
  'dbc.import.menu.label': '导入 DBC → Com 栈…',
  'dbc.import.menu.icon': '📥',
  'dbc.import.select.button': '选择 DBC 文件…',
  'dbc.import.preview.messages': '将导入 {count} 条消息',
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
  'dbc.import.success': '成功导入 {count} 条消息',
};
