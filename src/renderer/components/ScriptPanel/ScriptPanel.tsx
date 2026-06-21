// ScriptPanel — Sprint 14 #1 Phase C (T14) — 3-column script editor
// host.
//
// Layout (spec §9 mockup):
//   ┌──────────┬───────────────────┬───────────────────┐
//   │ library  │  ScriptEditor     │  ScriptOutput     │
//   │ (left)   │  (centre)         │  (right)          │
//   └──────────┴───────────────────┴───────────────────┘
//
// Container component — owns the store subscriptions and wires the
// imperative actions (useScriptActions) into the three children. The
// children themselves are pure presentational; this file is the only
// one that touches `useScriptStore` for read/write.
//
// The progress subscription (push channel from main) is mounted here
// so the per-component `ScriptOutput` can render the live log stream
// without owning its own IPC subscription.

import { useEffect, useMemo } from 'react';

import type { ScriptKind, ScriptSummary } from '@main/script/types';
import { t } from '@shared/i18n';

import { useScriptActions } from '../../hooks/useScriptActions';
import { useArxmlStore } from '../../store/useArxmlStore';
import { useScriptStore } from '../../store/useScriptStore';

import { ScriptEditor } from './ScriptEditor';
import { ScriptLibrary } from './ScriptLibrary';
import { ScriptOutput } from './ScriptOutput';

export interface ScriptPanelProps {
  /**
   * Optional callback invoked when the user commits a run's mutations
   * back to the project. Phase D will wire this through to the
   * mutation pipeline; for now it's a no-op placeholder that just
   * clears the run result.
   */
  readonly onCommitMutation?: () => void;
}

export function ScriptPanel({ onCommitMutation }: ScriptPanelProps = {}): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  const scripts = useScriptStore((s) => s.scripts);
  const selectedId = useScriptStore((s) => s.selectedScriptId);
  const editorSource = useScriptStore((s) => s.editorSource);
  const dirty = useScriptStore((s) => s.dirty);
  const runResult = useScriptStore((s) => s.runResult);
  const runProgress = useScriptStore((s) => s.runProgress);
  const loading = useScriptStore((s) => s.loading);
  const initialized = useScriptStore((s) => s.initialized);

  const selectScript = useScriptStore((s) => s.selectScript);
  const setEditorSource = useScriptStore((s) => s.setEditorSource);
  const runScript = useScriptStore((s) => s.runScript);
  const clearOutput = useScriptStore((s) => s.clearOutput);
  const applyMutation = useScriptStore((s) => s.applyMutation);
  const discardMutation = useScriptStore((s) => s.discardMutation);
  const saveScript = useScriptStore((s) => s.saveScript);

  const { loadScripts, subscribeProgress } = useScriptActions();

  // Initial-load guard. We only fetch once when the panel first opens;
  // subsequent mounts reuse the cached list until the user explicitly
  // re-fetches (Phase D may expose a refresh button). The store itself
  // enforces idempotency via the `initialized` flag.
  useEffect(() => {
    if (!initialized) {
      void loadScripts();
    }
  }, [initialized, loadScripts]);

  // Subscribe to the progress push channel for as long as the panel is
  // mounted. The hook returns its own unsubscribe; we call it on
  // unmount. The store's appendProgress reducer is wired inside the
  // hook, so we don't need to handle the events here.
  useEffect(() => {
    const unsubscribe = subscribeProgress(() => {
      /* store handles buffer update; UI re-renders via runProgress */
    });
    return unsubscribe;
  }, [subscribeProgress]);

  // Pre-select the first script when the library becomes non-empty and
  // nothing is selected yet. This gives the user something to look at
  // on first open.
  useEffect(() => {
    if (selectedId === null && scripts.length > 0) {
      const first = scripts[0];
      if (first !== undefined) selectScript(first.id);
    }
  }, [selectedId, scripts, selectScript]);

  const selected = useMemo<ScriptSummary | null>(() => {
    if (selectedId === null) return null;
    return scripts.find((s) => s.id === selectedId) ?? null;
  }, [scripts, selectedId]);

  const handleSelect = (id: string): void => {
    selectScript(id);
  };

  const handleNew = (): void => {
    // Phase D will open the new-script dialog; for now we create a
    // minimal stub with a deterministic shortName so the editor
    // has something to save.
    const shortName = `script-${scripts.length + 1}`;
    const kind: ScriptKind = 'free';
    void saveScript({
      name: `New ${shortName}`,
      shortName,
      kind,
      source: '// new script\nctx.log.info("hello");\n',
    });
  };

  const handleDelete = (id: string): void => {
    void useScriptStore.getState().deleteScript(id);
  };

  const handleRun = (): void => {
    if (selectedId === null) return;
    void runScript(selectedId);
  };

  const handleSave = (): void => {
    if (selectedId === null) return;
    void saveScript({
      id: selectedId,
      name: selected?.name ?? 'unnamed',
      shortName: selected?.shortName ?? 'unnamed',
      kind: selected?.kind ?? 'free',
      source: editorSource,
    });
  };

  const handleCommit = async (): Promise<void> => {
    // Sprint v1.5.1 PR(4) — `applyMutation` is now async and
    // performs an atomic disk write. We MUST await the call so
    // `onCommitMutation` (which may close the panel / navigate
    // away) runs only after the in-memory mutation and disk
    // write have settled. A fire-and-forget call would race the
    // user's next action against the write (code-review H3).
    await applyMutation();
    onCommitMutation?.();
  };

  const handleDiscard = (): void => {
    discardMutation();
  };

  const handleClear = (): void => {
    clearOutput();
  };

  const busy = loading.list || loading.save || loading.run || loading.delete;

  return (
    <section
      className="script-panel"
      aria-label={t(locale, 'script.panel.title')}
      data-testid="script-panel"
    >
      <header className="script-panel-header">
        <h2>{t(locale, 'script.panel.title')}</h2>
        <div className="script-panel-header-actions">
          <button
            type="button"
            className="script-btn-save"
            onClick={handleSave}
            disabled={!dirty || selectedId === null || loading.save}
            data-testid="script-btn-save"
          >
            {t(locale, 'script.editor.save')}
          </button>
          <button
            type="button"
            className="script-btn-run"
            onClick={handleRun}
            disabled={selectedId === null || loading.run}
            data-testid="script-btn-run"
          >
            {t(locale, 'script.editor.run')}
          </button>
        </div>
      </header>
      <div className="script-panel-body">
        <ScriptLibrary
          scripts={scripts}
          selectedId={selectedId}
          locale={locale}
          busy={busy}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
        />
        <ScriptEditor value={editorSource} onChange={setEditorSource} />
        <ScriptOutput
          result={runResult}
          logs={runProgress}
          locale={locale}
          onCommit={handleCommit}
          onDiscard={handleDiscard}
          onClear={handleClear}
        />
      </div>
    </section>
  );
}
