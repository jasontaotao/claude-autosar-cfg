// Sprint A+ — deleteEcucModule store action tests.
//
// Pins the contract for the new `deleteEcucModule` action added to the
// MutationSlice. The action removes the ECUC module element at a given
// post-fold path and (for source-backed docs) clears the `sourceBswmdPath`
// link so the ProjectPanel chip no longer shows a dangling "0 modules
// covered by BSWMD" entry.
//
// Tests follow the existing pattern from useArxmlStore.mutation.test.ts:
// drive the store via `useArxmlStore.getState().<action>(...)` and
// assert on `useArxmlStore.getState()` afterwards.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument, ArxmlModule } from '@core/arxml/types';
import type { BswModuleDef, ContainerDef, ParamDef } from '@core/project/bswmd';

import * as combinedDoc from '../helpers/combinedDoc.js';
import { useArxmlStore } from '../useArxmlStore';

// ---------------------------------------------------------------------------
// BSWMD fixture builders (mirrors useArxmlStore.addparam.test.ts:82-124 — kept
// local so this file stays self-contained for any future split)
// ---------------------------------------------------------------------------

function makeBswModule(
  moduleShortName: string,
  containerShortName: string,
  paramShortName: string,
  paramPath: string,
): BswModuleDef {
  const topContainer: ContainerDef = {
    shortName: containerShortName,
    path: `/EAS/${moduleShortName}/${containerShortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers: [],
    parameters: [
      {
        shortName: paramShortName,
        path: paramPath,
        kind: 'integer',
        defaultValue: 0,
        minValue: 0,
        maxValue: 100,
        minLength: null,
        maxLength: null,
        enumerationLiterals: [],
      } satisfies ParamDef,
    ],
    references: [],
    choices: [],
  };
  return {
    shortName: moduleShortName,
    path: `/EAS/${moduleShortName}`,
    dialect: 'ecuc-module-def',
    moduleId: 0,
    containers: [topContainer],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  };
}

function makeBswmd(mod: BswModuleDef) {
  return { version: '4.6', modules: [mod], warnings: [] };
}

function makeModule(shortName: string): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params: {},
    children: [],
    references: [],
  };
}

function makeDoc(opts: { moduleShortName: string; sourceBswmdPath?: string }): ArxmlDocument {
  const moduleEl = makeModule(opts.moduleShortName);
  const doc: ArxmlDocument = {
    path: '/test/Adc_EcucValues.arxml',
    version: '4.6',
    packages: [
      {
        shortName: 'Adc',
        path: '/Adc',
        elements: [moduleEl],
      },
    ],
  };
  if (opts.sourceBswmdPath !== undefined) {
    return { ...doc, sourceBswmdPath: opts.sourceBswmdPath };
  }
  return doc;
}

describe('useArxmlStore.deleteEcucModule (Sprint A+)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('removes the module from a non-source-backed doc', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().addDocument(doc, doc.path);

    // Act — path is the canonical 4-segment `/Adc/Adc` (package
    // shortName `Adc` wraps the ECUC element shortName `Adc` — the
    // "same-name AR-PACKAGE wrapper" shape v1.4.1 Bug 2c handles).
    useArxmlStore.getState().deleteEcucModule('/Adc/Adc');

    // Assert — module removed, no source-link to clear
    // (setInfo stamps the legacy `error` field with the success
    // message for back-compat — see uiSlice.setInfo — so we only
    // check the typed `toast` for the success kind here).
    const next = useArxmlStore.getState();
    expect(next.doc).not.toBeNull();
    expect(next.doc!.packages[0]!.elements.length).toBe(0);
    expect(next.doc!.sourceBswmdPath).toBeUndefined();
    expect(next.toast).not.toBeNull();
    expect(next.toast!.kind).toBe('info');
  });

  it('removes the module AND clears sourceBswmdPath for a source-backed doc', () => {
    // Arrange
    const doc = makeDoc({
      moduleShortName: 'Adc',
      sourceBswmdPath: '/test/Adc_bswmd.arxml',
    });
    useArxmlStore.getState().addDocument(doc, doc.path);

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc/Adc');

    // Assert — module removed AND sourceBswmdPath cleared (no dangling link)
    const next = useArxmlStore.getState();
    expect(next.doc!.packages[0]!.elements.length).toBe(0);
    expect(next.doc!.sourceBswmdPath).toBeUndefined();
  });

  it('surfaces a localized success toast', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().addDocument(doc, doc.path);

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc/Adc');

    // Assert — toast emitted (zh-CN "已删除" / en "Deleted")
    const toast = useArxmlStore.getState().toast;
    expect(toast).not.toBeNull();
    expect(
      toast!.message.match(/已删除 ECUC 模块|Deleted ECUC module|Adc/),
    ).not.toBeNull();
  });

  it('no-ops with error toast when the path does not match any module', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().addDocument(doc, doc.path);
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc/NonExistent');

    // Assert — doc unchanged, error toast
    const next = useArxmlStore.getState();
    expect(next.documents[0]).toBe(before);
    expect(next.doc!.packages[0]!.elements.length).toBe(1);
    expect(next.toast).not.toBeNull();
    expect(next.toast!.kind).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// HIGH-1 regression — deleteEcucModule must thread `state.bswmdSchemas` to
// computeDisplayDoc so the post-mutation fold uses the same BSWMD whitelist
// as pre-mutation. Without this, the fold falls back to the heuristic
// prefix-only path and the displayDoc shape drifts from what the user was
// editing (re-introduces v1.9.0 Sprint X HIGH #1).
//
// Spy approach rationale: the behavioral difference (fold result with vs
// without bswmdSchemas) only surfaces for NESTED package structures
// (`EcucDefs > Adc > module`), but `removeModuleFromDoc` only works on
// FLAT paths (module directly in rootPkg.elements — it filters
// `target.pkg.elements` which is the root package's elements, not the
// package containing the module). So a behavioral test for nested paths
// would short-circuit at the no-op guard. Instead, we spy on
// `computeDisplayDoc` and assert the call signature — that's the
// behavior we actually care about: the helper was called with the
// 5th arg equal to `state.bswmdSchemas`.
// ---------------------------------------------------------------------------

describe('useArxmlStore.deleteEcucModule — HIGH-1 bswmdSchemas threading (v1.9.0 vendor-fold regression)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    vi.restoreAllMocks();
  });

  it('threads state.bswmdSchemas as the 5th argument to computeDisplayDoc', () => {
    // Arrange — flat structure so removeModuleFromDoc finds and removes
    // the module successfully.
    const doc: ArxmlDocument = {
      path: '/test/Adc_EcucValues.arxml',
      version: '4.6',
      packages: [
        {
          shortName: 'Adc',
          path: '/Adc',
          elements: [makeModule('Adc')],
        },
      ],
    };
    useArxmlStore.getState().addDocument(doc, doc.path);
    const expectedSchemas = [
      makeBswmd(
        makeBswModule('Adc', 'AdcConfig', 'TestParam', '/EAS/Adc/AdcConfig/TestParam'),
      ),
    ];
    useArxmlStore.setState({
      bswmdSchemas: expectedSchemas,
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });

    // Spy on computeDisplayDoc — vi.spyOn on a module export works in
    // Vitest's ESM-aware runtime when the import resolves to a named
    // export of the same module object (which `combinedDoc.js`
    // provides). The spy preserves the original implementation.
    const spy = vi.spyOn(combinedDoc, 'computeDisplayDoc');

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc/Adc');

    // Assert — the call MUST have received the populated bswmdSchemas
    // as its 5th argument. Pre-fix the call site omitted the argument
    // entirely (`computeDisplayDoc(a, b, c, d)` — bswmdSchemas
    // defaulted to `[]` inside the fold). After-fix the helper threads
    // `state.bswmdSchemas` and the 5th arg of the post-mutation call
    // is the populated array.
    expect(spy).toHaveBeenCalled();
    // Find the call that matches the post-mutation signature
    // (viewMode, nextDoc, nextDocuments, documentPaths, bswmdSchemas).
    const calledWithSchemas = spy.mock.calls.some(
      (args) =>
        args[0] === 'single' &&
        // 5th arg present and equals our populated schemas reference
        args.length >= 5 &&
        args[4] === expectedSchemas,
    );
    expect(calledWithSchemas).toBe(true);
  });
});
