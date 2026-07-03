// i18n — zh-CN bundle: editor cluster.

import type { EditorMessages } from '../i18n/editor.js';

export const EditorZhCN: EditorMessages = {
  // tree
  'tree.empty': '（空）',
  'tree.emptyHint': '未加载文件。点击"打开"按钮开始。',
  'tree.elementAria': '{kind} {name}',
  'tree.addOptionalContainer': '添加 {name}',
  'tree.optionalContainerHint': '可选容器 — 点击 + 添加实例',

  // editor
  'editor.noSelection': '请从树中选择一个元素',
  'editor.invalidValue': '无效值',
  'editor.col.param': '参数',
  'editor.col.type': '类型',
  'editor.col.value': '取值',
  'editor.params.empty': '此节点没有参数',

  // param category section headers
  'params.category.value': '参数值 ({count})',
  'params.category.reference': '引用 ({count})',
  'params.category.empty': '（无）',

  // arxml panel
  'arxmlPanel.empty': '未加载文档。',
  'arxmlPanel.packages': '包',
  'arxmlPanel.elements': '元素',
  'arxmlPanel.unsaved': '有未保存修改',
  'arxmlPanel.combinedDocs': '合并视图（{count} 个文档）',
  'arxmlPanel.combinedView': '合并视图',

  // left panel tabs
  'leftPanel.tab.project': '项目',
  'leftPanel.tab.files': '文件',
  'leftPanel.tab.validate': '验证',
  'leftPanel.project.empty': '未打开项目。请到"文件"标签新建或打开一个项目。',

  // project panel
  'projectPanel.loose.text': '未加载项目。',
  'projectPanel.loose.new': '新建',
  'projectPanel.loose.open': '打开',
  'projectPanel.subtitle': '{arxmlCount} 个 ARXML · {bswmdCount} 个 BSWMD',
  'projectPanel.arxml.title': '值侧 ARXML',
  'projectPanel.arxml.empty': '尚未附加 ARXML。可使用"打开"按钮加载。',
  'projectPanel.bswmd.title': 'BSWMD',
  'projectPanel.bswmd.empty': '尚未加载 BSWMD。点击"加载 BSWMD"按钮添加 schema 文件。',
  'projectPanel.bswmd.add': '加载 BSWMD...',
  'projectPanel.bswmd.addAria': '加载 BSWMD 文件 {name}',
  'projectPanel.closeAria': '关闭项目 {name}',
  'projectPanel.removeArxmlAria': '从项目中移除 {name}',
  'projectPanel.removeBswmdAria': "移除 BSWMD '{name}'",

  // file list (combined view)
  'fileList.combinedView': '合并视图',
  'fileList.combinedViewAria': '切换到合并视图',

  // project meta block
  'project.meta.path': '路径: {path}',
  'project.meta.createdAt': '创建于 {date}',
  'project.meta.stats': '{arxmlCount} 个 ARXML · {bswmdCount} 个 BSWMD · {dirtyCount} 个未保存',

  // ECUC BSWMD-to-module selection
  'ecuc.fromBswmd.menu': 'ECUC模块选择…',
  'ecuc.fromBswmd.disabledNoBswmd': '请先加载 BSWMD',
  'ecuc.fromBswmd.disabledNoProject': '请先新建/打开项目',
  'ecuc.fromBswmd.filter': '过滤 (模块名 / vendor 路径)',
  'ecuc.fromBswmd.selectedCount': '已选: {count} 个模块',
  'ecuc.fromBswmd.willCreate': '将创建',
  'ecuc.fromBswmd.targetDir': '目标目录',
  'ecuc.fromBswmd.createN': '创建 {count} 个 ECUC',
  'ecuc.fromBswmd.collisionWarn': '多个 BSWMD 声明了同名 module — 已自动加后缀',
  'ecuc.fromBswmd.upperBoundReached': '已达实例上限 ({current}/{max})',
  'ecuc.fromBswmd.toast': '已新建 {count} 个 ECUC 文件',
  'ecuc.fromBswmd.modulesActive': 'Modules ({active}/{total} active)',
  'ecuc.fromBswmd.outputDir': '输出到 {dir}/ 子目录',
  'ecuc.fromBswmd.willRemove': '将排除',
  'ecuc.fromBswmd.removeN': '排除 {count} 个 ECUC',
  'ecuc.fromBswmd.dirtyHint': '被排除的 ECUC 中有未保存改动',
  'ecuc.fromBswmd.noChange': '无变化',
  'ecuc.fromBswmd.removed': '已排除 {count} 个 ECUC',
  'ecuc.fromBswmd.removeFailed': '排除失败',
  'ecuc.fromBswmd.excludeTitle': '排除 ECUC 模块',
  'ecuc.fromBswmd.excludeMessage':
    '以下 ECUC 模块存在未保存改动：{names}\n选择"不保存"将丢失这些改动，选择"保存并排除"会先静默保存到磁盘再删除。',
  'ecuc.fromBswmd.saveFailedAbort':
    '保存 {name} 失败：{message}。已中止排除流程，该模块的改动已保留（未删除）。',

  // picker / editor chrome
  'picker.search.placeholder': '搜索…',
  'picker.tooltip.atMax': '已达最大实例数 ({current}/{max})',
  'picker.tooltip.alreadyAdded': '已添加 "{name}"（参数/引用唯一）',

  // OS dialog titles
  'dialog.pickDir.title': '选择项目目录',

  // command palette
  'commandPalette.title': '命令面板',
  'commandPalette.placeholder': '输入命令…',
  'commandPalette.noResults': '没有匹配的命令',

  // cheat sheet
  'cheatSheet.title': '键盘快捷键',
  'cheatSheet.searchPlaceholder': '搜索快捷键…',
  'cheatSheet.closeAria': '关闭快捷键面板',
  'cheatSheet.bindingHint': '按 ? 键随时打开',

  // shortcut category labels
  'shortcut.category.file': '文件',
  'shortcut.category.edit': '编辑',
  'shortcut.category.view': '视图',
  'shortcut.category.navigate': '导航',
  'shortcut.category.selection': '选择',
  'shortcut.category.tree': '树',
  'shortcut.category.script': '脚本',
  'shortcut.category.ecuc': 'ECUC',
  'shortcut.category.window': '窗口',
  'shortcut.category.help': '帮助',
  'shortcut.category.palette': '面板',
  'shortcut.category.validation': '校验',

  // shortcut command labels
  'shortcut.file.open': '打开项目',
  'shortcut.file.save': '保存',
  'shortcut.file.saveAs': '另存为',
  'shortcut.file.close': '关闭项目',
  'shortcut.file.recent': '最近项目',
  'shortcut.edit.undo': '撤销',
  'shortcut.edit.redo': '重做',
  'shortcut.edit.cut': '剪切',
  'shortcut.edit.copy': '复制',
  'shortcut.edit.paste': '粘贴',
  'shortcut.edit.find': '查找',
  'shortcut.edit.replace': '替换',
  'shortcut.view.toggleLeft': '切换左侧面板',
  'shortcut.view.toggleRight': '切换右侧面板',
  'shortcut.view.zoomIn': '放大',
  'shortcut.view.zoomOut': '缩小',
  'shortcut.view.zoomReset': '重置缩放',
  'shortcut.navigate.goToDefinition': '转到定义',
  'shortcut.navigate.goToReference': '转到引用',
  'shortcut.navigate.focusSearch': '聚焦搜索',
  'shortcut.selection.selectAll': '全选',
  'shortcut.selection.expand': '扩大选区',
  'shortcut.selection.shrink': '缩小选区',
  'shortcut.tree.revealActive': '在树中定位当前项',
  'shortcut.tree.collapseAll': '全部折叠',
  'shortcut.tree.expandAll': '全部展开',
  'shortcut.tree.jumpParent': '跳到父节点',
  'shortcut.tree.jumpChild': '跳到第一个子节点',
  'shortcut.script.openEditor': '打开脚本编辑器',
  'shortcut.script.run': '运行脚本',
  'shortcut.script.save': '保存脚本',
  'shortcut.script.format': '格式化脚本',
  'shortcut.ecuc.addContainer': '添加子容器',
  'shortcut.ecuc.deleteContainer': '删除容器',
  'shortcut.ecuc.duplicateContainer': '复制容器',
  'shortcut.ecuc.addParameter': '添加参数',
  'shortcut.ecuc.editParameter': '编辑参数',
  'shortcut.window.newWindow': '新建窗口',
  'shortcut.window.closeWindow': '关闭窗口',
  'shortcut.window.focusPanel': '聚焦面板',
  'shortcut.help.showCheatSheet': '显示快捷键',
  'shortcut.help.showDocs': '显示文档',
  'shortcut.help.resetOnboarding': '重置引导教程',
  'help.menu.resetOnboarding': '帮助 → 重置引导',
  'shortcut.palette.toggle': '切换命令面板',
  'shortcut.validation.nextError': '下一条校验错误',
  'shortcut.validation.prevError': '上一条校验错误',
  'shortcut.validation.togglePanel': '切换校验面板',
  'shortcut.validation.focusPanel': '聚焦校验面板',

  // modifier labels
  'shortcut.modifier.cmd': 'Cmd',
  'shortcut.modifier.ctrl': 'Ctrl',
  'shortcut.modifier.shift': 'Shift',
  'shortcut.modifier.alt': 'Alt',
};
