// @vitest-environment jsdom
//
// App workspace resizer (Q1: left tree column drag-to-resize).
//
// Pins the contract that `<App />` mounts the workspace as a
// `react-resizable-panels` horizontal Group with a draggable
// Separator between the left and right columns:
//
//   - The library's `data-separator` attribute appears inside
//     `.workspace`. The library attaches this to the
//     `<Separator />` element (v4 of react-resizable-panels; the
//     older `data-panel-resize-handle-id` is a v2 attribute).
//   - The Separator carries our `className="workspace-resize-h"`.
//     We target it via the class because v4 of the library
//     overwrites the user-supplied `id` and `data-testid` with
//     internal react-id placeholders (`:r2:`, `:ri:`); the
//     className is the only stable user-controlled selector.
//   - The Separator exposes `aria-orientation="horizontal"` as the
//     source of truth for direction (v4 puts the attribute on the
//     Separator, not the Group).
//   - The left + right panels expose `data-panel` and the
//     user-supplied `id` ("left" / "right").
//
// Dragging the separator via `fireEvent.pointerDown` + pointer
// events triggers the library's pointer pipeline without
// throwing. We do not assert on the final flex-grow value
// because v4 reads the Group's `clientWidth` to compute the new
// size and jsdom returns 0 for every layout box; the E2E spec
// in `tests/e2e/workspace-resize.spec.ts` exercises the real
// layout path under Playwright + Chromium.
//
// Persistence (`useDefaultLayout` / localStorage) is NOT exercised
// here — it is owned by the library and is covered by the E2E
// spec.
//
// Local polyfills (ResizeObserver + PointerEvent):
//   jsdom 24.1 ships without `ResizeObserver` or `PointerEvent`
//   as globals. `react-resizable-panels` v4 reads
//   `ResizeObserver` from `element.ownerDocument.defaultView`
//   during `mountGroup` and dispatches `pointerdown` /
//   `pointermove` / `pointerup` events on the document during
//   drag. We install thin no-op polyfills inline at the top of
//   this file (rather than in `src/test/setup.ts`) so the
//   polyfills are scoped to the Q1 test suite and do not
//   contaminate the rest of the suite. The Q1 polyfill is
//   re-installed on every test run by vitest's per-file
//   evaluation; the install is idempotent.

class ResizeObserverPolyfill {
  private readonly callbacks = new Set<ResizeObserverCallback>();
  constructor(cb: ResizeObserverCallback) {
    this.callbacks.add(cb);
  }
  observe(): void {
    /* no-op: jsdom does not produce layout */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    this.callbacks.clear();
  }
}

class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, {
      ...init,
      bubbles: init.bubbles ?? true,
      cancelable: init.cancelable ?? true,
    });
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (typeof g.ResizeObserver === 'undefined') {
  g.ResizeObserver = ResizeObserverPolyfill;
  if (typeof g.window !== 'undefined') {
    g.window.ResizeObserver = ResizeObserverPolyfill;
  }
}
if (typeof g.PointerEvent === 'undefined') {
  g.PointerEvent = PointerEventPolyfill;
  if (typeof g.window !== 'undefined') {
    g.window.PointerEvent = PointerEventPolyfill;
  }
}

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

// ---------------------------------------------------------------------------
// Test fixture: stub the preload bridge so AppHeader (and any other
// component that touches `window.autosarApi`) renders without throwing in
// jsdom. Mirrors the contract used by `App.test.tsx`.
// ---------------------------------------------------------------------------

interface MinimalAutosarApi {
  readonly getAppVersion: ReturnType<typeof vi.fn>;
  readonly openArxml: ReturnType<typeof vi.fn>;
  readonly openArxmlMulti: ReturnType<typeof vi.fn>;
  readonly parseArxml: ReturnType<typeof vi.fn>;
  readonly saveArxml: ReturnType<typeof vi.fn>;
  readonly projectNew: ReturnType<typeof vi.fn>;
  readonly projectOpen: ReturnType<typeof vi.fn>;
  readonly projectSave: ReturnType<typeof vi.fn>;
  readonly openBswmdDialog: ReturnType<typeof vi.fn>;
  readonly readBswmd: ReturnType<typeof vi.fn>;
  readonly pickDir: ReturnType<typeof vi.fn>;
}

function installAutosarApiStub(): MinimalAutosarApi {
  const stub: MinimalAutosarApi = {
    getAppVersion: vi.fn().mockResolvedValue('0.12.0'),
    openArxml: vi.fn().mockResolvedValue({ canceled: true }),
    openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    parseArxml: vi.fn(),
    saveArxml: vi.fn(),
    projectNew: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    projectOpen: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    projectSave: vi.fn().mockResolvedValue({ kind: 'write-failed', message: '' }),
    openBswmdDialog: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    readBswmd: vi.fn().mockResolvedValue({ kind: 'read-failed', message: '' }),
    pickDir: vi.fn().mockResolvedValue({ kind: 'canceled' }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = stub;
  return stub;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  installAutosarApiStub();
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window.autosarApi;
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App workspace resizer (Q1: drag-to-resize left column)', () => {
  it('mounts a Separator inside the .workspace container', () => {
    render(<App />);
    // The handle carries our `className="workspace-resize-h"` and
    // the library's `data-separator` attribute. v4 of the library
    // overwrites the user-supplied id / data-testid with internal
    // react-id placeholders, so we look up by class instead.
    const handle = document.querySelector('.workspace-resize-h');
    expect(handle).not.toBeNull();
    expect(handle!.hasAttribute('data-separator')).toBe(true);
  });

  it('mounts a data-group Group with horizontal orientation inside .workspace', () => {
    render(<App />);
    const workspace = document.querySelector('.workspace');
    expect(workspace).not.toBeNull();
    const group = workspace!.querySelector('[data-group]');
    expect(group).not.toBeNull();
    // v4 of the library annotates the Separator with
    // `aria-orientation` describing the axis the separator moves
    // along — for a horizontal Group the separator moves
    // vertically, so the attribute reads "vertical". The Group
    // itself only carries `data-group`. We pin the Group +
    // Separator pairing as the source of truth for "horizontal
    // layout": the Separator is present and the Group wraps two
    // `data-panel` children, which is the v4 contract.
    const separator = workspace!.querySelector('.workspace-resize-h');
    expect(separator).not.toBeNull();
    expect(separator!.getAttribute('aria-orientation')).toBe('vertical');
    const panels = workspace!.querySelectorAll('[data-panel]');
    expect(panels.length).toBe(2);
  });

  it('mounts two data-panel children (left + right) with their configured ids', () => {
    render(<App />);
    // v4 of the library prefixes the Panel's `id` with the Group's
    // `id` (defaulting to "workspace") + "-" + the panel id. Our
    // Group has no `id` prop so the prefix is "workspace-", giving
    // "workspace-left" / "workspace-right" for the rendered DOM.
    const leftPanel = document.querySelector('[data-panel][id="workspace-left"]');
    const rightPanel = document.querySelector('[data-panel][id="workspace-right"]');
    expect(leftPanel).not.toBeNull();
    expect(rightPanel).not.toBeNull();
  });

  it('keeps LeftPanel mounted in the left panel and ParamEditor mounted in the right panel', () => {
    render(<App />);
    // LeftPanel renders a stable testid for its tab bar.
    expect(screen.getByTestId('left-tab-files')).toBeInTheDocument();
    // ParamEditor renders a section with an aria-label.
    const editor = document.querySelector('section[aria-label="Parameter editor"]');
    expect(editor).not.toBeNull();
  });

  it('responds to pointer drag on the separator without throwing', async () => {
    // This test pins the contract that the library's pointer-event
    // pipeline (pointerdown → pointermove → pointerup) integrates
    // with our workspace handle. We do NOT assert on the final
    // flex-grow value because v4 of `react-resizable-panels` reads
    // the Group's `clientWidth` to compute the new size — jsdom
    // returns 0 for every layout box, so the library's
    // `onLayoutChange` commits 0/0 and the flex-grow stays put.
    //
    // What we DO pin:
    //   1. The library's pointerdown listener is registered on the
    //      Group (capture phase) — `pointerdown` on the separator
    //      bubbles up and triggers it.
    //   2. The library's document-level pointermove + pointerup
    //      listeners are wired and do not throw on a synthetic
    //      PointerEvent.
    //
    // E2E coverage in `tests/e2e/workspace-resize.spec.ts`
    // exercises the real layout update path under Playwright +
    // Chromium.
    render(<App />);
    const handle = document.querySelector('.workspace-resize-h') as HTMLElement;
    expect(handle).not.toBeNull();

    const startX = 200;
    const startY = 100;

    expect(() => {
      fireEvent(
        handle,
        new PointerEvent('pointerdown', {
          clientX: startX,
          clientY: startY,
          button: 0,
          pointerType: 'mouse',
          bubbles: true,
          cancelable: true,
        }),
      );
      fireEvent(
        document,
        new PointerEvent('pointermove', {
          clientX: startX + 50,
          clientY: startY,
          button: 0,
          pointerType: 'mouse',
          bubbles: true,
        }),
      );
      fireEvent(
        document,
        new PointerEvent('pointerup', {
          clientX: startX + 50,
          clientY: startY,
          button: 0,
          pointerType: 'mouse',
          bubbles: true,
        }),
      );
    }).not.toThrow();

    // After the pointer events, the library commits a new layout
    // asynchronously. Wait one tick for the commit to flush so
    // downstream tests don't see stale state.
    await waitFor(() => {
      // The library leaves the panels in the DOM after drag, even
      // when the size is 0/0 in jsdom. Asserting presence is the
      // strongest post-condition we can verify in a layout-less
      // environment.
      const leftPanel = document.querySelector('[data-panel][id="workspace-left"]');
      expect(leftPanel).not.toBeNull();
    });
  });
});
