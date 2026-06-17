// templates helper tests — Sprint 13+ Stage 3.3 Task 1.
//
// The IPC returns `displayNameKey` / `descriptionKey` as raw strings
// (the IPC layer cannot import from @shared/i18n to keep its types
// serializable). `getTemplateDisplayName` / `getTemplateDescription`
// resolve the key to the localized string via the shared `t()` helper.
// `isTemplateAvailable` is the hard-coded gate for Stage 3.3: only
// `empty` is wired up; `classic` and `clone` show the "coming soon"
// badge.

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
} as const;

const CLASSIC_TEMPLATE = {
  id: 'classic',
  displayNameKey: 'template.classic.displayName',
  descriptionKey: 'template.classic.description',
  fileCount: 3,
} as const;

const CLONE_TEMPLATE = {
  id: 'clone',
  displayNameKey: 'template.clone.displayName',
  descriptionKey: 'template.clone.description',
  fileCount: 0,
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
    expect(getTemplateDisplayName('zh-CN', CLASSIC_TEMPLATE)).toBe('经典（即将上线）');
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
  it('returns true for the empty template', () => {
    expect(isTemplateAvailable('empty')).toBe(true);
  });

  it('returns false for the classic template (coming soon)', () => {
    expect(isTemplateAvailable('classic')).toBe(false);
  });

  it('returns false for the clone template (coming soon)', () => {
    expect(isTemplateAvailable('clone')).toBe(false);
  });

  it('returns false for an unknown template id (defensive default)', () => {
    expect(isTemplateAvailable('unknown-template')).toBe(false);
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
