import { useState } from 'react';

import type {
  ArxmlDocument,
  ArxmlElement,
  OpenArxmlResult,
  ParseArxmlResponse,
  ParseError,
  SaveArxmlResponse,
} from '../../shared/types.js';

interface ArxmlPanelState {
  readonly doc: ArxmlDocument | null;
  readonly path: string | null;
  readonly error: string | null;
  readonly busy: boolean;
}

const INITIAL: ArxmlPanelState = {
  doc: null,
  path: null,
  error: null,
  busy: false,
};

/**
 * Narrow ParseError's 4 discriminated kinds to a single display string.
 * Avoids 'message' in parsed.error (which TS-narrows incorrectly across kinds
 * — only xml-malformed/missing-root/invalid-structure carry `message`,
 * unsupported-version carries `version`).
 */
function formatParseError(e: ParseError): string {
  switch (e.kind) {
    case 'xml-malformed':
      return `XML malformed: ${e.message}`;
    case 'missing-root':
      return `Missing root element: ${e.message}`;
    case 'unsupported-version':
      return `Unsupported AUTOSAR version: ${e.version}`;
    case 'invalid-structure':
      return `Invalid structure at ${e.path}: ${e.message}`;
  }
}

export function ArxmlPanel(): JSX.Element {
  const [state, setState] = useState<ArxmlPanelState>(INITIAL);

  const onOpen = async (): Promise<void> => {
    setState((s) => ({ ...s, busy: true, error: null }));
    const opened: OpenArxmlResult = await window.autosarApi.openArxml({
      title: 'Open AUTOSAR ARXML',
    });
    if (opened.canceled || opened.content === undefined || opened.path === undefined) {
      setState((s) => ({ ...s, busy: false }));
      return;
    }
    const parsed: ParseArxmlResponse = await window.autosarApi.parseArxml({
      path: opened.path,
      content: opened.content,
    });
    if (!parsed.ok) {
      setState((s) => ({
        ...s,
        busy: false,
        error: `Parse failed: ${formatParseError(parsed.error)}`,
      }));
      return;
    }
    setState({ doc: parsed.value, path: opened.path, error: null, busy: false });
  };

  const onSave = async (): Promise<void> => {
    if (state.doc === null) return;
    setState((s) => ({ ...s, busy: true, error: null }));
    const defaultName = state.path?.split(/[\\/]/).pop() ?? 'untitled.arxml';
    const saved: SaveArxmlResponse = await window.autosarApi.saveArxml({
      doc: state.doc,
      defaultName,
    });
    if (!saved.ok) {
      setState((s) => ({ ...s, busy: false, error: `Save failed: ${saved.error.message}` }));
      return;
    }
    if (saved.value.canceled) {
      setState((s) => ({ ...s, busy: false }));
      return;
    }
    setState((s) => ({
      ...s,
      busy: false,
      path: saved.value.path ?? s.path,
    }));
  };

  const packageCount = state.doc?.packages.length ?? 0;
  const elementCount =
    state.doc?.packages.reduce(
      (acc, p) => acc + p.elements.length + countNestedElements(p.elements),
      0,
    ) ?? 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-2 text-xl font-semibold">ARXML I/O</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Open an AUTOSAR ARXML file, inspect it, and save changes back.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          disabled={state.busy}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Open ARXML
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={state.busy || state.doc === null}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Save ARXML
        </button>
      </div>
      {state.path !== null && (
        <p className="mt-3 font-mono text-xs text-slate-500">
          File: {state.path}
        </p>
      )}
      {state.doc !== null && (
        <p className="mt-1 font-mono text-xs text-slate-500">
          Packages: {packageCount} • Elements: {elementCount} • Version: {state.doc.version}
        </p>
      )}
      {state.error !== null && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </div>
  );
}

function countNestedElements(elements: readonly ArxmlElement[]): number {
  let n = 0;
  for (const e of elements) {
    if (e.kind === 'module' || e.kind === 'container') {
      const kids = e.children;
      n += kids.length + countNestedElements(kids);
    }
  }
  return n;
}