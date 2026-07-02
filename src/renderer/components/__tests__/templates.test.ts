// templates helper tests — Sprint 13+ Stage 3.3 Task 1 + v1.21.0
// MINOR T2 (template availability gate).
//
// The IPC returns `displayNameKey` / `descriptionKey` as raw strings
// (the IPC layer cannot import from @shared/i18n to keep its types
// serializable). `getTemplateDisplayName` / `getTemplateDescription`
// resolve the key to the localized string via the shared `t()` helper.
// `isTemplateAvailable` is the data-driven gate landed in v1.21.0
// MINOR T2: empty is always available, every other template requires
// `fileCount > 0` so a broken on-disk layout cannot render as a
// clickable card that copies an empty directory.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n';

import {
  getTemplateDisplayName,
  getTemplateDescription,
  isTemplateAvailable,
} from '../templates.js';

const SAMPLE_TEMPLATE = {
  id: 'empty',
  displayNameKey: 'template.empty.displayName',
  descriptionKey: 'template.empty.description',
  fileCount: 0,
  bswmdPaths: [],
} as const;

const CLASSIC_TEMPLATE = {
  id: 'classic',
  displayNameKey: 'template.classic.displayName',
  descriptionKey: 'template.classic.description',
  fileCount: 3,
  bswmdPaths: [],
} as const;

const CLONE_TEMPLATE = {
  id: 'clone',
  displayNameKey: 'template.clone.displayName',
  descriptionKey: 'template.clone.description',
  fileCount: 0,
  bswmdPaths: [],
} as const;

beforeEach(() => {
  // Defensive: the t() helper warns on unknown keys; silence in tests.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('templates helper — getTemplateDisplayName', () => {
  it('resolves the empty template display name in zh-CN', () => {
    expect(getTemplateDisplayName('zh-CN', SAMPLE_TEMPLATE)).toBe('空项目');
  });

  it('resolves the empty template display name in en', () => {
    expect(getTemplateDisplayName('en', SAMPLE_TEMPLATE)).toBe('Empty Project');
  });

  it('resolves the classic template display name in zh-CN', () => {
    // v1.21.0 MINOR T2 — Classic is now actionable (samples/arxml/classic/
    // ships 5 BSWMDs + 4 ECUC configs). The "(coming soon)" wording
    // was retired from both bundles; the test locks the new copy in
    // so a future drift is loud.
    expect(getTemplateDisplayName('zh-CN', CLASSIC_TEMPLATE)).toBe('经典项目');
  });

  it('resolves the clone template display name in en', () => {
    expect(getTemplateDisplayName('en', CLONE_TEMPLATE)).toBe('Clone (coming soon)');
  });
});

describe('templates helper — getTemplateDescription', () => {
  it('resolves the empty template description in zh-CN', () => {
    expect(getTemplateDescription('zh-CN', SAMPLE_TEMPLATE)).toBe('从零开始创建项目');
  });

  it('resolves the empty template description in en', () => {
    expect(getTemplateDescription('en', SAMPLE_TEMPLATE)).toBe('Start a new project from scratch');
  });

  it('resolves the classic template description in en', () => {
    expect(getTemplateDescription('en', CLASSIC_TEMPLATE)).toBe(
      'Project template with common BSWMD prefilled',
    );
  });

  it('resolves the clone template description in zh-CN', () => {
    expect(getTemplateDescription('zh-CN', CLONE_TEMPLATE)).toBe('基于现有项目创建副本');
  });
});

describe('templates helper — isTemplateAvailable', () => {
  // v1.21.0 MINOR T2 — data-driven gate. The pre-T2 implementation
  // hard-coded `templateId === 'empty' || templateId === 'classic'`
  // (templates.ts:67) and never checked whether the template actually
  // shipped files. The Stage 3.3 + 3.4 plan (per the original
  // templates.ts:14-15 comment) was to flip this to "empty always
  // available, non-empty requires fileCount > 0" once the Classic
  // template files landed. T2 lands that change alongside the
  // samples/arxml/classic/ addition.

  it('returns true for the empty template (always available, even with fileCount=0)', () => {
    expect(isTemplateAvailable(SAMPLE_TEMPLATE)).toBe(true);
  });

  it('returns true for the classic template once it ships files (fileCount > 0)', () => {
    expect(isTemplateAvailable(CLASSIC_TEMPLATE)).toBe(true);
  });

  it('returns false for the clone template (no files yet — coming soon)', () => {
    expect(isTemplateAvailable(CLONE_TEMPLATE)).toBe(false);
  });

  it('returns false for an empty classic template stub (defensive — fileCount must be > 0)', () => {
    // If someone ships a template.json for `classic` but the disk
    // layout is broken (no value-side / BSWMD files), the gate
    // refuses to render it as actionable. Better to show "coming soon"
    // than a clickable card that copies an empty directory.
    const stub = { ...CLASSIC_TEMPLATE, fileCount: 0 };
    expect(isTemplateAvailable(stub)).toBe(false);
  });
});

describe('templates helper — locale handling', () => {
  it('switches display + description text when locale flips', () => {
    const locale: Locale = 'zh-CN';
    expect(getTemplateDisplayName(locale, SAMPLE_TEMPLATE)).toBe('空项目');
    expect(getTemplateDescription(locale, SAMPLE_TEMPLATE)).toBe('从零开始创建项目');

    expect(getTemplateDisplayName('en', SAMPLE_TEMPLATE)).toBe('Empty Project');
    expect(getTemplateDescription('en', SAMPLE_TEMPLATE)).toBe('Start a new project from scratch');
  });
});
