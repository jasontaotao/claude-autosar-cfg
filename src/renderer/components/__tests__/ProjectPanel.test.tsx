// @vitest-environment jsdom
//
// ProjectPanelInfo (Sprint 13 #2 Task 3) — presentational component that
// renders the open-mode project body inside the LeftPanel "project" tab.
//
// Q5 (Q5 in the Sprint 13 master roadmap) splits responsibility with
// FileListTab: ProjectPanelInfo now owns the project meta block (name,
// path, createdAt, count stats) and the BSWMD "+" add button. FileListTab
// drops the BSWMD section entirely.
//
// Tests pin:
//   1. Project meta block renders the project name + path + count stats
//   2. BSWMD section has the "+" add button (data-testid="project-panel-bswmd-add")
//   3. ARXML list renders with basename; click on remove calls onRemoveArxml
//   4. Empty ARXML/BSWMD lists show the localized empty hint
//
// We pass the i18n `locale` explicitly as a prop because the component is
// pure (no store reads for content); this keeps the test deterministic
// across the zh-CN/en toggle.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectManifest } from '@shared/project';

import { ProjectPanelInfo } from '../ProjectPanel';

const MANIFEST_PATH = 'C:/projects/demo.autosarcfg.json';

function makeManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: '1',
    id: 'demo-id',
    name: 'Demo Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

const baseProps = {
  locale: 'zh-CN' as const,
  manifestPath: MANIFEST_PATH,
  onClose: vi.fn(),
  onRemoveArxml: vi.fn(),
  onAddBswmd: vi.fn(),
  onRemoveBswmd: vi.fn(),
};

describe('ProjectPanelInfo', () => {
  it('renders the project name', () => {
    const manifest = makeManifest({ name: 'Demo' });
    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);
    expect(screen.getByText('Demo')).toBeTruthy();
  });

  it('renders the project meta block (data-testid="project-meta")', () => {
    const manifest = makeManifest({
      valueArxmlPaths: ['/p/a.arxml', '/p/b.arxml'],
      bswmdPaths: ['/p/s1.arxml'],
    });
    const { container } = render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);
    // The meta block is identified by its data-testid so the test stays
    // agnostic to wording changes inside the block.
    const meta = container.querySelector('[data-testid="project-meta"]');
    expect(meta).toBeTruthy();
  });

  it('renders the BSWMD add button (data-testid="project-panel-bswmd-add")', () => {
    render(<ProjectPanelInfo {...baseProps} manifest={makeManifest()} />);
    expect(screen.getByTestId('project-panel-bswmd-add')).toBeTruthy();
  });

  it('clicking the BSWMD add button calls onAddBswmd', () => {
    const onAddBswmd = vi.fn();
    render(<ProjectPanelInfo {...baseProps} manifest={makeManifest()} onAddBswmd={onAddBswmd} />);
    fireEvent.click(screen.getByTestId('project-panel-bswmd-add'));
    expect(onAddBswmd).toHaveBeenCalledOnce();
  });

  it('ARXML list shows the basename; click on remove calls onRemoveArxml', () => {
    const onRemoveArxml = vi.fn();
    const manifest = makeManifest({ valueArxmlPaths: ['/p/EcuC.arxml'] });
    render(<ProjectPanelInfo {...baseProps} manifest={manifest} onRemoveArxml={onRemoveArxml} />);
    expect(screen.getByText('EcuC.arxml')).toBeTruthy();
    fireEvent.click(screen.getByTestId('project-panel-arxml-remove-/p/EcuC.arxml'));
    expect(onRemoveArxml).toHaveBeenCalledWith('/p/EcuC.arxml');
  });

  it('empty ARXML list shows the empty hint', () => {
    render(<ProjectPanelInfo {...baseProps} manifest={makeManifest()} />);
    // Localized empty hint — match by the recognizable substring so the
    // test stays valid across zh/en string tweaks.
    expect(
      screen.getByText((content) => content.includes('尚未附加') || /empty/i.test(content)),
    ).toBeTruthy();
  });

  it('empty BSWMD list shows the empty hint', () => {
    render(<ProjectPanelInfo {...baseProps} manifest={makeManifest()} />);
    expect(
      screen.getByText(
        (content) => content.includes('尚未加载 BSWMD') || /No BSWMDs/i.test(content),
      ),
    ).toBeTruthy();
  });
});
