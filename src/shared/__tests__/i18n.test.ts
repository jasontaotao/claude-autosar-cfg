// i18n helper tests — Sprint 11 Phase 1 (Option A: full i18n).
//
// Pins:
//   - t() returns the zh-CN string by default
//   - t() returns the en string when locale='en'
//   - placeholder interpolation works ({varName} substituted with values)
//   - unknown key returns the key itself + a console.warn (defensive)
//   - both message bundles cover the same set of keys (compile-time-like
//     safety net; if either bundle is missing a key, the test fails)

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { t, MessagesZhCN, MessagesEn } from '../i18n.js';
import type { Locale, MessageKey, Messages } from '../i18n.js';

const ALL_KEYS = Object.keys(MessagesZhCN) as MessageKey[];

describe('i18n — t() helper', () => {
  it('returns the zh-CN string when locale="zh-CN"', () => {
    expect(t('zh-CN', 'app.open')).toBe('打开');
  });

  it('returns the en string when locale="en"', () => {
    expect(t('en', 'app.open')).toBe('Open');
  });

  it('interpolates {var} placeholders in zh-CN', () => {
    const out = t('zh-CN', 'projectPanel.subtitle', {
      arxmlCount: 3,
      bswmdCount: 1,
    });
    expect(out).toBe('3 个 ARXML · 1 个 BSWMD');
  });

  it('interpolates {var} placeholders in en', () => {
    const out = t('en', 'projectPanel.subtitle', {
      arxmlCount: 3,
      bswmdCount: 1,
    });
    expect(out).toBe('3 ARXML · 1 BSWMD');
  });

  it('handles singular vs plural in Chinese (no-op — Chinese has no plural inflection)', () => {
    expect(t('zh-CN', 'validation.violation', { count: 1 })).toBe('1 项违规');
    expect(t('zh-CN', 'validation.violation', { count: 5 })).toBe('5 项违规');
  });

  it('falls back to the key itself + warns for unknown keys', () => {
    // Suppress console.warn noise in test output
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Cast through unknown to bypass the MessageKey constraint
    const out = t('zh-CN', 'nonexistent.key' as MessageKey);
    expect(out).toBe('nonexistent.key');
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('returns the string unchanged when no params are passed and the string has no placeholders', () => {
    expect(t('en', 'app.open')).toBe('Open');
  });

  it('does not crash when a placeholder is missing from params (leaves it literal)', () => {
    const out = t('en', 'projectPanel.subtitle', { arxmlCount: 2 });
    expect(out).toContain('{bswmdCount}');
    expect(out).toContain('2');
  });

  it('renders BswmdError → human message for xml-malformed (zh-CN)', () => {
    expect(t('zh-CN', 'bswmdParser.xmlMalformed', { message: 'unclosed tag' })).toBe(
      'BSWMD XML 格式错误: unclosed tag',
    );
  });

  it('renders BswmdError → human message for missing-root (en)', () => {
    expect(t('en', 'bswmdParser.missingRoot')).toBe('BSWMD missing root element <AUTOSAR>');
  });

  it('renders BswmdError → human message for unsupported-version with version param', () => {
    expect(t('en', 'bswmdParser.unsupportedVersion', { version: 'r3.5' })).toBe(
      'BSWMD unsupported AUTOSAR version: r3.5',
    );
  });

  it('renders BswmdError → human message for invalid-structure with path + message', () => {
    expect(
      t('zh-CN', 'bswmdParser.invalidStructure', {
        path: '/AUTOSAR_R22/EcucDefs/Can',
        message: '缺 SHORT-NAME',
      }),
    ).toBe('BSWMD 结构错误 (/AUTOSAR_R22/EcucDefs/Can): 缺 SHORT-NAME');
  });

  it('projectPanel.bswmd.empty no longer mentions "Phase 2" (Sprint 12 #1 ships BSWMD loading)', () => {
    expect(t('en', 'projectPanel.bswmd.empty')).not.toContain('Phase 2');
    expect(t('zh-CN', 'projectPanel.bswmd.empty')).not.toContain('Phase');
  });

  it('projectPanel.bswmd.empty reflects the Sprint 12 #2 "Load BSWMD" button (zh-CN + en)', () => {
    expect(t('zh-CN', 'projectPanel.bswmd.empty')).toContain('加载 BSWMD');
    expect(t('en', 'projectPanel.bswmd.empty')).toContain('Load BSWMD');
  });

  it('renders projectPanel.bswmd.add button label (zh-CN + en)', () => {
    expect(t('zh-CN', 'projectPanel.bswmd.add')).toBe('加载 BSWMD...');
    expect(t('en', 'projectPanel.bswmd.add')).toBe('Load BSWMD...');
  });

  it('renders projectPanel.bswmd.addAria with {name} placeholder (zh-CN + en)', () => {
    expect(t('zh-CN', 'projectPanel.bswmd.addAria', { name: 'CanIf' })).toBe(
      '加载 BSWMD 文件 CanIf',
    );
    expect(t('en', 'projectPanel.bswmd.addAria', { name: 'CanIf.arxml' })).toBe(
      'Load BSWMD file CanIf.arxml',
    );
  });

  it('renders app.error.readBswmdFailed with {message} placeholder (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.error.readBswmdFailed', { message: 'ENOENT' })).toBe(
      '读取 BSWMD 失败: ENOENT',
    );
    expect(t('en', 'app.error.readBswmdFailed', { message: 'ENOENT' })).toBe(
      'Failed to read BSWMD: ENOENT',
    );
  });

  it('renders app.error.parseBswmdFailed with {message} placeholder (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.error.parseBswmdFailed', { message: 'xml malformed' })).toBe(
      'BSWMD 解析失败: xml malformed',
    );
    expect(t('en', 'app.error.parseBswmdFailed', { message: 'xml malformed' })).toBe(
      'BSWMD parse failed: xml malformed',
    );
  });

  it('renders app.error.duplicateBswmd with {path} placeholder (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.error.duplicateBswmd', { path: '/x/CanIf.arxml' })).toBe(
      'BSWMD 已加载过: /x/CanIf.arxml',
    );
    expect(t('en', 'app.error.duplicateBswmd', { path: '/x/CanIf.arxml' })).toBe(
      'BSWMD already loaded: /x/CanIf.arxml',
    );
  });

  it('renders app.error.needProject as a static string (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.error.needProject')).toBe('需要先打开或创建项目');
    expect(t('en', 'app.error.needProject')).toBe('Please open or create a project first');
  });

  it('renders editor.col.param (zh-CN + en)', () => {
    expect(t('zh-CN', 'editor.col.param')).toBe('参数');
    expect(t('en', 'editor.col.param')).toBe('Param');
  });

  it('renders editor.col.type (zh-CN + en)', () => {
    expect(t('zh-CN', 'editor.col.type')).toBe('类型');
    expect(t('en', 'editor.col.type')).toBe('Type');
  });

  it('renders editor.col.value (zh-CN + en)', () => {
    expect(t('zh-CN', 'editor.col.value')).toBe('取值');
    expect(t('en', 'editor.col.value')).toBe('Value');
  });

  it('renders dialog.pickDir.title (zh-CN + en)', () => {
    expect(t('zh-CN', 'dialog.pickDir.title')).toBe('选择项目目录');
    expect(t('en', 'dialog.pickDir.title')).toBe('Choose Project Directory');
  });

  it('renders parserError.xmlMalformed with {message} placeholder (zh-CN + en)', () => {
    expect(t('zh-CN', 'parserError.xmlMalformed', { message: 'unclosed tag' })).toBe(
      'XML 格式错误: unclosed tag',
    );
    expect(t('en', 'parserError.xmlMalformed', { message: 'unclosed tag' })).toBe(
      'XML malformed: unclosed tag',
    );
  });

  it('renders parserError.missingRoot with {message} placeholder (zh-CN + en)', () => {
    expect(t('zh-CN', 'parserError.missingRoot', { message: 'expected <AUTOSAR>' })).toBe(
      '缺少根元素: expected <AUTOSAR>',
    );
    expect(t('en', 'parserError.missingRoot', { message: 'expected <AUTOSAR>' })).toBe(
      'Missing root element: expected <AUTOSAR>',
    );
  });

  it('renders parserError.unsupportedVersion with {version} placeholder (zh-CN + en)', () => {
    expect(t('zh-CN', 'parserError.unsupportedVersion', { version: '3.5' })).toBe(
      '不支持的 AUTOSAR 版本: 3.5',
    );
    expect(t('en', 'parserError.unsupportedVersion', { version: '3.5' })).toBe(
      'Unsupported AUTOSAR version: 3.5',
    );
  });

  it('renders parserError.invalidStructure with {path} and {message} placeholders (zh-CN + en)', () => {
    expect(
      t('zh-CN', 'parserError.invalidStructure', {
        path: '/EAS/EcucDefs/Can',
        message: '缺 SHORT-NAME',
      }),
    ).toBe('结构错误 /EAS/EcucDefs/Can: 缺 SHORT-NAME');
    expect(
      t('en', 'parserError.invalidStructure', {
        path: '/EAS/EcucDefs/Can',
        message: 'missing SHORT-NAME',
      }),
    ).toBe('Invalid structure at /EAS/EcucDefs/Can: missing SHORT-NAME');
  });
});

describe('i18n — Sprint 12 #3 newProject / confirm / app.error keys (Phase 1 Task 8 part 1)', () => {
  it('renders newProject.title (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.title')).toBe('新建项目');
    expect(t('en', 'newProject.title')).toBe('New Project');
  });

  it('renders newProject.nameLabel (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.nameLabel')).toBe('项目名称 *');
    expect(t('en', 'newProject.nameLabel')).toBe('Project Name *');
  });

  it('renders newProject.nameHint (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.nameHint')).toBe('用于显示和文件名，最长 64 字符');
    expect(t('en', 'newProject.nameHint')).toBe('For display and filename, max 64 characters');
  });

  it('renders newProject.dirLabel (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.dirLabel')).toBe('保存位置 *');
    expect(t('en', 'newProject.dirLabel')).toBe('Save Location *');
  });

  it('renders newProject.dirHint (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.dirHint')).toBe('选择项目目录（manifest 文件将保存在此目录下）');
    expect(t('en', 'newProject.dirHint')).toBe(
      'Select project directory (manifest file will be saved here)',
    );
  });

  it('renders newProject.filenamePreview with {dir} and {name} placeholders (zh-CN + en)', () => {
    expect(
      t('zh-CN', 'newProject.filenamePreview', {
        dir: '/projects',
        name: 'myECU',
      }),
    ).toBe('📁 /projects/myECU.autosarcfg.json');
    expect(
      t('en', 'newProject.filenamePreview', {
        dir: '/projects',
        name: 'myECU',
      }),
    ).toBe('📁 /projects/myECU.autosarcfg.json');
  });

  it('renders newProject.browse (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.browse')).toBe('浏览…');
    expect(t('en', 'newProject.browse')).toBe('Browse...');
  });

  it('renders newProject.create (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.create')).toBe('创建');
    expect(t('en', 'newProject.create')).toBe('Create');
  });

  it('renders newProject.cancel (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.cancel')).toBe('取消');
    expect(t('en', 'newProject.cancel')).toBe('Cancel');
  });

  // Sprint 13+ Stage 3.4 — BSWMD chip multi-select strings. The
  // parity test below also iterates the bundle, but these explicit
  // cases document the expected translations for the chip row.
  it('renders newProject.bswmdLabel (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.bswmdLabel')).toBe('预填 BSWMD');
    expect(t('en', 'newProject.bswmdLabel')).toBe('Preload BSWMDs');
  });

  it('renders newProject.bswmdHint (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.bswmdHint')).toBe('可多选；将随模板一并拷贝到项目目录');
    expect(t('en', 'newProject.bswmdHint')).toBe(
      'Select multiple; they will be copied to your project',
    );
  });

  it('renders newProject.noBswmd (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.noBswmd')).toBe('该模板未携带 BSWMD');
    expect(t('en', 'newProject.noBswmd')).toBe('This template has no BSWMD files');
  });

  it('renders confirm.unsaved.title (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.unsaved.title')).toBe('未保存的更改');
    expect(t('en', 'confirm.unsaved.title')).toBe('Unsaved Changes');
  });

  it('renders confirm.unsaved.message with {name} placeholder and embedded \\n (zh-CN + en)', () => {
    const zh = t('zh-CN', 'confirm.unsaved.message', { name: 'MyECU' });
    expect(zh).toBe('当前项目 MyECU 有未保存的更改。\n新建项目将丢失这些更改。');
    expect(zh).toContain('\n');
    const en = t('en', 'confirm.unsaved.message', { name: 'MyECU' });
    expect(en).toBe(
      'Project "MyECU" has unsaved changes.\nCreating a new project will discard them.',
    );
    expect(en).toContain('\n');
  });

  it('renders confirm.unsaved.continue (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.unsaved.continue')).toBe('继续编辑');
    expect(t('en', 'confirm.unsaved.continue')).toBe('Keep Editing');
  });

  it('renders confirm.unsaved.discard (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.unsaved.discard')).toBe('不保存，新建');
    expect(t('en', 'confirm.unsaved.discard')).toBe('Discard & New');
  });

  it('renders confirm.unsaved.saveAndNew (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.unsaved.saveAndNew')).toBe('保存并新建');
    expect(t('en', 'confirm.unsaved.saveAndNew')).toBe('Save & New');
  });

  // Sprint 13 #2 Stage 3.2 Task 4 — per-action confirm variants.
  // The dirty-guard used to render "新建项目" wording for every trigger;
  // these 12 keys (4 actions × 3 axes: message / discard / saveAndNew)
  // restore action-accurate text.
  it('renders confirm.unsaved.message.new with {name} (zh-CN + en)', () => {
    const zh = t('zh-CN', 'confirm.unsaved.message.new', { name: 'P' });
    expect(zh).toBe('当前项目 P 有未保存的更改。\n新建项目将丢失这些更改。');
    const en = t('en', 'confirm.unsaved.message.new', { name: 'P' });
    expect(en).toBe('Project "P" has unsaved changes.\nCreating a new project will discard them.');
  });

  it('renders confirm.unsaved.message.open with {name} (zh-CN + en)', () => {
    const zh = t('zh-CN', 'confirm.unsaved.message.open', { name: 'P' });
    expect(zh).toBe('当前项目 P 有未保存的更改。\n打开其他项目将丢失这些更改。');
    const en = t('en', 'confirm.unsaved.message.open', { name: 'P' });
    expect(en).toBe('Project "P" has unsaved changes.\nOpening another project will discard them.');
  });

  it('renders confirm.unsaved.message.addBswmd with {name} (zh-CN + en)', () => {
    const zh = t('zh-CN', 'confirm.unsaved.message.addBswmd', { name: 'P' });
    expect(zh).toBe('当前项目 P 有未保存的更改。\n添加 BSWMD 将丢失这些更改。');
    const en = t('en', 'confirm.unsaved.message.addBswmd', { name: 'P' });
    expect(en).toBe('Project "P" has unsaved changes.\nAdding a BSWMD will discard them.');
  });

  it('renders confirm.unsaved.message.removeBswmd with {name} {target} (zh-CN + en)', () => {
    const zh = t('zh-CN', 'confirm.unsaved.message.removeBswmd', { name: 'P', target: 'Can' });
    expect(zh).toBe('当前项目 P 有未保存的更改。\n移除 BSWMD Can 将丢失这些更改。');
    const en = t('en', 'confirm.unsaved.message.removeBswmd', { name: 'P', target: 'Can' });
    expect(en).toBe('Project "P" has unsaved changes.\nRemoving BSWMD Can will discard them.');
  });

  it('renders confirm.unsaved.discard.{new,open,addBswmd,removeBswmd} (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.unsaved.discard.new')).toBe('不保存，新建');
    expect(t('en', 'confirm.unsaved.discard.new')).toBe('Discard & New');
    expect(t('zh-CN', 'confirm.unsaved.discard.open')).toBe('不保存，打开');
    expect(t('en', 'confirm.unsaved.discard.open')).toBe('Discard & Open');
    expect(t('zh-CN', 'confirm.unsaved.discard.addBswmd')).toBe('不保存，添加');
    expect(t('en', 'confirm.unsaved.discard.addBswmd')).toBe('Discard & Add');
    expect(t('zh-CN', 'confirm.unsaved.discard.removeBswmd')).toBe('不保存，移除');
    expect(t('en', 'confirm.unsaved.discard.removeBswmd')).toBe('Discard & Remove');
  });

  it('renders confirm.unsaved.saveAndNew.{new,open,addBswmd,removeBswmd} (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.unsaved.saveAndNew.new')).toBe('保存并新建');
    expect(t('en', 'confirm.unsaved.saveAndNew.new')).toBe('Save & New');
    expect(t('zh-CN', 'confirm.unsaved.saveAndNew.open')).toBe('保存并打开');
    expect(t('en', 'confirm.unsaved.saveAndNew.open')).toBe('Save & Open');
    expect(t('zh-CN', 'confirm.unsaved.saveAndNew.addBswmd')).toBe('保存并添加');
    expect(t('en', 'confirm.unsaved.saveAndNew.addBswmd')).toBe('Save & Add');
    expect(t('zh-CN', 'confirm.unsaved.saveAndNew.removeBswmd')).toBe('保存并移除');
    expect(t('en', 'confirm.unsaved.saveAndNew.removeBswmd')).toBe('Save & Remove');
  });

  // Sprint 13 #2 Stage 3.2 Task 5 — overwrite-confirm dialog keys.
  // 2-button confirm (覆盖 / 重命名) shown when project:new IPC returns
  // overwrite-confirm.
  it('renders confirm.overwrite.title (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.overwrite.title')).toBe('文件已存在');
    expect(t('en', 'confirm.overwrite.title')).toBe('File Exists');
  });

  it('renders confirm.overwrite.message with {path} (zh-CN + en)', () => {
    const zh = t('zh-CN', 'confirm.overwrite.message', { path: '/x/p.json' });
    expect(zh).toBe('文件 /x/p.json 已存在。\n是否覆盖现有项目？');
    const en = t('en', 'confirm.overwrite.message', { path: '/x/p.json' });
    expect(en).toBe('File /x/p.json already exists.\nOverwrite the existing project?');
  });

  it('renders confirm.overwrite.continueLabel (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.overwrite.continueLabel')).toBe('重命名');
    expect(t('en', 'confirm.overwrite.continueLabel')).toBe('Rename');
  });

  it('renders confirm.overwrite.discardLabel (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.overwrite.discardLabel')).toBe('覆盖');
    expect(t('en', 'confirm.overwrite.discardLabel')).toBe('Overwrite');
  });

  it('renders app.error.projectNameEmpty (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.error.projectNameEmpty')).toBe('项目名称不能为空');
    expect(t('en', 'app.error.projectNameEmpty')).toBe('Project name cannot be empty');
  });

  it('renders app.error.projectNameInvalid (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.error.projectNameInvalid')).toBe(
      '项目名称含非法字符：< > : " / \\ | ? *',
    );
    expect(t('en', 'app.error.projectNameInvalid')).toBe(
      'Project name contains invalid characters: < > : " / \\ | ? *',
    );
  });

  it('renders app.error.projectNameTooLong (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.error.projectNameTooLong')).toBe('项目名称不能超过 64 字符');
    expect(t('en', 'app.error.projectNameTooLong')).toBe(
      'Project name cannot exceed 64 characters',
    );
  });

  // Sprint 13+ Stage 3.3 — "coming soon" badge for disabled
  // TemplateCard variants. Parity with the existing template.* keys.
  it('renders template.comingSoon (zh-CN + en)', () => {
    expect(t('zh-CN', 'template.comingSoon')).toBe('即将推出');
    expect(t('en', 'template.comingSoon')).toBe('Coming Soon');
  });

  it('renders newProject.templateLabel (zh-CN + en)', () => {
    expect(t('zh-CN', 'newProject.templateLabel')).toBe('选择模板');
    expect(t('en', 'newProject.templateLabel')).toBe('Choose a template');
  });
});

describe('i18n — message bundle parity', () => {
  it('zh-CN bundle and en bundle cover the same set of keys', () => {
    // Order-insensitive: both bundles must declare every MessageKey.
    const zhKeys = new Set(Object.keys(MessagesZhCN));
    const enKeys = new Set(Object.keys(MessagesEn));
    const onlyInZh = ALL_KEYS.filter((k) => !enKeys.has(k));
    const onlyInEn = [...enKeys].filter((k) => !zhKeys.has(k));
    expect(onlyInZh).toEqual([]);
    expect(onlyInEn).toEqual([]);
  });

  it('every key has a non-empty value in both bundles', () => {
    const isNonEmpty = (s: string) => s.trim().length > 0;
    for (const k of ALL_KEYS) {
      expect(isNonEmpty(MessagesZhCN[k]), `zh-CN ${k} is empty`).toBe(true);
      expect(isNonEmpty(MessagesEn[k]), `en ${k} is empty`).toBe(true);
    }
  });
});

describe('i18n — Sprint 14 ECUC ARXML Import (18 keys, spec §7.5)', () => {
  it('renders app.import.button (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.button')).toBe('导入…');
    expect(t('en', 'app.import.button')).toBe('Import…');
  });

  it('renders app.import.title (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.title')).toBe('导入 ECUC ARXML');
    expect(t('en', 'app.import.title')).toBe('Import ECUC ARXML');
  });

  it('renders app.import.moduleSelection.title (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.moduleSelection.title')).toBe('选择要导入的模块');
    expect(t('en', 'app.import.moduleSelection.title')).toBe('Select modules to import');
  });

  it('renders app.import.collision.badge (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.collision.badge')).toBe('⚠ 模块已存在');
    expect(t('en', 'app.import.collision.badge')).toBe('⚠ Module exists');
  });

  it('renders app.import.diff.title with {shortName} (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.diff.title', { shortName: 'CanIf' })).toBe('模块冲突：CanIf');
    expect(t('en', 'app.import.diff.title', { shortName: 'CanIf' })).toBe('Module conflict: CanIf');
  });

  it('renders 4 resolution labels (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.resolution.keepExisting')).toBe('保留现有');
    expect(t('en', 'app.import.resolution.keepExisting')).toBe('Keep existing');
    expect(t('zh-CN', 'app.import.resolution.overwrite')).toBe('覆盖');
    expect(t('en', 'app.import.resolution.overwrite')).toBe('Overwrite');
    expect(t('zh-CN', 'app.import.resolution.keepBoth')).toBe('保留两份');
    expect(t('en', 'app.import.resolution.keepBoth')).toBe('Keep both');
    expect(t('zh-CN', 'app.import.resolution.skip')).toBe('跳过');
    expect(t('en', 'app.import.resolution.skip')).toBe('Skip');
  });

  it('renders app.import.commit.confirm with {N} {M} (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.commit.confirm', { N: 3, M: 2 })).toBe(
      '将 3 个模块合并到 2 个目标文档，是否继续？',
    );
    expect(t('en', 'app.import.commit.confirm', { N: 3, M: 2 })).toBe(
      'Merge 3 module(s) into 2 target document(s). Continue?',
    );
  });

  it('renders app.import.error.readFailed / parseFailed / patchFailed (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.error.readFailed', { path: '/x.arxml', message: 'ENOENT' })).toBe(
      '无法读取 /x.arxml：ENOENT',
    );
    expect(t('en', 'app.import.error.readFailed', { path: '/x.arxml', message: 'ENOENT' })).toBe(
      'Cannot read /x.arxml: ENOENT',
    );
    expect(
      t('zh-CN', 'app.import.error.parseFailed', { path: '/y.arxml', message: 'malformed' }),
    ).toBe('解析 /y.arxml 失败：malformed');
    expect(
      t('en', 'app.import.error.parseFailed', { path: '/y.arxml', message: 'malformed' }),
    ).toBe('Parse /y.arxml failed: malformed');
    expect(t('zh-CN', 'app.import.error.patchFailed', { path: '/z.arxml', message: 'oops' })).toBe(
      '合并到 /z.arxml 失败：oops',
    );
    expect(t('en', 'app.import.error.patchFailed', { path: '/z.arxml', message: 'oops' })).toBe(
      'Merge into /z.arxml failed: oops',
    );
  });

  it('renders app.import.error.noModulesSelected / viewModeLocked (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.error.noModulesSelected')).toBe('未选中任何模块');
    expect(t('en', 'app.import.error.noModulesSelected')).toBe('No modules selected');
    expect(t('zh-CN', 'app.import.error.viewModeLocked')).toBe('请先完成或取消导入');
    expect(t('en', 'app.import.error.viewModeLocked')).toBe(
      'Please finish or cancel the import first',
    );
  });

  it('renders app.import.commit.success with {N} {M} (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.commit.success', { N: 3, M: 2 })).toBe(
      '已合并 3 个模块到 2 个文档',
    );
    expect(t('en', 'app.import.commit.success', { N: 3, M: 2 })).toBe(
      'Merged 3 module(s) into 2 document(s)',
    );
  });

  it('renders app.import.commit.rolledBack and undoLastCommit (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.commit.rolledBack')).toBe('已回滚本次合并（未应用任何修改）');
    expect(t('en', 'app.import.commit.rolledBack')).toBe('Import rolled back (no changes applied)');
    expect(t('zh-CN', 'app.import.undoLastCommit')).toBe('撤销上次合并');
    expect(t('en', 'app.import.undoLastCommit')).toBe('Undo last import');
  });

  it('missing key in one bundle is caught by the parity assertion', () => {
    // Sanity: the bundle parity loop above iterates ALL_KEYS (computed
    // from MessagesZhCN at test-load time). If we forget to add a new
    // key to MessagesEn, that loop fails. This test documents the
    // invariant in one place.
    const zhKeys = new Set(Object.keys(MessagesZhCN));
    for (const k of [
      'app.import.button',
      'app.import.title',
      'app.import.moduleSelection.title',
      'app.import.collision.badge',
      'app.import.diff.title',
      'app.import.resolution.keepExisting',
      'app.import.resolution.overwrite',
      'app.import.resolution.keepBoth',
      'app.import.resolution.skip',
      'app.import.commit.confirm',
      'app.import.error.readFailed',
      'app.import.error.parseFailed',
      'app.import.error.patchFailed',
      'app.import.error.noModulesSelected',
      'app.import.error.viewModeLocked',
      'app.import.commit.success',
      'app.import.commit.rolledBack',
      'app.import.undoLastCommit',
    ] as MessageKey[]) {
      expect(zhKeys.has(k), `zh-CN missing ${k}`).toBe(true);
    }
  });
});

describe('i18n — locale type', () => {
  it('accepts "zh-CN" and "en"', () => {
    const locales: Locale[] = ['zh-CN', 'en'];
    expect(locales).toHaveLength(2);
  });
});

// Sprint 14 #1 Phase B (T9) — 25 script.* keys (spec §6.5). The
// parity test above already enforces key-count parity, but these
// cases document the exact translations and catch silent key
// renames. The brief asks for "19 keys" but the spec / plan locked
// 25; we ship the spec count and let the parity test catch any
// future additions.
describe('i18n — Sprint 14 #1 script engine (spec §6.5, 25 keys)', () => {
  it('renders script.panel.title / panel.toggle / lib.title (zh-CN + en)', () => {
    expect(t('zh-CN', 'script.panel.title')).toBe('脚本');
    expect(t('en', 'script.panel.title')).toBe('Scripts');
    expect(t('zh-CN', 'script.panel.toggle')).toBe('显示/隐藏脚本面板');
    expect(t('en', 'script.panel.toggle')).toBe('Show/hide Scripts panel');
    expect(t('zh-CN', 'script.lib.title')).toBe('脚本库');
    expect(t('en', 'script.lib.title')).toBe('Script library');
  });

  it('renders script.editor / output / lib actions (zh-CN + en)', () => {
    expect(t('zh-CN', 'script.editor.save')).toBe('保存');
    expect(t('en', 'script.editor.save')).toBe('Save');
    expect(t('zh-CN', 'script.editor.run')).toBe('运行');
    expect(t('en', 'script.editor.run')).toBe('Run');
    expect(t('zh-CN', 'script.editor.stop')).toBe('停止');
    expect(t('en', 'script.editor.stop')).toBe('Stop');
    expect(t('zh-CN', 'script.output.title')).toBe('输出');
    expect(t('en', 'script.output.title')).toBe('Output');
    expect(t('zh-CN', 'script.output.commit')).toBe('应用到项目');
    expect(t('en', 'script.output.commit')).toBe('Apply to project');
    expect(t('zh-CN', 'script.output.discard')).toBe('放弃改动');
    expect(t('en', 'script.output.discard')).toBe('Discard');
    expect(t('zh-CN', 'script.lib.new')).toBe('新建');
    expect(t('en', 'script.lib.new')).toBe('New');
    expect(t('zh-CN', 'script.lib.delete')).toBe('删除');
    expect(t('en', 'script.lib.delete')).toBe('Delete');
  });

  it('renders the 4 kind labels (zh-CN + en)', () => {
    expect(t('zh-CN', 'script.kind.validator')).toBe('校验');
    expect(t('en', 'script.kind.validator')).toBe('Validator');
    expect(t('zh-CN', 'script.kind.transformer')).toBe('转换');
    expect(t('en', 'script.kind.transformer')).toBe('Transformer');
    expect(t('zh-CN', 'script.kind.report')).toBe('报告');
    expect(t('en', 'script.kind.report')).toBe('Report');
    expect(t('zh-CN', 'script.kind.free')).toBe('自由');
    expect(t('en', 'script.kind.free')).toBe('Free');
  });

  it('renders the 4 error categories + violation group (zh-CN + en)', () => {
    expect(t('zh-CN', 'script.error.syntax')).toBe('语法错误');
    expect(t('en', 'script.error.syntax')).toBe('Syntax error');
    expect(t('zh-CN', 'script.error.runtime')).toBe('运行时错误');
    expect(t('en', 'script.error.runtime')).toBe('Runtime error');
    expect(t('zh-CN', 'script.error.timeout')).toBe('脚本超时');
    expect(t('en', 'script.error.timeout')).toBe('Script timeout');
    expect(t('zh-CN', 'script.error.import')).toBe('import 解析失败');
    expect(t('en', 'script.error.import')).toBe('Import parse failed');
    expect(t('zh-CN', 'script.violation.group')).toBe('脚本校验');
    expect(t('en', 'script.violation.group')).toBe('Script validations');
  });

  it('missing key in one bundle is caught by the parity assertion (script.* sweep)', () => {
    // The parity test above iterates ALL_KEYS (computed from
    // MessagesZhCN at test-load time). If we forget to add a new
    // key to MessagesEn, that loop fails. This test documents the
    // invariant for the 25 script.* keys.
    const zhKeys = new Set(Object.keys(MessagesZhCN));
    const allScriptKeys = [
      'script.panel.title',
      'script.panel.toggle',
      'script.lib.title',
      'script.lib.empty',
      'script.lib.new',
      'script.lib.delete',
      'script.editor.save',
      'script.editor.run',
      'script.editor.stop',
      'script.editor.placeholder',
      'script.output.title',
      'script.output.clear',
      'script.output.commit',
      'script.output.discard',
      'script.output.summary.mutations',
      'script.output.summary.violations',
      'script.kind.validator',
      'script.kind.transformer',
      'script.kind.report',
      'script.kind.free',
      'script.error.syntax',
      'script.error.runtime',
      'script.error.timeout',
      'script.error.import',
      'script.violation.group',
    ] as MessageKey[];
    for (const k of allScriptKeys) {
      expect(zhKeys.has(k), `zh-CN missing ${k}`).toBe(true);
    }
    // Render every key in en too — catches empty/missing translations.
    for (const k of allScriptKeys) {
      expect(t('en', k).length).toBeGreaterThan(0);
      expect(t('zh-CN', k).length).toBeGreaterThan(0);
    }
  });
});

// Sprint 17a — Dialog i18n audit (H6 → P0). 7 new keys replacing
// 9 hardcoded user-facing strings in 4 files (ConfirmDialog,
// PromptDialog, DiffTable, ImportEntry). The bundle parity test
// above already enforces the keys are present in both bundles;
// these explicit assertions pin the exact translations.
describe('i18n — Sprint 17a dialog i18n audit (7 new keys)', () => {
  it('renders prompt.cancel / prompt.confirm (zh-CN + en)', () => {
    expect(t('zh-CN', 'prompt.cancel')).toBe('取消');
    expect(t('en', 'prompt.cancel')).toBe('Cancel');
    expect(t('zh-CN', 'prompt.confirm')).toBe('确定');
    expect(t('en', 'prompt.confirm')).toBe('OK');
  });

  it('renders confirm.unsaved.saveAndNew.import (zh-CN + en)', () => {
    expect(t('zh-CN', 'confirm.unsaved.saveAndNew.import')).toBe('保存并导入');
    expect(t('en', 'confirm.unsaved.saveAndNew.import')).toBe('Save and import');
  });

  it('renders app.import.diff.column.{existing,incoming,decision} (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.diff.column.existing')).toBe('已存在');
    expect(t('en', 'app.import.diff.column.existing')).toBe('Existing');
    expect(t('zh-CN', 'app.import.diff.column.incoming')).toBe('导入');
    expect(t('en', 'app.import.diff.column.incoming')).toBe('Incoming');
    expect(t('zh-CN', 'app.import.diff.column.decision')).toBe('决策');
    expect(t('en', 'app.import.diff.column.decision')).toBe('Decision');
  });

  it('renders app.import.diff.referenceCount with {count} placeholder (zh-CN + en)', () => {
    expect(t('zh-CN', 'app.import.diff.referenceCount', { count: 0 })).toBe('0 个引用');
    expect(t('zh-CN', 'app.import.diff.referenceCount', { count: 3 })).toBe('3 个引用');
    expect(t('en', 'app.import.diff.referenceCount', { count: 0 })).toBe('0 reference(s)');
    expect(t('en', 'app.import.diff.referenceCount', { count: 5 })).toBe('5 reference(s)');
  });

  it('all 7 new keys are present in both bundles (parity sweep)', () => {
    const zhKeys = new Set(Object.keys(MessagesZhCN));
    const enKeys = new Set(Object.keys(MessagesEn));
    const newKeys = [
      'prompt.cancel',
      'prompt.confirm',
      'app.import.diff.column.existing',
      'app.import.diff.column.incoming',
      'app.import.diff.column.decision',
      'app.import.diff.referenceCount',
      'confirm.unsaved.saveAndNew.import',
    ] as MessageKey[];
    for (const k of newKeys) {
      expect(zhKeys.has(k), `zh-CN missing ${k}`).toBe(true);
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
    }
  });
});

// Suppress the unknown-key warning in parity tests so console output stays
// clean. (No unknown keys expected — this is just hygiene.)
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// Re-export so vitest can find types in this module-scope helper.
// (Type-only — does not affect runtime behavior.)
export type { Messages };
