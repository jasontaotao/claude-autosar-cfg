// src/renderer/components/__tests__/LeftPanel.collapse.test.tsx
// @vitest-environment jsdom
//
// v1.55.0 — Project Tab Collapse/Expand. Pins the contract:
// - initial render: ProjectPanelInfo is in the DOM (when a project
//   is open); the collapsed placeholder is NOT.
// - click the chevron toggle: ProjectPanelInfo unmounts; the
//   collapsed placeholder mounts; the store's
//   leftPanelProjectCollapsed field is true.
// - click the expand button in the placeholder: ProjectPanelInfo
//   re-mounts; the store's field flips back to false.
//
// Loose-mode variant: when no project is open, the empty placeholder
// is replaced by the collapsed placeholder; clicking the expand
// button brings back the empty placeholder.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';
import { LeftPanel } from '../LeftPanel';

beforeEach(() => {
  useArxmlStore.setState({
    leftPanelProjectCollapsed: false,
    project: null,
    projectPath: null,
    leftTab: 'project',
  });
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('LeftPanel — Project Tab Collapse/Expand (v1.55.0)', () => {
  it('expanded by default: ProjectPanelInfo is rendered when a project is open', () => {
    useArxmlStore.setState({
      project: {
        schemaVersion: '1',
        id: 'test',
        name: 'Test Project',
        valueArxmlPaths: [],
        bswmdPaths: [],
      },
      projectPath: '/proj/test.autosarcfg.json',
    });
    render(<LeftPanel />);
    expect(screen.getByTestId('project-panel-open')).toBeInTheDocument();
    expect(screen.queryByTestId('left-pane-project-collapsed')).not.toBeInTheDocument();
  });

  it('clicking the chevron in the header collapses the panel (body → placeholder)', async () => {
    const user = userEvent.setup();
    useArxmlStore.setState({
      project: {
        schemaVersion: '1',
        id: 'test',
        name: 'Test Project',
        valueArxmlPaths: [],
        bswmdPaths: [],
      },
      projectPath: '/proj/test.autosarcfg.json',
    });
    render(<LeftPanel />);
    expect(screen.getByTestId('project-panel-open')).toBeInTheDocument();

    await user.click(screen.getByTestId('project-panel-collapse-toggle'));

    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(true);
    expect(screen.queryByTestId('project-panel-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('left-pane-project-collapsed')).toBeInTheDocument();
  });

  it('clicking the expand button in the placeholder restores the panel', async () => {
    const user = userEvent.setup();
    useArxmlStore.setState({
      project: {
        schemaVersion: '1',
        id: 'test',
        name: 'Test Project',
        valueArxmlPaths: [],
        bswmdPaths: [],
      },
      projectPath: '/proj/test.autosarcfg.json',
      leftPanelProjectCollapsed: true,
    });
    render(<LeftPanel />);
    expect(screen.queryByTestId('project-panel-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('left-pane-project-collapsed')).toBeInTheDocument();

    await user.click(screen.getByTestId('left-pane-project-collapsed-expand'));

    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(false);
    expect(screen.getByTestId('project-panel-open')).toBeInTheDocument();
  });
});
