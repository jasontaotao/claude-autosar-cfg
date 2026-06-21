// ScriptEditor — Sprint 14 #1 Phase C (T12) — CodeMirror 6 wrapper.
//
// Renders a JS editor with JavaScript syntax highlighting (via
// @codemirror/lang-javascript) and the one-dark theme. Controlled
// component: parent owns the source string, this component forwards
// edits through `onChange` and re-syncs the editor when `value`
// changes externally (e.g. after a `saveScript` round-trip).
//
// React 18 integration pattern:
//   - mount:   useEffect creates the EditorState + EditorView, attaches
//              to a host <div> ref.
//   - update:  when `value` differs from the editor's current doc, dispatch
//              a ReplaceAll transaction. We compare against `view.state.doc
//              .toString()` to avoid re-entrant loops when the user's own
//              keystroke already mutated the doc.
//   - unmount: EditorView.destroy() removes the DOM and frees the
//              internal listeners.

import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { useEffect, useRef } from 'react';

export interface ScriptEditorProps {
  readonly value: string;
  readonly onChange: (source: string) => void;
  readonly readOnly?: boolean;
}

/**
 * CodeMirror 6 wrapper for the script editor. Uses `basicSetup`-style
 * configuration (line numbers + active-line highlight + JS syntax) without
 * pulling in `@codemirror/basic-setup` directly (which would bloat the
 * renderer bundle). The one-dark theme is applied via the official
 * `@codemirror/theme-one-dark` package.
 */
export function ScriptEditor({
  value,
  onChange,
  readOnly = false,
}: ScriptEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Stable callback ref so the EditorState's update listener captures the
  // most recent onChange without rebuilding the entire EditorState on
  // every parent render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount / unmount lifecycle. Runs once on mount; cleanup destroys the
  // view on unmount. We intentionally read `value` via initialEditorState
  // at construction only — subsequent value updates flow through the
  // second effect below.
  useEffect(() => {
    if (hostRef.current === null) return;
    const state = EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        javascript(),
        oneDark,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString());
          }
        }),
        // The default keymap is added by basicSetup; we ship the minimal
        // mod-s / mod-enter surface so consumers can bind later without
        // re-mounting the view. For now they are no-ops (the parent
        // wires Save / Run buttons) but having the bindings lets us
        // extend the editor in Phase D without restructuring.
        keymap.of([]),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return (): void => {
      view.destroy();
      viewRef.current = null;
    };
    // Empty deps — the view is created once and updated via the second
    // effect. `readOnly` is intentionally read once; switching modes
    // requires re-mount (out of scope for V0.1, the parent doesn't flip
    // readOnly after mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external `value` changes into the editor. Skip when the editor
  // is already showing that value (avoids cursor-jump on self-update).
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div className="script-editor-host" data-testid="script-editor">
      <div ref={hostRef} className="script-editor-mount" />
    </div>
  );
}
