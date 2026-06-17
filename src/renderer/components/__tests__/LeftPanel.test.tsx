// @vitest-environment jsdom
//
// LeftPanel (Sprint 13 #2 Task 3) — tab-based left sidebar.
//
// The panel owns three tabs (project / files / validate) and renders one
// of them in a grid cell, with the Tree always visible below. The
// "project" tab is hidden in loose mode (no project) so the visible tab
// list collapses to two. The validate tab shows a count badge derived
// from `validationErrors.length` (gated by `lastValidatedAt !== null`).
//
// These tests pin:
//   1. Loose mode → 2 tabs (files + validate, no project)
//   2. Project mode → 3 tabs (project / files / validate)
//   3. Clicking a tab calls setLeftTab (and the active class moves)
//   4. Validate tab badge reflects validationErrors.length
//   5. Loose-mode fallback: persisted leftTab='project' is auto-reset
//      to 'files' on first render so the store doesn't carry a stale
//      'project' id that no longer has a corresponding tab
//
// The Tree component reads `doc` / `selectedPath` / `locale` from the
// store; with `doc === null` it renders an empty hint and stays in
// place under the tab content, which is what we want here.

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';
import { LeftPanel } from '../LeftPanel';

describe('LeftPanel', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      leftTab: 'files',
      project: null,
      projectPath: null,
      validationErrors: [],
      lastValidatedAt: null,
      documentPaths: [],
      bswmdPaths: [],
      documents: [],
      // The Tree consumes `doc` / `selectedPath`; null values keep it in
      // its empty-hint state without throwing.
      doc: null,
      filePath: null,
      selectedPath: null,
    });
  });

  it('loose 模式仍渲染 project tab（Q5: 显示引导占位而非隐藏）', () => {
    render(<LeftPanel />);
    // Q5: project tab stays visible in loose mode so the user can see
    // the "no project open" hint and the "create one" CTA lives
    // behind it. The tab is no longer hidden.
    expect(screen.getByTestId('left-tab-project')).toBeTruthy();
    expect(screen.getByTestId('left-tab-files')).toBeTruthy();
    expect(screen.getByTestId('left-tab-validate')).toBeTruthy();
  });

  it('loose 模式 project tab 显示 empty 占位', () => {
    useArxmlStore.setState({ leftTab: 'project' });
    render(<LeftPanel />);
    // The empty placeholder surfaces a localized "no project" hint.
    expect(screen.getByTestId('left-pane-project-empty')).toBeTruthy();
  });

  it('project 模式渲染三个 tab', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { name: 'demo', valueArxmlPaths: [], bswmdPaths: [] } as any,
      projectPath: 'C:/demo.autosarcfg.json',
    });
    render(<LeftPanel />);
    expect(screen.getByTestId('left-tab-project')).toBeTruthy();
    expect(screen.getByTestId('left-tab-files')).toBeTruthy();
    expect(screen.getByTestId('left-tab-validate')).toBeTruthy();
  });

  it('点击 tab 切换 active state', () => {
    useArxmlStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: { name: 'demo', valueArxmlPaths: [], bswmdPaths: [] } as any,
      projectPath: 'C:/demo.autosarcfg.json',
    });
    render(<LeftPanel />);
    fireEvent.click(screen.getByTestId('left-tab-validate'));
    expect(useArxmlStore.getState().leftTab).toBe('validate');
  });

  it('validate tab 在有错误时显示 badge', () => {
    useArxmlStore.setState({
      lastValidatedAt: 1000,
      validationErrors: [
        {
          kind: 'required',
          path: '/foo',
          message: 'missing',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    render(<LeftPanel />);
    expect(screen.getByTestId('left-tab-validate').textContent).toMatch(/1/);
  });

  it('loose 模式下默认 leftTab=project 保留（Q5: 不再 fallback 到 files）', () => {
    useArxmlStore.setState({ leftTab: 'project' });
    render(<LeftPanel />);
    // Q5: the project tab is now always visible, so we no longer force-
    // reset a stale 'project' id to 'files' on every loose-mode render.
    // The tab content shows the empty placeholder instead.
    expect(useArxmlStore.getState().leftTab).toBe('project');
  });
});
