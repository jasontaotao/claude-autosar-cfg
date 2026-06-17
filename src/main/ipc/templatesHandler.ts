// Sprint 13 #1 — `templates:list` and `templates:copy` IPC handlers.
//
// The cache (`_builtinTemplates`) is populated at app boot in
// `src/main/index.ts` via `discoverBuiltinTemplates()`. Handlers read
// from the cache; they do NOT re-scan disk. This is intentional: the
// disk layout is a build-time / install-time artifact, and the
// renderer should never see mid-scan state.
//
// Test injection: `__setTestCache()` lets unit tests bypass the app
// ref. `__setTestResolveSamplesRoot()` lets tests point samples-root
// resolution at a tempdir (the production resolveSamplesRoot uses
// `app.getAppPath()` which is meaningless outside Electron). The
// underscored names mark these as test-only exports; ESLint's
// no-underscore-export rule has an explicit exception for this file.

import { existsSync } from 'node:fs';
import { relative } from 'node:path';

import { app } from 'electron';

import {
  copyTemplateFilesToDir,
  discoverBuiltinTemplates,
  classTemplateError,
  setTemplatesLogger,
} from '../templates/index.js';
import type { BuiltinTemplate } from '../templates/types.js';
import type {
  TemplateListRequest,
  TemplateListResponse,
  TemplateCopyRequest,
  TemplateCopyResponse,
} from '../../shared/types.js';

/** Underlying cache slot. Set by main/index.ts at boot, or by tests. */
let _builtinTemplates: BuiltinTemplate[] = [];

/** Test-only samples-root override. `null` means use the real resolver. */
let _testSamplesRoot: string | null = null;

/** Test-only cache injection. Returns the previous value. */
export function __setTestCache(templates: BuiltinTemplate[] | null): BuiltinTemplate[] {
  const prev = _builtinTemplates;
  _builtinTemplates = templates ?? [];
  return prev;
}

/** Test-only samples-root injection. Pass `null` to use the real resolver. */
export function __setTestResolveSamplesRoot(root: string | null): void {
  _testSamplesRoot = root;
}

/**
 * Resolve the samples root directory. Dev: `<repo>/samples` next to
 * `app.getAppPath()`. Prod: `<resourcesPath>/samples` (electron-builder
 * `extraResources` lands it there). Returns `null` if neither path
 * exists — caller should treat this as "templates disabled".
 */
export function resolveSamplesRoot(): string | null {
  if (_testSamplesRoot !== null) return _testSamplesRoot;
  const candidates: string[] = [
    `${app.getAppPath()}/samples`, // dev
    `${process.resourcesPath}/samples`, // prod
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Initialize the cache at app boot. Idempotent. */
export function initBuiltinTemplatesCache(): void {
  // Wire the logger to Electron's logger; fall back to a noop if absent.
  const e = app as unknown as { logger?: { warn: (msg: string, meta?: unknown) => void } };
  if (e.logger) setTemplatesLogger(e.logger);
  const root = resolveSamplesRoot();
  if (root === null) {
    _builtinTemplates = [];
    return;
  }
  _builtinTemplates = discoverBuiltinTemplates(root);
}

export async function templatesListHandler(
  _req: TemplateListRequest,
): Promise<TemplateListResponse> {
  return {
    templates: _builtinTemplates.map((t) => ({
      id: t.id,
      // The i18n keys are derived from the template id, not stored on
      // the cache. The cache may carry stale or test-injected
      // displayNameKey/descriptionKey values; deriving here keeps the
      // IPC contract stable.
      displayNameKey: `template.${t.id}.displayName`,
      descriptionKey: `template.${t.id}.description`,
      fileCount: t.fileCount,
    })),
  };
}

export async function templatesCopyHandler(
  req: TemplateCopyRequest,
): Promise<TemplateCopyResponse> {
  const template = _builtinTemplates.find((t) => t.id === req.templateId);
  if (!template) {
    throw classTemplateError('unknown-template', `未找到模板: ${req.templateId}`, {
      templateId: req.templateId,
    });
  }
  // Check destDir BEFORE the copy — `copyTemplateFilesToDir` short-
  // circuits empty templates and would otherwise silently succeed
  // against a missing destDir.
  if (!existsSync(req.destDir)) {
    throw classTemplateError('dest-dir-missing', `目标目录不存在: ${req.destDir}`, {
      destDir: req.destDir,
    });
  }
  const samplesRoot = resolveSamplesRoot();
  if (samplesRoot === null) {
    throw classTemplateError('samples-root-missing', 'samples 根目录未初始化');
  }
  const result = copyTemplateFilesToDir(template, samplesRoot, req.destDir);
  // Strip the leading samplesRoot from each path so renderer gets
  // project-relative paths (the renderer will often want to display
  // them in a tree view next to other project files). We normalize
  // separators to POSIX (`/`) so the IPC response is platform-
  // independent — the renderer's tree view uses `/` regardless of
  // host OS, and a Windows backslash would be re-interpreted as an
  // escape character in JSON.
  const toProjectRel = (p: string): string => relative(req.destDir, p).split(/[\\/]/).join('/');
  return {
    copiedValueArxml: result.copiedValueArxml.map(toProjectRel),
    copiedBswmd: result.copiedBswmd.map(toProjectRel),
  };
}
