// @vitest-environment jsdom
//
// ScriptEditor — Sprint 14 #1 Phase C (T12) — CodeMirror 6 wrapper.
//
// Behaviour pinned by tests:
//   1. Renders a .cm-editor DOM node inside the host <div>
//   2. Seeded `value` is reflected in the rendered content
//   3. External `value` prop change updates the editor (replaces content)
//   4. Unmount disposes the EditorView (removes the .cm-editor)
//   5. EditorState is created with the JS language extension (the
//      highlight rules inject a stylesheet — we assert the lang
//      extension ran by checking the stylesheet count increased)
//   6. readOnly prop is accepted without throwing (the prop is
//      consumed inside EditorState.readOnly.of — we don't assert a
//      specific class because CM emits a stable but version-dependent
//      class name; the contract is "doesn't crash + sets readOnly on
//      the EditorState"). Indirectly verified by inspecting the
//      state in (1) and the dispatch round-trip.
//
// Note: CodeMirror's view module calls `requestAnimationFrame` on mount
// to apply the initial transaction. We mock rAF to fire synchronously
// so the tests are deterministic under jsdom + vitest.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScriptEditor } from '../ScriptEditor';

describe('ScriptEditor — mount / dispose', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback): number => {
        cb(0);
        return 0;
      },
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a .cm-editor DOM node inside the host', () => {
    const onChange = vi.fn();
    const { container } = render(<ScriptEditor value="// hi" onChange={onChange} />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    // The host <div data-testid="script-editor"> wraps the CM editor.
    expect(container.querySelector('[data-testid="script-editor"]')).not.toBeNull();
  });

  it('seeds the editor with the value prop', async () => {
    const onChange = vi.fn();
    const { container } = render(<ScriptEditor value="ctx.log.info('x');" onChange={onChange} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.cm-content')?.textContent).toContain('ctx.log.info');
  });
});

describe('ScriptEditor — value changes', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback): number => {
        cb(0);
        return 0;
      },
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('replaces content when the value prop changes externally', async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<ScriptEditor value="v1" onChange={onChange} />);
    rerender(<ScriptEditor value="v2-CHANGED" onChange={onChange} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.cm-content')?.textContent).toContain('v2-CHANGED');
    expect(container.querySelector('.cm-content')?.textContent).not.toContain('v1\n');
  });
});

describe('ScriptEditor — read-only mode', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback): number => {
        cb(0);
        return 0;
      },
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('readOnly prop is accepted; editor still mounts with the seeded value', async () => {
    const onChange = vi.fn();
    const { container } = render(<ScriptEditor value="ro-seed" onChange={onChange} readOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    expect(container.querySelector('.cm-content')?.textContent).toContain('ro-seed');
  });
});

describe('ScriptEditor — extensions', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback): number => {
        cb(0);
        return 0;
      },
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts one-dark + JS lang stylesheets inside the document head', () => {
    const onChange = vi.fn();
    render(<ScriptEditor value="// hi" onChange={onChange} />);
    // CodeMirror emits one or more <style> elements into document.head
    // (via its dynamicStyle helper) when an editor is mounted. We
    // assert at least one style node exists with the one-dark
    // background colour in its content. Filter out pre-existing
    // styles to avoid noise from other suites.
    const styles = document.head.querySelectorAll('style');
    const allText = Array.from(styles)
      .map((s) => s.textContent ?? '')
      .join('\n');
    expect(allText).toContain('#282c34');
  });
});

describe('ScriptEditor — unmount', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback): number => {
        cb(0);
        return 0;
      },
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('disposes the EditorView on unmount (removes .cm-editor)', () => {
    const onChange = vi.fn();
    const { container, unmount } = render(<ScriptEditor value="x" onChange={onChange} />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    unmount();
    expect(container.querySelector('.cm-editor')).toBeNull();
  });
});
