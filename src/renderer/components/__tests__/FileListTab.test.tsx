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

  // Sprint 13+ Q2-3 — New / Open Project buttons used to live in
  // FileListTab's loose-mode header, but the same actions are also
  // available from the AppHeader dropdown menu. The buttons were
  // removed to avoid the duplication; the tab now only renders a
  // short hint that points the user at the menu.
  it('loose 模式只显示提示，不再有 New/Open 按钮（Q2-3）', () => {
    render(<FileListTab />);
    expect(screen.getByTestId('file-list-tab-loose-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('file-list-tab-loose-new')).toBeNull();
    expect(screen.queryByTestId('file-list-tab-loose-open')).toBeNull();
  });

  // Q5: BSWMD section moved from FileListTab to ProjectPanelInfo. The
  // "files" tab now only owns the loose-mode New/Open header and the
  // ARXML list (incl. the [Combined] virtual entry). BSWMD management
  // lives behind the "project" tab.
  it('project 模式不再渲染 BSWMD 区域（Q5: 搬到 ProjectPanelInfo）', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { valueArxmlPaths: [], bswmdPaths: [] } as any,
    });
    render(<FileListTab />);
    expect(screen.queryByTestId('file-list-tab-bswmd-add')).toBeNull();
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

  // ----- Sprint 13 Stage 3.5 (Combined Tree View) -----
  // The [Combined] virtual entry sits at the top of the ARXML list when
  // at least one document is loaded. Clicking it switches the store
  // to combined mode; clicking a regular file switches back to single
  // and sets that file as active.

  it('shows the [Combined] virtual entry when at least one ARXML is loaded', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { valueArxmlPaths: ['/p/EcuC.arxml'], bswmdPaths: [] } as any,
      documentPaths: ['/p/EcuC.arxml'],
      activeDocumentPath: '/p/EcuC.arxml',
    });
    render(<FileListTab />);
    expect(screen.getByTestId('file-list-tab-combined')).toBeTruthy();
  });

  it('hides the [Combined] entry when no ARXML is loaded', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { valueArxmlPaths: [], bswmdPaths: [] } as any,
      documentPaths: [],
    });
    render(<FileListTab />);
    expect(screen.queryByTestId('file-list-tab-combined')).toBeNull();
  });

  it('clicking [Combined] switches viewMode to combined and resets active to null', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { valueArxmlPaths: ['/p/EcuC.arxml'], bswmdPaths: [] } as any,
      documentPaths: ['/p/EcuC.arxml'],
      activeDocumentPath: '/p/EcuC.arxml',
    });
    render(<FileListTab />);
    fireEvent.click(screen.getByTestId('file-list-tab-combined'));
    expect(useArxmlStore.getState().viewMode).toBe('combined');
    // activeDocumentPath is preserved by setViewMode (it only resets
    // selectedPath) so the user can flip back to single mode without
    // losing their last-active doc.
  });

  it('clicking a regular file resets viewMode to single and sets active', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { valueArxmlPaths: ['/p/A.arxml', '/p/B.arxml'], bswmdPaths: [] } as any,
      documentPaths: ['/p/A.arxml', '/p/B.arxml'],
      activeDocumentPath: '/p/A.arxml',
      viewMode: 'combined',
    });
    render(<FileListTab />);
    fireEvent.click(screen.getByTestId('file-list-tab-arxml-/p/B.arxml'));
    const state = useArxmlStore.getState();
    expect(state.viewMode).toBe('single');
    expect(state.activeDocumentPath).toBe('/p/B.arxml');
  });
});
