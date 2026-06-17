// i18n — Sprint 11 Phase 1 (Option A: full zh-CN / en support).
//
// Pure / sync / no I/O. The store owns the current `Locale`; components
// read it via `useArxmlStore` and call `t(locale, key, params)` directly.
// A future refactor could introduce a `useT()` hook that memoizes the
// bound t() per-render, but for now passing `locale` as the first arg
// keeps the helper trivially testable.
//
// Conventions:
//   - Every user-facing string is a key on `Messages`. The two bundles
//     (`MessagesZhCN` / `MessagesEn`) MUST cover the same key set; the
//     parity test in `i18n.test.ts` enforces this.
//   - Placeholders use {varName} syntax, replaced via simple regex
//     substitution. Missing params leave the placeholder literal so a
//     missing-param bug is visible rather than silently empty.
//   - Unknown keys return the key itself and emit a single console.warn.
//     This is a defensive guard against typos; the bundler can also
//     catch them statically via the parity test.

/** Supported locales. Order matches the toggle button in AppHeader. */
export type Locale = 'zh-CN' | 'en';

export const DEFAULT_LOCALE: Locale = 'zh-CN';

/** Default locale for new sessions. */
export const SUPPORTED_LOCALES: readonly Locale[] = ['zh-CN', 'en'] as const;

/**
 * UI string dictionary. Every key MUST be present in both
 * `MessagesZhCN` and `MessagesEn` (parity test enforces this).
 *
 * Naming convention: `<scope>.<element>.<detail>`. Top-level scopes:
 *   - `app.*`          — AppHeader strings
 *   - `projectPanel.*` — ProjectPanel strings
 *   - `arxmlPanel.*`   — ArxmlPanel strings
 *   - `validation.*`   — ValidationPanel strings
 *   - `editor.*`       — ParamEditor strings
 *   - `tree.*`         — Tree component strings
 *   - `common.*`       — shared strings (cancel, save, error prefix, etc.)
 */
export interface Messages {
  // --- common ---
  readonly 'common.cancel': string;
  readonly 'common.save': string;
  readonly 'common.errorPrefix': string; // "{label}失败: {message}"
  readonly 'common.errorPrefixEn': string; // "{label} failed: {message}"

  // --- app header ---
  readonly 'app.open': string;
  readonly 'app.save': string;
  readonly 'app.saveDirty': string;
  readonly 'app.project.new': string;
  readonly 'app.project.open': string;
  readonly 'app.project.save': string;
  readonly 'app.project.chipLabel': string;
  readonly 'app.project.closeAria': string; // {name}
  readonly 'app.project.saveBlockedDirty': string; // {count} — tooltip when Save Project is blocked because dirty docs exist
  readonly 'app.docTab.ariaLoaded': string;
  readonly 'app.docTab.closeAria': string; // {name}
  readonly 'app.docNameDirtyMark': string;
  readonly 'app.docVersion': string; // {version}
  readonly 'app.versionLabel': string; // v{version}
  readonly 'app.prompt.projectName': string;
  readonly 'app.prompt.defaultName': string;
  readonly 'app.error.openFailed': string; // {message}
  readonly 'app.error.saveFailed': string; // {message}
  readonly 'app.error.newProjectFailed': string; // {message}
  readonly 'app.error.openProjectFailed': string; // {message}
  readonly 'app.error.saveProjectFailed': string; // {message}
  readonly 'app.error.openProjectParse': string; // {message}
  readonly 'app.error.readBswmdFailed': string; // {message}
  readonly 'app.error.parseBswmdFailed': string; // {message}
  readonly 'app.error.duplicateBswmd': string; // {path}
  readonly 'app.error.needProject': string;
  readonly 'app.error.dismissAria': string;
  readonly 'app.error.copyAria': string;
  readonly 'app.error.copy': string;
  readonly 'app.error.viewAria': string;
  readonly 'app.error.viewHint': string;
  readonly 'app.error.view': string;
  readonly 'app.error.viewerTitle': string;
  readonly 'app.error.viewerCloseAria': string;
  readonly 'app.error.dismissAll': string;
  readonly 'app.error.projectNameEmpty': string;
  readonly 'app.error.projectNameInvalid': string;
  readonly 'app.error.projectNameTooLong': string;
  readonly 'app.menu.project': string;
  readonly 'app.menu.projectManage': string;
  readonly 'app.menu.fileOps': string;
  readonly 'app.open.arxml': string;
  readonly 'app.locale.toggleAria': string; // "Switch language" / "切换语言"

  // --- project panel ---
  readonly 'projectPanel.loose.text': string;
  readonly 'projectPanel.loose.new': string;
  readonly 'projectPanel.loose.open': string;
  readonly 'projectPanel.subtitle': string; // {arxmlCount} {bswmdCount}
  readonly 'projectPanel.arxml.title': string;
  readonly 'projectPanel.arxml.empty': string;
  readonly 'projectPanel.bswmd.title': string;
  readonly 'projectPanel.bswmd.empty': string;
  readonly 'projectPanel.bswmd.add': string;
  readonly 'projectPanel.bswmd.addAria': string; // {name}
  readonly 'projectPanel.closeAria': string; // {name}
  readonly 'projectPanel.removeArxmlAria': string; // {name}

  // --- new project dialog (Sprint 12 #3 Phase 1) ---
  readonly 'newProject.title': string;
  readonly 'newProject.nameLabel': string;
  readonly 'newProject.nameHint': string;
  readonly 'newProject.dirLabel': string;
  readonly 'newProject.dirHint': string;
  readonly 'newProject.filenamePreview': string; // {dir} {name}
  readonly 'newProject.browse': string;
  readonly 'newProject.create': string;
  readonly 'newProject.cancel': string;

  // --- confirm dialog (Sprint 12 #3 Phase 1) ---
  readonly 'confirm.unsaved.title': string;
  readonly 'confirm.unsaved.message': string; // {name}
  readonly 'confirm.unsaved.continue': string;
  readonly 'confirm.unsaved.discard': string;
  readonly 'confirm.unsaved.saveAndNew': string;

  // --- bswmd parser errors (BswmdError → human message) ---
  readonly 'bswmdParser.xmlMalformed': string; // {message}
  readonly 'bswmdParser.missingRoot': string;
  readonly 'bswmdParser.unsupportedVersion': string; // {version}
  readonly 'bswmdParser.invalidStructure': string; // {path} {message}

  // --- arxml panel (status footer) ---
  readonly 'arxmlPanel.empty': string;
  readonly 'arxmlPanel.packages': string;
  readonly 'arxmlPanel.elements': string;
  readonly 'arxmlPanel.unsaved': string;

  // --- validation panel ---
  readonly 'validation.title': string;
  readonly 'validation.allPassed': string;
  readonly 'validation.subtitle': string;
  readonly 'validation.violation': string; // {count}
  readonly 'validation.violations': string; // {count}

  // --- param editor ---
  readonly 'editor.noSelection': string;
  readonly 'editor.invalidValue': string;

  // --- tree ---
  readonly 'tree.empty': string;
  readonly 'tree.emptyHint': string;
  readonly 'tree.elementAria': string; // {kind} {name}

  // --- left panel tabs (Sprint 13 #2 Task 1: tab-based left panel) ---
  readonly 'leftPanel.tab.project': string;
  readonly 'leftPanel.tab.files': string;
  readonly 'leftPanel.tab.validate': string;
}

export type MessageKey = keyof Messages;

// ---------------------------------------------------------------------------
// zh-CN bundle
// ---------------------------------------------------------------------------

export const MessagesZhCN: Messages = {
  // common
  'common.cancel': '取消',
  'common.save': '保存',
  'common.errorPrefix': '{label}失败: {message}',
  'common.errorPrefixEn': '{label} failed: {message}',

  // app
  'app.open': '打开',
  'app.save': '保存',
  'app.saveDirty': '保存 *',
  'app.project.new': '新建项目',
  'app.project.open': '打开项目',
  'app.project.save': '保存项目',
  'app.project.chipLabel': '项目:',
  'app.project.closeAria': '关闭项目 {name}',
  'app.project.saveBlockedDirty': '保存项目前请先保存 {count} 个未保存的 ARXML',
  'app.docTab.ariaLoaded': '已加载文档',
  'app.docTab.closeAria': '关闭 {name}',
  'app.docNameDirtyMark': '● ',
  'app.docVersion': 'AUTOSAR {version}',
  'app.versionLabel': 'v{version}',
  'app.prompt.projectName': '项目名称:',
  'app.prompt.defaultName': '我的项目',
  'app.error.openFailed': '打开失败: {message}',
  'app.error.saveFailed': '保存失败: {message}',
  'app.error.newProjectFailed': '新建项目失败: {message}',
  'app.error.openProjectFailed': '打开项目失败: {message}',
  'app.error.saveProjectFailed': '保存项目失败: {message}',
  'app.error.openProjectParse': '打开项目: {message}',
  'app.error.readBswmdFailed': '读取 BSWMD 失败: {message}',
  'app.error.parseBswmdFailed': 'BSWMD 解析失败: {message}',
  'app.error.duplicateBswmd': 'BSWMD 已加载过: {path}',
  'app.error.needProject': '需要先打开或创建项目',
  'app.error.dismissAria': '关闭提醒',
  'app.error.copyAria': '复制错误内容',
  'app.error.copy': '复制',
  'app.error.viewAria': '查看完整错误',
  'app.error.viewHint': '点击查看完整错误',
  'app.error.view': '查看',
  'app.error.viewerTitle': '错误详情',
  'app.error.viewerCloseAria': '关闭错误详情',
  'app.error.dismissAll': '关闭并清除',
  'app.error.projectNameEmpty': '项目名称不能为空',
  'app.error.projectNameInvalid': '项目名称含非法字符：< > : " / \\ | ? *',
  'app.error.projectNameTooLong': '项目名称不能超过 64 字符',
  'app.menu.project': '项目',
  'app.menu.projectManage': '项目管理',
  'app.menu.fileOps': '文件操作',
  'app.open.arxml': '打开 ARXML…',
  'app.locale.toggleAria': '切换语言',

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

  // new project dialog
  'newProject.title': '新建项目',
  'newProject.nameLabel': '项目名称 *',
  'newProject.nameHint': '用于显示和文件名，最长 64 字符',
  'newProject.dirLabel': '保存位置 *',
  'newProject.dirHint': '选择项目目录（manifest 文件将保存在此目录下）',
  'newProject.filenamePreview': '📁 {dir}/{name}.autosarcfg.json',
  'newProject.browse': '浏览…',
  'newProject.create': '创建',
  'newProject.cancel': '取消',

  // confirm dialog
  'confirm.unsaved.title': '未保存的更改',
  'confirm.unsaved.message': '当前项目 {name} 有未保存的更改。\n新建项目将丢失这些更改。',
  'confirm.unsaved.continue': '继续编辑',
  'confirm.unsaved.discard': '不保存，新建',
  'confirm.unsaved.saveAndNew': '保存并新建',

  // bswmd parser
  'bswmdParser.xmlMalformed': 'BSWMD XML 格式错误: {message}',
  'bswmdParser.missingRoot': 'BSWMD 缺少根元素 <AUTOSAR>',
  'bswmdParser.unsupportedVersion': 'BSWMD 不支持的 AUTOSAR 版本: {version}',
  'bswmdParser.invalidStructure': 'BSWMD 结构错误 ({path}): {message}',

  // arxml panel
  'arxmlPanel.empty': '未加载文档。',
  'arxmlPanel.packages': '包',
  'arxmlPanel.elements': '元素',
  'arxmlPanel.unsaved': '有未保存修改',

  // validation
  'validation.title': '校验',
  'validation.allPassed': '全部检查通过',
  'validation.subtitle': '已应用 ECUC 子集架构。修改参数可重新校验。',
  'validation.violation': '{count} 项违规',
  'validation.violations': '{count} 项违规',

  // editor
  'editor.noSelection': '请从树中选择一个元素',
  'editor.invalidValue': '无效值',

  // tree
  'tree.empty': '（空）',
  'tree.emptyHint': '未加载文件。点击"打开"按钮开始。',
  'tree.elementAria': '{kind} {name}',

  // left panel tabs
  'leftPanel.tab.project': '项目',
  'leftPanel.tab.files': '文件',
  'leftPanel.tab.validate': '验证',
};

// ---------------------------------------------------------------------------
// en bundle
// ---------------------------------------------------------------------------

export const MessagesEn: Messages = {
  // common
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.errorPrefix': '{label} failed: {message}',
  'common.errorPrefixEn': '{label} failed: {message}',

  // app
  'app.open': 'Open',
  'app.save': 'Save',
  'app.saveDirty': 'Save *',
  'app.project.new': 'New Project',
  'app.project.open': 'Open Project',
  'app.project.save': 'Save Project',
  'app.project.chipLabel': 'project:',
  'app.project.closeAria': 'Close project {name}',
  'app.project.saveBlockedDirty': 'Save {count} unsaved ARXML file(s) first',
  'app.docTab.ariaLoaded': 'Loaded documents',
  'app.docTab.closeAria': 'Close {name}',
  'app.docNameDirtyMark': '● ',
  'app.docVersion': 'AUTOSAR {version}',
  'app.versionLabel': 'v{version}',
  'app.prompt.projectName': 'Project name:',
  'app.prompt.defaultName': 'My Project',
  'app.error.openFailed': 'Open failed: {message}',
  'app.error.saveFailed': 'Save failed: {message}',
  'app.error.newProjectFailed': 'New Project failed: {message}',
  'app.error.openProjectFailed': 'Open Project failed: {message}',
  'app.error.saveProjectFailed': 'Save Project failed: {message}',
  'app.error.openProjectParse': 'Open Project: {message}',
  'app.error.readBswmdFailed': 'Failed to read BSWMD: {message}',
  'app.error.parseBswmdFailed': 'BSWMD parse failed: {message}',
  'app.error.duplicateBswmd': 'BSWMD already loaded: {path}',
  'app.error.needProject': 'Please open or create a project first',
  'app.error.dismissAria': 'Dismiss notification',
  'app.error.copyAria': 'Copy error to clipboard',
  'app.error.copy': 'Copy',
  'app.error.viewAria': 'View full error',
  'app.error.viewHint': 'Click to view full error',
  'app.error.view': 'View',
  'app.error.viewerTitle': 'Error details',
  'app.error.viewerCloseAria': 'Close error details',
  'app.error.dismissAll': 'Dismiss & clear',
  'app.error.projectNameEmpty': 'Project name cannot be empty',
  'app.error.projectNameInvalid': 'Project name contains invalid characters: < > : " / \\ | ? *',
  'app.error.projectNameTooLong': 'Project name cannot exceed 64 characters',
  'app.menu.project': 'Project',
  'app.menu.projectManage': 'Project',
  'app.menu.fileOps': 'File Operations',
  'app.open.arxml': 'Open ARXML…',
  'app.locale.toggleAria': 'Switch language',

  // project panel
  'projectPanel.loose.text': 'No project loaded.',
  'projectPanel.loose.new': 'New',
  'projectPanel.loose.open': 'Open',
  'projectPanel.subtitle': '{arxmlCount} ARXML · {bswmdCount} BSWMD',
  'projectPanel.arxml.title': 'Value-side ARXMLs',
  'projectPanel.arxml.empty': 'No ARXMLs attached. Use Open ARXML to add some.',
  'projectPanel.bswmd.title': 'BSWMDs',
  'projectPanel.bswmd.empty': 'No BSWMDs loaded yet. Click "Load BSWMD" to add a schema file.',
  'projectPanel.bswmd.add': 'Load BSWMD...',
  'projectPanel.bswmd.addAria': 'Load BSWMD file {name}',
  'projectPanel.closeAria': 'Close project {name}',
  'projectPanel.removeArxmlAria': 'Remove {name} from project',

  // new project dialog
  'newProject.title': 'New Project',
  'newProject.nameLabel': 'Project Name *',
  'newProject.nameHint': 'For display and filename, max 64 characters',
  'newProject.dirLabel': 'Save Location *',
  'newProject.dirHint': 'Select project directory (manifest file will be saved here)',
  'newProject.filenamePreview': '📁 {dir}/{name}.autosarcfg.json',
  'newProject.browse': 'Browse...',
  'newProject.create': 'Create',
  'newProject.cancel': 'Cancel',

  // confirm dialog
  'confirm.unsaved.title': 'Unsaved Changes',
  'confirm.unsaved.message':
    'Project "{name}" has unsaved changes.\nCreating a new project will discard them.',
  'confirm.unsaved.continue': 'Keep Editing',
  'confirm.unsaved.discard': 'Discard & New',
  'confirm.unsaved.saveAndNew': 'Save & New',

  // bswmd parser
  'bswmdParser.xmlMalformed': 'BSWMD XML malformed: {message}',
  'bswmdParser.missingRoot': 'BSWMD missing root element <AUTOSAR>',
  'bswmdParser.unsupportedVersion': 'BSWMD unsupported AUTOSAR version: {version}',
  'bswmdParser.invalidStructure': 'BSWMD invalid structure at {path}: {message}',

  // arxml panel
  'arxmlPanel.empty': 'No document loaded.',
  'arxmlPanel.packages': 'Packages',
  'arxmlPanel.elements': 'Elements',
  'arxmlPanel.unsaved': 'unsaved changes',

  // validation
  'validation.title': 'Validation',
  'validation.allPassed': 'All checks passed',
  'validation.subtitle': 'ECUC subset schema applied. Edit a param to revalidate.',
  'validation.violation': '{count} violation',
  'validation.violations': '{count} violations',

  // editor
  'editor.noSelection': 'Open an ARXML file and select a node in the tree to edit its parameters.',
  'editor.invalidValue': 'Invalid value',

  // tree
  'tree.empty': '(empty)',
  'tree.emptyHint': 'No file loaded. Click "Open ARXML" to start.',
  'tree.elementAria': '{kind} {name}',

  // left panel tabs
  'leftPanel.tab.project': 'Project',
  'leftPanel.tab.files': 'Files',
  'leftPanel.tab.validate': 'Validate',
};

// ---------------------------------------------------------------------------
// Bundle map (used by the store's setLocale action)
// ---------------------------------------------------------------------------

export const MESSAGES_BY_LOCALE: Readonly<Record<Locale, Messages>> = {
  'zh-CN': MessagesZhCN,
  en: MessagesEn,
};

// ---------------------------------------------------------------------------
// t() helper
// ---------------------------------------------------------------------------

/**
 * Render the message for `key` in the given `locale`, interpolating
 * `{varName}` placeholders from `params` (if any).
 *
 * Behaviour on edge cases:
 *   - unknown key → returns the key verbatim + console.warn (one-shot
 *     per call, no debouncing — bugs should be visible)
 *   - missing param → leaves the `{varName}` placeholder literal so the
 *     caller can see the typo
 *   - non-string param value → coerced via String() (numbers / booleans
 *     render naturally; objects/arrays render via their toString)
 */
export function t(
  locale: Locale,
  key: MessageKey,
  params?: Readonly<Record<string, string | number | boolean>>,
): string {
  const bundle = MESSAGES_BY_LOCALE[locale];
  const template: string | undefined = bundle[key];
  if (template === undefined) {
    // Defensive guard — the parity test catches missing keys at build
    // time; this only fires for a typo at a call site.
    // eslint-disable-next-line no-console
    console.warn(`[i18n] missing key: ${String(key)} for locale ${locale}`);
    return String(key);
  }
  if (params === undefined) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    if (v === undefined) return match;
    return String(v);
  });
}
