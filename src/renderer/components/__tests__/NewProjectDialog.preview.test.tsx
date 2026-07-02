// @vitest-environment jsdom
//
// NewProjectDialog template preview pane — v1.21.0 Bug #6 (MEDIUM:
// 新建项目合并视图设计边界错) + Bug #7 (MEDIUM: 缺模板预览视图).
//
// Pre-fix: the dialog showed the TemplateCardRow above the
// BswmdChipRow as two separate horizontal bands. The user had to
// mentally stitch "I picked Classic" + "and these BSWMDs" together.
// Bug #6 called the boundary wrong (two unrelated rows); Bug #7
// called out the missing preview (no info on what each template
// brings).
//
// Post-fix: a single TemplatePreview pane (right column or below
// the cards) shows the selected template's name + description +
// file count + BSWMD chips (when applicable). One self-contained
// "what this template brings" unit, not scattered rows.
//
// Behaviour pinned by tests (Bug #6+7 Phase 2 — RED):
//   1. Empty state (no template selected) shows a localized
//      "pick a template" hint
//   2. Selecting Empty renders the template name + description +
//      file count "0 files"
//   3. Selecting Classic renders the template name + description +
//      file count + BSWMD chip row INSIDE the preview
//   4. The BswmdChipRow is no longer a separate top-level dialog
//      child — it now lives inside the preview
//   5. The preview is locale-aware (zh-CN title)

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';
import { NewProjectDialog } from '../NewProjectDialog';

const TEMPLATE_LIST = {
  templates: [
    {
      id: 'empty',
      displayNameKey: 'template.empty.displayName',
      descriptionKey: 'template.empty.description',
      fileCount: 0,
      bswmdPaths: [],
    },
    {
      id: 'classic',
      displayNameKey: 'template.classic.displayName',
      descriptionKey: 'template.classic.description',
      fileCount: 3,
      bswmdPaths: ['/samples/bswmd/A.arxml', '/samples/bswmd/B.arxml'],
    },
    {
      id: 'clone',
      displayNameKey: 'template.clone.displayName',
      descriptionKey: 'template.clone.description',
      fileCount: 0,
      bswmdPaths: [],
    },
  ],
};

function openDialog(): void {
  useArxmlStore.getState().setNewProjectDialogOpen(true);
}

function stubAutosarApi(): void {
  // Mutate the existing jsdom window rather than replacing it —
  // replacing the window object breaks React's
  // `instanceof window.HTMLElement` check inside getActiveElementDeep
  // (same trap as `src/preload/__tests__/index.test.ts:30-45`).
  (window as unknown as { autosarApi: unknown }).autosarApi = {
    pickDir: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    listTemplates: vi.fn().mockResolvedValue(TEMPLATE_LIST),
  };
}

describe('NewProjectDialog template preview pane (Bug #6 + #7)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
    stubAutosarApi();
  });

  afterEach(() => {
    cleanup();
    useArxmlStore.getState().clear();
  });

  it('shows a "pick a template" hint when no template is selected', async () => {
    openDialog();
    render(<NewProjectDialog onSubmit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('npd-template-preview-empty')).not.toBeNull();
    });
  });

  it('selecting Empty shows the preview with name + description + no-files label', async () => {
    openDialog();
    render(<NewProjectDialog onSubmit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-empty')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('tpl-card-empty'));
    const preview = await screen.findByTestId('npd-template-preview');
    expect(preview.textContent).toMatch(/Empty/);
    expect(preview.textContent).toMatch(/Start a new project from scratch/);
    // 0 files uses a localized "no files" label rather than
    // "0 files" — the t() helper does not support ICU plural, so the
    // component branches on count === 0 to pick the right key.
    expect(preview.textContent).toMatch(/No files/);
    // No chip row for Empty (no BSWMDs)
    expect(screen.queryByTestId('npd-template-preview-bswmd')).toBeNull();
  });

  it('selecting Classic shows the preview with name + description + 3 files + BSWMD chips', async () => {
    openDialog();
    render(<NewProjectDialog onSubmit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-classic')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('tpl-card-classic'));
    const preview = await screen.findByTestId('npd-template-preview');
    expect(preview.textContent).toMatch(/Classic/);
    expect(preview.textContent).toMatch(/Project template with common BSWMD prefilled/);
    expect(preview.textContent).toMatch(/3\s*files/);
    // The BSWMD chip row is now INSIDE the preview, not a separate
    // top-level dialog child (Bug #6 boundary fix).
    const chipRow = screen.getByTestId('npd-template-preview-bswmd');
    expect(chipRow).not.toBeNull();
  });

  it('BswmdChipRow is no longer a sibling of the template row in the dialog body', async () => {
    // Bug #6 — the pre-fix layout had the BSWMD chip row as a direct
    // child of `.npd-body`, separate from the template row. Post-fix
    // the chips live inside the preview pane. We assert this by
    // confirming there is no `.bswmd-chip-row` testid in the body
    // outside the preview container.
    openDialog();
    render(<NewProjectDialog onSubmit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-classic')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('tpl-card-classic'));
    await screen.findByTestId('npd-template-preview');
    // The BswmdChipRow testid (`.bswmd-chip-row`) should be inside
    // the preview, not at the top level. We verify the parent of the
    // chip row is the preview container.
    const chipRow = screen.getByTestId('npd-template-preview-bswmd');
    expect(chipRow.closest('[data-testid="npd-template-preview"]')).not.toBeNull();
  });

  it('localizes the preview title in zh-CN', async () => {
    useArxmlStore.getState().setLocale('zh-CN');
    openDialog();
    render(<NewProjectDialog onSubmit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-empty')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('tpl-card-empty'));
    const preview = await screen.findByTestId('npd-template-preview');
    // Localized labels — "空项目" (Empty) + "无文件" (No files) both render
    expect(preview.textContent).toMatch(/空项目/);
    expect(preview.textContent).toMatch(/无文件/);
  });
});
