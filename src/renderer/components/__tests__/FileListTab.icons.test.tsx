// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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

describe('FileListTab icons', () => {
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

  it('renders crisp SVG icons instead of emoji for files and combined view', () => {
    useArxmlStore.setState({
      documentPaths: ['/p/EcuC.arxml'],
      activeDocumentPath: '/p/EcuC.arxml',
      viewMode: 'single',
    });
    const { container } = render(<FileListTab />);
    expect(screen.getByTestId('file-list-tab-combined').querySelector('svg')).not.toBeNull();
    expect(
      screen.getByTestId('file-list-tab-arxml-/p/EcuC.arxml').querySelector('svg'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain('🔗');
    expect(container.textContent).not.toContain('📄');
  });
});
