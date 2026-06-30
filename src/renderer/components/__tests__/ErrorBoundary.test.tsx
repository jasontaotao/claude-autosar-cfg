// @vitest-environment jsdom
//
// ErrorBoundary tests (v1.18.0 MINOR T7 / PB-4).
//
// Renderer-side counterpart to the main-process crash handlers
// (commit 3393e8b — PB-1). The ErrorBoundary wraps the React tree at
// src/renderer/main.tsx so an uncaught render error shows a friendly
// fallback UI instead of a blank window. The user can click "Reset"
// to clear the captured error and re-render the children.
//
// Why a class component: React 18 has no functional ErrorBoundary
// equivalent (the React 19 `use()` hook approach is documented but
// not a 1:1 replacement for getDerivedStateFromError +
// componentDidCatch). Sticking with the class API keeps the boundary
// compatible with React 18.3.1 (the project's pinned version).
//
// Why this lives in renderer (not main): ErrorBoundary only catches
// errors thrown during rendering, lifecycle methods, and constructors
// in the React tree. Main-process crashes are caught by the
// webContents event handlers wired in 3393e8b; renderer-render
// crashes are caught here. The two layers are complementary — main
// covers process-level failures, this covers render-tree failures.
//
// Coverage:
//   1. children that throw on render show the fallback UI
//   2. fallback shows "Something went wrong" + error.message + Reset
//   3. clicking Reset clears the error and re-renders children
//   4. when no error, children render normally (transparent pass-through)

import { fireEvent, render, screen } from '@testing-library/react';
import { Component, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '../ErrorBoundary.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Suppress the React "uncaught error" console.error noise that fires when
// the boundary swallows a render-time throw. The actual production logger
// hook inside ErrorBoundary still runs (we just silence jsdom's stderr
// red herring for cleaner test output).
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

afterEach(() => {
  consoleErrorSpy.mockClear();
});

/**
 * A child that throws on first render, then renders normally after
 * the parent flips its `shouldThrow` state to false. Mirrors the
 * `togglable-throw` pattern used by React's own error-boundary docs.
 */
interface BombProps {
  readonly shouldThrow: boolean;
}

class Bomb extends Component<BombProps> {
  override render(): React.ReactNode {
    if (this.props.shouldThrow) {
      throw new Error('bomb exploded');
    }
    return <div data-testid="bomb-normal">bomb-safe</div>;
  }
}

/**
 * Functional equivalent of Bomb — used in Test 4 (no error path) to
 * exercise the transparent pass-through branch with a function
 * component instead of another class. Catches regressions where the
 * boundary accidentally only accepts class children.
 */
function HealthyChild(): React.ReactNode {
  return <div data-testid="healthy-child">all good</div>;
}

/**
 * Wrapper that lets the test mutate `shouldThrow` from outside via a
 * controlled state. After Reset clears the boundary's error, the
 * boundary re-mounts its children; flipping shouldThrow to false at
 * the same time guarantees the children render normally on the
 * second pass (not throw again).
 */
function ControlledBomb(): React.ReactNode {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <div>
      <button
        type="button"
        data-testid="flip-throw"
        onClick={() => {
          setShouldThrow(false);
        }}
      >
        stop throwing
      </button>
      <ErrorBoundary>
        <Bomb shouldThrow={shouldThrow} />
      </ErrorBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorBoundary (v1.18.0 T7 / PB-4)', () => {
  it('renders the children transparently when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <HealthyChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
    expect(screen.getByText('all good')).toBeInTheDocument();
    // No fallback copy visible.
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('catches a render-time error from a child and shows the fallback UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    // The bomb is gone, the fallback is present.
    expect(screen.queryByTestId('bomb-normal')).toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('fallback shows the heading, the error message, and a Reset button', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('bomb exploded')).toBeInTheDocument();
    const resetButton = screen.getByRole('button', { name: 'Reset' });
    expect(resetButton).toBeInTheDocument();
    expect(resetButton.tagName).toBe('BUTTON');
  });

  it('clicking Reset clears the error and re-renders the children', () => {
    render(<ControlledBomb />);
    // Boundary caught the bomb on first render.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('bomb exploded')).toBeInTheDocument();

    // Flip the bomb off so the next render of children succeeds, then
    // click Reset to clear the captured error.
    fireEvent.click(screen.getByTestId('flip-throw'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    // Children re-render normally; fallback is gone.
    expect(screen.getByTestId('bomb-normal')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
