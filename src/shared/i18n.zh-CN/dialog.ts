// i18n — zh-CN bundle: dialog cluster.

import type { DialogMessages } from '../i18n/dialog.js';

export const DialogZhCN: DialogMessages = {
  // common
  'common.cancel': '取消',
  'common.save': '保存',
  'common.errorPrefix': '{label}失败: {message}',
  'common.errorPrefixEn': '{label} failed: {message}',

  // confirm dialog
  'confirm.unsaved.title': '未保存的更改',
  'confirm.unsaved.message': '当前项目 {name} 有未保存的更改。\n新建项目将丢失这些更改。',
  'confirm.unsaved.continue': '继续编辑',
  'confirm.unsaved.discard': '不保存，新建',
  'confirm.unsaved.saveAndNew': '保存并新建',

  // prompt dialog
  'prompt.cancel': '取消',
  'prompt.confirm': '确定',

  // confirm dialog — per-action variants
  'confirm.unsaved.message.new': '当前项目 {name} 有未保存的更改。\n新建项目将丢失这些更改。',
  'confirm.unsaved.message.open': '当前项目 {name} 有未保存的更改。\n打开其他项目将丢失这些更改。',
  'confirm.unsaved.message.addBswmd':
    '当前项目 {name} 有未保存的更改。\n添加 BSWMD 将丢失这些更改。',
  'confirm.unsaved.message.removeBswmd':
    '当前项目 {name} 有未保存的更改。\n移除 BSWMD {target} 将丢失这些更改。',
  'confirm.unsaved.message.deleteModule':
    '当前项目 {name} 有未保存的更改。\n删除 ECUC 模块 {target} 将丢失这些更改。',
  'confirm.unsaved.message.import': '当前项目 {name} 有未保存的更改。\n导入 ARXML 将丢失这些更改。',
  'confirm.unsaved.discard.new': '不保存，新建',
  'confirm.unsaved.discard.open': '不保存，打开',
  'confirm.unsaved.discard.addBswmd': '不保存，添加',
  'confirm.unsaved.discard.removeBswmd': '不保存，移除',
  'confirm.unsaved.discard.deleteModule': '不保存，删除',
  'confirm.unsaved.discard.excludeEcuc': '不保存，排除',
  'confirm.unsaved.saveAndNew.new': '保存并新建',
  'confirm.unsaved.saveAndNew.open': '保存并打开',
  'confirm.unsaved.saveAndNew.addBswmd': '保存并添加',
  'confirm.unsaved.saveAndNew.removeBswmd': '保存并移除',
  'confirm.unsaved.saveAndNew.deleteModule': '保存并删除',
  'confirm.unsaved.saveAndNew.excludeEcuc': '保存并排除',
  'confirm.unsaved.saveAndNew.import': '保存并导入',

  // overwrite-confirm dialog
  'confirm.overwrite.title': '文件已存在',
  'confirm.overwrite.message': '文件 {path} 已存在。\n是否覆盖现有项目？',
  'confirm.overwrite.continueLabel': '重命名',
  'confirm.overwrite.discardLabel': '覆盖',

  // error envelopes
  'error.applyMutation.plan-invalid': '无效的变更计划: {violations}',
  'error.applyMutation.reference-cycle': '检测到引用循环: {from} → {to}',
  'error.applyMutation.multiplicity-violation':
    '{path} 处多重性违规: 期望 {required}，实际 {actual}',
  'error.applyMutation.concurrent-mutation': '检测到并发变更: {planId} 与 {conflictingPlanId} 冲突',
};
