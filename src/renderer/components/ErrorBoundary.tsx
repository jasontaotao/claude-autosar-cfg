// ErrorBoundary — renderer-side React ErrorBoundary for the v1.18.0
// MINOR T7 (PB-4) crash-resilience batch.
//
// What it catches:
//   - Errors thrown during render, in lifecycle methods, or in the
//     constructors of any descendant component.
//   - Errors thrown inside React's reconciler itself (rare; the
//     boundary is the recommended catch-all per React docs).
//
// What it does NOT catch (out of scope for this layer):
//   - Main-process crashes — those are caught by the webContents
//     event handlers wired in src/main/index.ts (commit 3393e8b, PB-1).
//   - Errors inside event handlers, async code, or setTimeout callbacks
//     unless they bubble up into render — for those, callers should
//     surface failures into the store-backed ErrorBanner instead.
//   - Server-side rendering — we are Electron renderer only.
//
// Why a class component:
//   React 18 has no functional ErrorBoundary equivalent. React 19's
//   `use()` hook can unwrap contexts/promises but does not replace
//   `getDerivedStateFromError` + `componentDidCatch`. The project is
//   pinned to React 18.3.1, so the class API is the only option.
//   `componentDidCatch` is also the recommended place for logging —
//   keep it here so production debugging signals land somewhere
//   observable.
//
// Reset semantics:
//   The captured error lives in component state. Resetting calls
//   `setState({ error: null })` which causes `render()` to return
//   `this.props.children` again. The children re-mount at that point,
//   so any local state they held (useState etc.) is fresh — this is
//   the desired "blank slate" UX after a render crash.
//
// Custom fallback:
//   Tests and callers can supply a `fallback` render-prop to swap the
//   default UI for a branded or context-aware one. The render-prop
//   receives `(error, reset)` so callers can compose their own
//   recovery UX without forking the boundary.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Optional render-prop for callers that need a custom fallback UI.
   * Receives the captured error and the `reset` callback. When
   * omitted, a friendly default fallback is rendered.
   */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Stash the captured error in state so render() can swap to the
    // fallback on the next pass.
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to the console — the project does not yet ship a
    // dedicated telemetry sink, and console.error keeps the signal
    // visible in the DevTools console without adding a runtime
    // dependency. When a real reporter is added later, swap this
    // body for the reporter call (do not also log to console).
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  reset = (): void => {
    // Clear the captured error. The next render returns
    // `this.props.children`, which remounts the subtree and gives
    // the user a fresh slate after a crash.
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      const custom = this.props.fallback;
      if (custom !== undefined) {
        return custom(error, this.reset);
      }
      return (
        <div role="alert" style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h1>Something went wrong</h1>
          <p>{error.message}</p>
          <button type="button" onClick={this.reset}>
            Reset
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
