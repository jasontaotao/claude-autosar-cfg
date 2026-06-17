// @vitest-environment jsdom
//
// FileListTab (Sprint 13 #2 Task 3) — "files" tab content for LeftPanel.
//
// In loose mode (no project) the tab renders a compact header with
// New / Open buttons that drive `useProjectActions`. In project mode
// the tab renders the project's ARXML list and a BSWMD add button.
//
// We mock `useProjectActions` so the test can observe click handlers
// without firing the underlying dialog / IPC / dirty-guard logic. The
// mock returns no-op `vi.fn()`s; the click itself is what we assert on
// (visible buttons exist; clicking an ARXML row sets the active doc).
//
// Tests pin:
//   1. Loose mode shows the New + Open buttons
//   2. Project mode shows the BSWMD add button
//   3. Clicking an ARXML row calls setActiveDocument(path)
//   4. Empty ARXML list shows the localized empty hint

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';
import { FileListTab } from '../FileListTab';

vi.mock('../../hooks/useProjectActions', () => ({
  useProjectActions: () => ({
    newProject: vi.fn(),
    openProjectFromDialog: vi.fn(),
    addBswmdFromDialog: vi.fn(),
  }),
}));

describe('FileListTab', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      project: null,
      projectPath: null,
      documentPaths: [],
      bswmdPaths: [],
      activeDocumentPath: null,
      locale: 'zh-CN',
    });
  });

  it('loose 模式显示 New/Open 按钮', () => {
    render(<FileListTab />);
    expect(screen.getByTestId('file-list-tab-loose-new')).toBeTruthy();
    expect(screen.getByTestId('file-list-tab-loose-open')).toBeTruthy();
  });

  it('project 模式显示 BSWMD 区域', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { valueArxmlPaths: [], bswmdPaths: [] } as any,
    });
    render(<FileListTab />);
    expect(screen.getByTestId('file-list-tab-bswmd-add')).toBeTruthy();
  });

  it('点击 ARXML 文件切换 active', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { valueArxmlPaths: ['/p/EcuC.arxml'], bswmdPaths: [] } as any,
      // setActiveDocument is a no-op on unknown paths (the store
      // rejects paths that aren't in documentPaths), so we mirror the
      // project path into documentPaths first to keep the click
      // round-trip observable.
      documentPaths: ['/p/EcuC.arxml'],
      activeDocumentPath: null,
    });
    render(<FileListTab />);
    fireEvent.click(screen.getByTestId('file-list-tab-arxml-/p/EcuC.arxml'));
    expect(useArxmlStore.getState().activeDocumentPath).toBe('/p/EcuC.arxml');
  });

  it('空 ARXML 列表显示空提示', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { valueArxmlPaths: [], bswmdPaths: [] } as any,
    });
    render(<FileListTab />);
    // Use a function matcher so we can scan all text nodes; the ARXML
    // empty hint is `尚未附加 ARXML...` (no `空` literal) so the spec
    // regex `/空|empty/i` would not match it directly. Match by
    // substring of either hint to stay locale-agnostic.
    expect(
      screen.getByText((content) => content.includes('尚未附加') || /empty/i.test(content)),
    ).toBeTruthy();
  });
});
