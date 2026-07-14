// i18n — zh-CN bundle: validation cluster.

import type { ValidationMessages } from '../i18n/validation.js';

export const ValidationZhCN: ValidationMessages = {
  // validation
  'validation.title': '校验',
  'validation.allPassed': '全部检查通过',
  'validation.subtitle': '已应用 ECUC 子集架构。修改参数可重新校验。',
  'validation.violation': '{count} 项违规',
  'validation.violations': '{count} 项违规',

  // SWS Validator
  'swsValidator.SWS_COM_PDUID_UNIQUE.short': 'Com PduId 重复: {pduName}',
  'swsValidator.SWS_COM_PDUID_UNIQUE.long':
    'ComConfig {configName} 内 ComPdu {pduName} 的 ComPduId {pduId} 重复。',
  'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short': 'PduR 路由路径不完整: {pathName}',
  'swsValidator.SWS_PDUR_ROUTING_COMPLETE.long': 'PduRRoutingPath {pathName} 缺少 {missing}。',
  'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short': '容器实例数不足: {containerName}',
  'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.long':
    '容器 {containerName} 实际 {actual} 个实例，少于 lowerMultiplicity {min}。',
  'swsValidator.SWS_BSWMD_DEPS_PRESENT.short': 'BSWMD 模块依赖缺失: {moduleName}',
  'swsValidator.SWS_BSWMD_DEPS_PRESENT.long': '模块 {moduleName} 引用了未定义的模块 {missingDep}。',
  'swsValidator.runtimeError': '规则 {ruleId} 运行失败: {message}',
  'swsValidator.timedOut': '规则 {ruleId} 执行超时',
  'swsValidator.panel.title': 'SWS 校验',
  'swsValidator.panel.empty': '无校验结果。',
  'swsValidator.panel.running': '校验中...',
  'swsValidator.panel.paused': '引导中，已暂停校验',
  'swsValidator.panel.disabled': 'SWS 校验已关闭（experimental.swsValidator）',
  'swsValidator.panel.errorBadge': '{count} 项错误',
  'swsValidator.panel.warningBadge': '{count} 项警告',
  'swsValidator.panel.severity.error': '错误',
  'swsValidator.panel.severity.warning': '警告',
  'swsValidator.panel.severity.info': '提示',
  'swsValidator.panel.toggleAria': '切换 SWS 校验面板',
  'swsValidator.panel.filter.all': '全部',
  'swsValidator.panel.filter.error': '错误',
  'swsValidator.panel.filter.warning': '警告',

  // bswmd parser
  'bswmdParser.xmlMalformed': 'BSWMD XML 格式错误: {message}',
  'bswmdParser.missingRoot': 'BSWMD 缺少根元素 <AUTOSAR>',
  'bswmdParser.unsupportedVersion': 'BSWMD 不支持的 AUTOSAR 版本: {version}',
  'bswmdParser.invalidStructure': 'BSWMD 结构错误 ({path}): {message}',

  // ARXML parse errors
  'parserError.xmlMalformed': 'XML 格式错误: {message}',
  'parserError.missingRoot': '缺少根元素: {message}',
  'parserError.unsupportedVersion': '不支持的 AUTOSAR 版本: {version}',
  'parserError.invalidStructure': '结构错误 {path}: {message}',

  // mutation errors / actions / info
  'mutation.error.path-not-found': '操作失败：路径不存在',
  'mutation.error.name-conflict': "名称冲突：'{shortName}' 已存在",
  'mutation.error.multiplicity-exceeded': '已达最大实例数 ({current}/{max})',
  'mutation.error.multiplicity-floor': '不能低于最小实例数 ({current}/{min})',
  'mutation.error.no-bswmd-for-module': '需要先加载 BSWMD',
  'mutation.error.invalid-param-type': "参数 '{key}' 未在 BSWMD 中定义",
  'mutation.error.module-not-found': "找不到 ECUC 模块 '{path}'",
  'mutation.error.removeDocument-not-found': "未加载 ARXML '{path}',无法移除",
  'mutation.error.removeBswmd-not-found': "未加载 BSWMD '{path}',无法移除",
  'mutation.action.addContainer': '添加子容器',
  'mutation.action.addParameter': '添加参数',
  'mutation.action.addReference': '添加引用',
  'mutation.action.delete': "删除 '{name}'",
  'mutation.action.deleteParameter': '删除参数',
  'mutation.action.removeModule': '移除 BSWMD',
  'mutation.action.removeModuleAria': "移除 BSWMD '{name}'",
  'mutation.action.undo': '撤销',
  'mutation.action.bswmdRemoved': "已移除 BSWMD '{name}'",
  'mutation.action.undoFailed': '撤销失败：BSWMD 已恢复或被替换',
  'mutation.action.deleteModule': "删除 ECUC 模块 '{name}'",
  'mutation.action.deleteModuleAria': "删除 ECUC 模块 '{name}'",
  'mutation.info.ecucModuleDeleted': "已删除 ECUC 模块 '{name}'",
  'mutation.info.ecucModuleUnlinked': "已删除 ECUC 模块 '{name}'，BSWMD 链接已断开",
  'mutation.warning.cascadePartial':
    '级联删除完成，但有 {count} 个引用未能解析（可能已被其他操作删除）',
  'mutation.action.deleteReferenceNotImplemented':
    '删除引用功能尚未实现（已加入 Sprint A backlog）',

  // CascadeConfirmDialog (3-option)
  'confirm.cascade.title': "删除 '{name}'?",
  'confirm.cascade.message': "'{name}' 被 {count} 处引用指向：",
  'confirm.cascade.cancel': '取消',
  'confirm.cascade.only': '仅删容器',
  'confirm.cascade.cascade': '一并删引用',

  // RemoveModuleConfirmDialog (4-option)
  'confirm.removeBswmd.title': "移除 BSWMD '{name}'?",
  'confirm.removeBswmd.message': "'{name}' 被 {count} 个 value-side 文件依赖：",
  'confirm.removeBswmd.cancel': '取消',
  'confirm.removeBswmd.only': '仅移除 BSWMD',
  'confirm.removeBswmd.cascade': '一并删除依赖文件',
  'confirm.removeBswmd.cascadeAndUnlink': '一并删除 + 从磁盘删除 BSWMD',

  // CloseProject confirm (3-button)
  'confirm.closeProject.title': '关闭项目？',
  'confirm.closeProject.message':
    '此项目有 {count} 处未保存的修改。关闭后这些修改将被丢弃。是否继续？',
  'confirm.closeProject.cancel': '取消',
  'confirm.closeProject.discard': '放弃所有修改',
  'confirm.closeProject.save': '保存后关闭',

  // templates (Sprint 13 #1)
  'template.empty.displayName': '空项目',
  'template.empty.description': '从零开始创建项目',
  'template.classic.displayName': '经典项目',
  'template.classic.description': '预填常见 BSWMD 的项目模板',
  'template.clone.displayName': '克隆（即将上线）',
  'template.clone.description': '基于现有项目创建副本',
  'template.comingSoon': '即将推出',
};
