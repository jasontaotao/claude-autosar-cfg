// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';
import { ValidationPanel } from '../ValidationPanel';

afterEach(cleanup);

// Sprint 13 refactor — ValidationPanel embedded mode.
//
// When `embedded` is true the panel renders inside a tab body, so the
// outer <aside> + <header> + title are removed: the parent tab bar
// already provides the chrome. We assert:
//   - default (no prop) renders <aside> with the localized title
//   - embedded=true renders <div> + a stable testid, no <aside>

describe('ValidationPanel embedded (Sprint 13 refactor)', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      validationErrors: [],
      lastValidatedAt: null,
      locale: 'en',
    });
  });

  it('默认渲染 aside', () => {
    render(<ValidationPanel />);
    // The default empty-state <aside> carries aria-label="Validation".
    expect(screen.getByLabelText(/validation/i)).toBeInTheDocument();
  });

  it('embedded=true 渲染 div 不渲染 aside', () => {
    render(<ValidationPanel embedded />);
    // <aside> has the implicit ARIA role "complementary"; we assert
    // absence via queryByRole, not by tag name, to be robust to any
    // role overrides in the future.
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByTestId('validation-embedded-empty')).toBeInTheDocument();
  });
});
