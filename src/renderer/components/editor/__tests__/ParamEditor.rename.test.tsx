// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlPackage } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { ParamEditor } from '../ParamEditor';

const promptMock = vi.fn();

vi.mock('../../PromptDialog', () => ({
  prompt: (options: unknown) => promptMock(options),
}));

function makeDoc(): ArxmlDocument {
  const container: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'ValidSet',
    params: {},
    children: [],
  };
  const pkg: ArxmlPackage = {
    shortName: 'Can',
    path: '/Can',
    elements: [container],
  };
  return { path: '/Can', version: '4.6', packages: [pkg] };
}

beforeEach(() => {
  useArxmlStore.getState().clear();
  useArxmlStore.setState({ locale: 'en', viewMode: 'single' });
  promptMock.mockReset();
});

afterEach(cleanup);

describe('ParamEditor — rename ECUC container instance', () => {
  it('opens the instance-name prompt and submits it through renameContainer', async () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/Can');
    useArxmlStore.getState().select('/Can/ValidSet');
    const renameSpy = vi.fn();
    useArxmlStore.setState({ renameContainer: renameSpy });
    promptMock.mockResolvedValue('FrontValidSet');

    render(<ParamEditor />);
    fireEvent.click(screen.getByTestId('param-editor-rename'));

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalledWith(
        expect.objectContaining({ defaultValue: 'ValidSet' }),
      );
    });
    await waitFor(() => {
      expect(renameSpy).toHaveBeenCalledWith('/Can/ValidSet', 'FrontValidSet');
    });
  });

  it('does not call renameContainer when the prompt is cancelled', async () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/Can');
    useArxmlStore.getState().select('/Can/ValidSet');
    const renameSpy = vi.fn();
    useArxmlStore.setState({ renameContainer: renameSpy });
    promptMock.mockResolvedValue(null);

    render(<ParamEditor />);
    fireEvent.click(screen.getByTestId('param-editor-rename'));

    await waitFor(() => expect(promptMock).toHaveBeenCalled());
    expect(renameSpy).not.toHaveBeenCalled();
  });
});
