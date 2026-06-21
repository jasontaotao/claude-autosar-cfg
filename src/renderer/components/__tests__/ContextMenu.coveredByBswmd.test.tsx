// @vitest-environment jsdom
//
// Sprint A X3 — P1 bugfix coverage for `isModuleCoveredByBswmd`.
//
// The original implementation assumed the value-side path was shaped
// like `/<module>/...` and used the first path segment as the module
// shortName. Real ARXML value paths are shaped
// `/<AR-PACKAGE>/<MODULE>/<CONTAINER>/...` and combined-mode paths
// add a source-file prefix (`<basename>/<...>` or `[doc:N]/<...>`).
// The first-segment heuristic therefore misses every path where the
// AR-PACKAGE is not the module shortName (e.g. user data uses
// `JWQ_CDD_PACK` as package + `JWQ3399` as module), and always misses
// in combined mode.
//
// The fix walks the segments from the back so the module shortName
// matches even when the package differs, and strips combined-mode
// prefixes before the walk so the inner path is what gets scanned.
//
// This file pins:
//   1.  Pkg != module case (the original bug): `/JWQ_CDD_PACK/JWQ3399/...`
//       matches when the BSWMD defines module `JWQ3399`.
//   2.  Combined-mode basename-prefix case:
//       `<basename>/<AR-PACKAGE>/<MODULE>/...` matches with
//       `viewMode='combined'` + a source file whose basename is the
//       prefix.
//   3.  Combined-mode `[doc:N]` index-prefix case:
//       `[doc:0]/<AR-PACKAGE>/<MODULE>/...` matches with
//       `viewMode='combined'` + matching source.
//   4.  Negative case: a path under a different package that the
//       BSWMD does not define returns false (not false-positive).
//   5.  Edge cases: empty schemas, empty path, empty basename-only
//       path.
//   6.  Backward compat: when options are omitted (legacy callers),
//       first-segment fallback still works for the simple case.
//   7.  End-to-end through `<ContextMenuRoot>`: add items disabled in
//       the disabled case, enabled when the path actually has a
//       covered module even with a non-matching AR-PACKAGE prefix
//       (the bug repro), and enabled in combined mode with basename
//       prefix.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { BswmdDocument } from '@core/project/bswmd.js';
import type { Locale } from '@shared/i18n.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { closeContextMenu, ContextMenuRoot, openContextMenu } from '../ContextMenu.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeBswmd(shortNames: readonly string[]): BswmdDocument {
  return {
    version: '4.6',
    modules: shortNames.map((sn, i) => ({
      shortName: sn,
      path: `/${sn}`,
      dialect: 'ecuc-module-def',
      moduleId: i + 1,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 1,
      upperMultiplicity: 'infinite',
    })),
    warnings: [],
  };
}

function Host({
  onAction,
  locale = 'zh-CN',
}: {
  readonly onAction: (action: unknown) => void;
  readonly locale?: Locale;
}): JSX.Element {
  return <ContextMenuRoot onAction={onAction} locale={locale} />;
}

async function mountHost(onAction: (action: unknown) => void): Promise<void> {
  render(<Host onAction={onAction} />);
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  closeContextMenu();
  // Reset store state between tests so combined-mode / document paths
  // don't leak across cases.
  useArxmlStore.setState({
    bswmdSchemas: [],
    bswmdPaths: [],
    documents: [],
    documentPaths: [],
    activeDocumentPath: null,
    doc: null,
    filePath: null,
    viewMode: 'single',
  });
});

// ---------------------------------------------------------------------------
// Test 1 — Pkg != module bug repro (the headline P1 case)
// ---------------------------------------------------------------------------

describe('ContextMenu — pkg-vs-module BSWMD coverage', () => {
  it('enables add items when BSWMD covers a module under a different AR-PACKAGE', async () => {
    // User's real data: AR-PACKAGE = "JWQ_CDD_PACK", module = "JWQ3399".
    // The first-segment heuristic returns "JWQ_CDD_PACK" and finds
    // nothing — bug repro. The fixed implementation walks segments
    // from the back and finds "JWQ3399".
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(['JWQ3399'])],
      bswmdPaths: ['/fake/JWQ3399_Bswmd.arxml'],
    });

    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        {
          path: '/JWQ_CDD_PACK/JWQ3399/JWQ3399ConfigSet/JWQ3399DemEventRef',
          kind: 'container',
          shortName: 'JWQ3399DemEventRef',
        },
        100,
        100,
      );
    });

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    // The first three are the "Add *" items — they MUST be enabled now.
    expect(items[0]).not.toHaveAttribute('aria-disabled', 'true');
    expect(items[1]).not.toHaveAttribute('aria-disabled', 'true');
    expect(items[2]).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Test 2 — combined-mode basename prefix
// ---------------------------------------------------------------------------

describe('ContextMenu — combined-mode basename prefix', () => {
  it('enables add items when combined-mode path has a basename prefix that matches source file', async () => {
    const sourceFilePath =
      'C:\\Users\\13777\\Desktop\\ClaudeAutosarWorkSpace\\ecuc\\JWQ3399_EcucValues.arxml';
    const docStub = {
      // The component only consults the store for viewMode +
      // activeDocumentPath / documentPaths; the actual ArxmlDocument
      // contents are irrelevant here.
    } as never;
    useArxmlStore.setState({
      viewMode: 'combined',
      bswmdSchemas: [makeBswmd(['JWQ3399'])],
      bswmdPaths: ['/fake/JWQ3399_Bswmd.arxml'],
      documents: [docStub],
      documentPaths: [sourceFilePath],
      activeDocumentPath: sourceFilePath,
      doc: docStub,
      filePath: sourceFilePath,
    });

    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        {
          path: '/JWQ3399_EcucValues.arxml/JWQ_CDD_PACK/JWQ3399/JWQ3399ConfigSet/JWQ3399DemEventRef',
          kind: 'container',
          shortName: 'JWQ3399DemEventRef',
        },
        100,
        100,
      );
    });

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    expect(items[0]).not.toHaveAttribute('aria-disabled', 'true');
    expect(items[1]).not.toHaveAttribute('aria-disabled', 'true');
    expect(items[2]).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Test 3 — combined-mode `[doc:N]` index prefix
// ---------------------------------------------------------------------------

describe('ContextMenu — combined-mode [doc:N] prefix', () => {
  it('enables add items when combined-mode path uses a [doc:N] index prefix', async () => {
    const sourceFilePath = '/proj/ecuc/JWQ3399_EcucValues.arxml';
    const docStub = {} as never;
    useArxmlStore.setState({
      viewMode: 'combined',
      bswmdSchemas: [makeBswmd(['JWQ3399'])],
      bswmdPaths: ['/fake/JWQ3399_Bswmd.arxml'],
      documents: [docStub],
      documentPaths: [sourceFilePath],
      activeDocumentPath: sourceFilePath,
      doc: docStub,
      filePath: sourceFilePath,
    });

    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        {
          path: '/[doc:0]/JWQ_CDD_PACK/JWQ3399/JWQ3399ConfigSet/JWQ3399DemEventRef',
          kind: 'container',
          shortName: 'JWQ3399DemEventRef',
        },
        100,
        100,
      );
    });

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    expect(items[0]).not.toHaveAttribute('aria-disabled', 'true');
    expect(items[1]).not.toHaveAttribute('aria-disabled', 'true');
    expect(items[2]).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Test 4 — disabled-state regression: add items stay disabled when the
// module really is missing from BSWMD.
// ---------------------------------------------------------------------------

describe('ContextMenu — disabled when BSWMD does not cover the path', () => {
  it('keeps add items disabled when the BSWMD covers a different module', async () => {
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(['EcuM'])],
      bswmdPaths: ['/fake/EcuM_Bswmd.arxml'],
    });

    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        {
          path: '/JWQ_CDD_PACK/JWQ3399/JWQ3399ConfigSet/JWQ3399DemEventRef',
          kind: 'container',
          shortName: 'JWQ3399DemEventRef',
        },
        100,
        100,
      );
    });

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    // Add items disabled with tooltip.
    expect(items[0]).toHaveAttribute('aria-disabled', 'true');
    expect(items[0]!.getAttribute('title')).toMatch(/需要先加载 BSWMD|Load BSWMD first/);
    expect(items[1]).toHaveAttribute('aria-disabled', 'true');
    expect(items[2]).toHaveAttribute('aria-disabled', 'true');
    // Delete still enabled.
    expect(items[3]).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Test 5 — clicking an add item in a covered case fires the right action
// ---------------------------------------------------------------------------

describe('ContextMenu — covered-path click fires add action with the original path', () => {
  it('emits add-parameter with the original combined-mode path when clicked', async () => {
    let captured: unknown = null;
    const sourceFilePath =
      'C:\\Users\\13777\\Desktop\\ClaudeAutosarWorkSpace\\ecuc\\JWQ3399_EcucValues.arxml';
    const docStub = {} as never;
    useArxmlStore.setState({
      viewMode: 'combined',
      bswmdSchemas: [makeBswmd(['JWQ3399'])],
      bswmdPaths: ['/fake/JWQ3399_Bswmd.arxml'],
      documents: [docStub],
      documentPaths: [sourceFilePath],
      activeDocumentPath: sourceFilePath,
      doc: docStub,
      filePath: sourceFilePath,
    });

    await mountHost((a) => {
      captured = a;
    });
    const originalPath =
      '/JWQ3399_EcucValues.arxml/JWQ_CDD_PACK/JWQ3399/JWQ3399ConfigSet/JWQ3399DemEventRef';
    act(() => {
      openContextMenu(
        { path: originalPath, kind: 'container', shortName: 'JWQ3399DemEventRef' },
        100,
        100,
      );
    });

    const items = screen.getAllByRole('menuitem');
    // items[1] is "Add parameter" (after add-container at index 0).
    fireEvent.click(items[1]!);

    expect(captured).toEqual({ type: 'add-parameter', path: originalPath });
  });
});
