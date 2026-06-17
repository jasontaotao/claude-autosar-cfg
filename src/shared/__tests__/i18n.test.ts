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

describe('i18n — locale type', () => {
  it('accepts "zh-CN" and "en"', () => {
    const locales: Locale[] = ['zh-CN', 'en'];
    expect(locales).toHaveLength(2);
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
