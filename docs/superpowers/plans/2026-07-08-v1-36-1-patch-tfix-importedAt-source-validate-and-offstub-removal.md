# v1.36.1 PATCH Implementation Plan — T-fix review findings closure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 3 actionable review findings from the v1.36.0 MINOR post-ship review (M1 importedAt source-of-truth + M2 readXlsxHistory per-record validation + L1 offXlsxImportComplete dead stub).

**Architecture:** Three small surgical fixes — single source-of-truth for `importedAt` (one timestamp travels in the IPC push payload), defensive per-record validator at the JSON storage boundary (drop + warn on shape mismatch), YAGNI-driven deletion of a stub that doesn't actually unsubscribe. No new IPC channels, no new env vars, no new dependencies.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Zod is available in the project but per-record validation here is a 5-line type guard — adding Zod just for one record shape violates YAGNI.

**Baseline:** v1.36.0 MINOR `f880cbd` (3041 + 7 SKIP / 0 fail)
**Target:** 3046 + 7 SKIP / 0 fail (+5 net)

## Global Constraints

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings (matches v1.36.0 T1 pattern).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task, one task reviewer per task.
- Each task ends with its own test running and passing — do not defer tests to the end.
- Test additions must include the covering test command and pass locally before commit.
- Exact values (i18n key names, kind strings, channel names, file paths) MUST match this plan verbatim.
- Implementer MUST NOT dispatch `pkm-capture` (parent controller's job — same rule from v1.32.0 T3 finding).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

---

## Task 1: xlsxImportListener imports `importedAt` from push payload (M1)

### Files

- Modify: `src/renderer/store/xlsxImportListener.ts:11-14` (extend `XlsxImportCompletePayload` type) + `:47-53` (use payload's `importedAt` instead of `Date.now()`)
- Modify: `src/main/ipc/xlsxEcucBatchImportHandler.ts:478-481` (add `importedAt` to the broadcast payload)
- Modify: `src/preload/index.ts:307-321` (extend `onXlsxImportComplete` payload type to include `importedAt`)
- Test: `src/renderer/store/__tests__/xlsxImportListener.test.ts` (extend existing tests with new timestamp assertion)

### Interfaces

**Consumes:** existing `XlsxImportCompletePayload` interface (currently `{rows, source}` only)

**Produces:** extended type

```ts
interface XlsxImportCompletePayload {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  readonly importedAt: number; // v1.36.1 PATCH M1 — single source-of-truth
}
```

### Why this is M1

The v1.36.0 MINOR T-fix shipped with `importedAt` computed independently in two places: the main-side save call (`Date.now()` at xlsxEcucBatchImportHandler.ts:498) and the renderer-side listener (`Date.now()` at xlsxImportListener.ts:51). The two timestamps differ by a few milliseconds; the user's UI shows the in-memory timestamp inside the session and the on-disk timestamp after restart. The fix makes the main process the single source of truth — main computes `Date.now()` once, threads it into both the push payload (for the renderer's `xlsxLastImport`) and the persistence call (for the disk file).

### Steps

#### Step 1.1: Write the failing test

Open `src/renderer/store/__tests__/xlsxImportListener.test.ts` and find the existing test that asserts the listener sets `xlsxLastImport`. It probably mocks `window.autosarApi.onXlsxImportComplete` and verifies `useArxmlStore.getState().xlsxLastImport` has the expected `rows` / `source`. Add (or extend) an assertion that **the listener uses `payload.importedAt` verbatim** rather than stamping its own `Date.now()`.

Add this new test at the end of the file (or extend the existing case — your call based on what reads cleaner with the existing test structure):

```ts
test('v1.36.1 PATCH M1: uses payload.importedAt verbatim, not Date.now()', () => {
  // Arrange — pin a deterministic timestamp so we can assert verbatim
  const FIXED_TS = 1_700_000_000_000;
  const receivedAt = Date.now();
  const bridge = window.autosarApi as unknown as {
    onXlsxImportComplete: (h: (p: unknown) => void) => () => void;
  };
  let captured: ((p: unknown) => void) | null = null;
  bridge.onXlsxImportComplete = (h) => {
    captured = h;
    return () => undefined;
  };
  attachXlsxImportListener();

  // Act — push a payload with FIXED_TS in the SAME session the
  // test started (so we can prove listener didn't re-stamp it).
  captured!({
    rows: [],
    source: 'wizard',
    importedAt: FIXED_TS,
  });

  // Assert — stored record's importedAt is FIXED_TS verbatim
  const stored = useArxmlStore.getState().xlsxLastImport;
  expect(stored).not.toBeNull();
  expect(stored!.importedAt).toBe(FIXED_TS);
  // And it must NOT equal the ambient timestamp captured before the
  // push (would prove listener re-stamped).
  expect(stored!.importedAt).not.toBe(receivedAt);
});
```

#### Step 1.2: Run test to verify it fails

Run: `pnpm exec vitest run src/renderer/store/__tests__/xlsxImportListener.test.ts`
Expected: FAIL — the current listener signature only knows `rows` + `source`, so `payload.importedAt` is type-undefined and the store gets stamped with `Date.now()` from the listener body. The assertion `expect(stored!.importedAt).toBe(FIXED_TS)` will fail with `Expected: 1700000000000 / Received: <Date.now()>`. The typecheck will also flag the missing field if `tsc --noEmit` is run.

If the test passes, the listener is already reading from the payload — stop, this means the bug was already fixed. Do not proceed.

#### Step 1.3: Extend the IPC push payload with `importedAt`

Edit `src/main/ipc/xlsxEcucBatchImportHandler.ts:478-481`:

```ts
mainWindow.webContents.send(IPC_CHANNELS.XLSX_IMPORT_COMPLETE, {
  rows: appliedRows,
  source: 'wizard',
  // v1.36.1 PATCH M1 — single source-of-truth for importedAt.
  // Main computes the timestamp ONCE and threads it into both this
  // push payload (renderer in-memory xlsxLastImport) and the
  // xlsxHistorySave call below (disk persistence).
  importedAt: Date.now(),
});
```

(The `Date.now()` call below at line 498 becomes redundant — task 1.5 removes it.)

#### Step 1.4: Extend the listener type and use payload.importedAt

Edit `src/renderer/store/xlsxImportListener.ts`:

```ts
interface XlsxImportCompletePayload {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  // v1.36.1 PATCH M1 — main computes importedAt once and pushes it
  // verbatim. Previously the listener stamped its own Date.now()
  // here, which diverged from the main-side save timestamp by a few
  // ms (caused cross-session display jitter on the Reuse button +
  // time element).
  readonly importedAt: number;
}

// ... inside attachXlsxImportListener, replace the handler body:
const handler = (payload: XlsxImportCompletePayload) => {
  useArxmlStore.getState().setXlsxLastImport({
    rows: payload.rows,
    source: payload.source,
    importedAt: payload.importedAt,
  });
};
```

#### Step 1.5: Make main compute the timestamp ONCE and reuse it

Edit `src/main/ipc/xlsxEcucBatchImportHandler.ts` so that the broadcast payload and the `xlsxHistorySaveHandler` call share a single `importedAt`. The current shape stamps `Date.now()` at each call site. Replace both:

```ts
// v1.36.1 PATCH M1 — single source-of-truth for importedAt
const importedAt = Date.now();

if (typeof BrowserWindow !== 'undefined' && BrowserWindow !== null) {
  const mainWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.XLSX_IMPORT_COMPLETE, {
      rows: appliedRows,
      source: 'wizard',
      importedAt,
    });
  }
}

// ... a few lines later, replace the save call's Date.now():
const saveRes = await xlsxHistorySaveHandler({
  rows: appliedRows,
  source: 'wizard',
  importedAt, // v1.36.1 PATCH M1 — share with the broadcast above
});
```

#### Step 1.6: Extend preload's `onXlsxImportComplete` type

Edit `src/preload/index.ts:307-321`. The current type is:

```ts
onXlsxImportComplete: (
  handler: (payload: {
    readonly rows: readonly EcucInstanceRow[];
    readonly source: 'manual' | 'wizard';
  }) => void,
) => { /* ... */ },
```

Replace with:

```ts
onXlsxImportComplete: (
  handler: (payload: {
    readonly rows: readonly EcucInstanceRow[];
    readonly source: 'manual' | 'wizard';
    // v1.36.1 PATCH M1 — listen inherits main's timestamp
    readonly importedAt: number;
  }) => void,
) => { /* ... */ },
```

The inner listener closure that re-types the IPC payload (line 313-318) also needs `importedAt: number` added to its inline type.

#### Step 1.7: Run test to verify it passes

Run: `pnpm exec vitest run src/renderer/store/__tests__/xlsxImportListener.test.ts`
Expected: PASS (including the new M1 assertion).

Run typecheck: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec tsc --noEmit -p tsconfig.web.json`
Expected: both clean (no type mismatch on the extended payload).

#### Step 1.8: Commit

```bash
git add src/renderer/store/xlsxImportListener.ts \
        src/renderer/store/__tests__/xlsxImportListener.test.ts \
        src/main/ipc/xlsxEcucBatchImportHandler.ts \
        src/preload/index.ts
git commit -m "fix(renderer+main+preload): v1.36.1 PATCH T1 — single source-of-truth for importedAt

v1.36.0 T-fix shipped with importedAt computed independently in
two places: main-side save call (Date.now() at handler:498)
and renderer-side listener (Date.now() at xlsxImportListener:51).
The two timestamps differ by a few ms; UI showed the in-memory
timestamp inside the session and the on-disk timestamp after
restart (DcmConfigXlsxImportHistory uses importedAt as both
<time> content and React key).

M1 makes main the single source-of-truth: Date.now() at the
broadcast site is reused for the xlsxHistorySave call that
follows. Renderer no longer stamps its own timestamp; it reads
verbatim from payload.importedAt. onXlsxImportComplete bridge
type extends to include the new field.

+1 listener test (uses payload.importedAt verbatim; asserts it
differs from the ambient captured timestamp).
tsc clean."
```

---

## Task 2: readXlsxHistory validates per-record shape (M2)

### Files

- Modify: `src/main/xlsxHistoryStorage.ts:34-65` (add `isMainXlsxImportRecord` type guard + use in `readXlsxHistory`)
- Test: `src/main/xlsxHistoryStorage.test.ts` (add 3 tests: hand-edited bad shape, missing-rows record, valid 5-record round-trip)

### Why this is M2

v1.36.0 T1 ships a `readXlsxHistory` that only validates the top-level `Array.isArray`. Each element is cast to `MainXlsxImportRecord` via `as` without any field-level check. A hand-edited or pre-v1.36.0 written file can have `[{ source: 'wizard' }]` (missing rows) and the renderer will crash on `record.rows.map(...)` because `rows` is `undefined`. This violates CLAUDE.md coding-style.md "input validation at system boundaries / never trust external data". Defensive guard drops bad records, warns, and returns the valid prefix.

### Steps

#### Step 2.1: Write the failing tests

Open `src/main/xlsxHistoryStorage.test.ts` and append a new `describe` block at the end:

```ts
describe('v1.36.1 PATCH T2 — readXlsxHistory per-record validation', () => {
  // ... existing test file setup (mock app.getPath, writeAtomic, etc.)

  test('drops a record missing rows and returns the valid prefix', async () => {
    // Arrange — write a file with 1 valid + 1 invalid record
    const path = historyFilePath();
    const fs = await import('node:fs');
    const { resolve } = await import('node:path');
    fs.mkdirSync(resolve(path, '..'), { recursive: true });
    fs.writeFileSync(
      path,
      JSON.stringify([
        // valid
        { rows: [], source: 'wizard', importedAt: 100 },
        // invalid — missing rows
        { source: 'wizard', importedAt: 200 },
      ]),
    );
    // suppress expected warn
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Act
    const records = readXlsxHistory();

    // Assert — only the valid record survives
    expect(records).toHaveLength(1);
    expect(records[0].importedAt).toBe(100);

    warnSpy.mockRestore();
  });

  test('drops a record with wrong source union, returns [] when all bad', async () => {
    const path = historyFilePath();
    const fs = await import('node:fs');
    const { resolve } = await import('node:path');
    fs.mkdirSync(resolve(path, '..'), { recursive: true });
    fs.writeFileSync(path, JSON.stringify([{ rows: [], source: 'bogus', importedAt: 100 }]));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const records = readXlsxHistory();

    expect(records).toEqual([]);
    warnSpy.mockRestore();
  });

  test('drops a record where importedAt is a string, not a number', async () => {
    const path = historyFilePath();
    const fs = await import('node:fs');
    const { resolve } = await import('node:path');
    fs.mkdirSync(resolve(path, '..'), { recursive: true });
    fs.writeFileSync(
      path,
      JSON.stringify([{ rows: [], source: 'wizard', importedAt: '1700000000000' }]),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const records = readXlsxHistory();

    expect(records).toEqual([]);
    warnSpy.mockRestore();
  });
});
```

(Adapt the test fixture setup to whatever helper the existing test file uses to write the file — read the existing tests first; if it writes via `writeXlsxHistory`, use that for setup and craft the bad-file case by directly using `fs.writeFileSync` to the resolved `historyFilePath()`.)

#### Step 2.2: Run tests to verify they fail

Run: `pnpm exec vitest run src/main/xlsxHistoryStorage.test.ts`
Expected: 3 new tests FAIL — the current `readXlsxHistory` returns the corrupt records verbatim (cast via `as`), so the assertions `toHaveLength(1)` and `toEqual([])` will fail.

#### Step 2.3: Add `isMainXlsxImportRecord` type guard

Edit `src/main/xlsxHistoryStorage.ts`. After the existing `MainXlsxImportRecord` interface (around line 27), add:

```ts
/**
 * Type guard for a single persisted record. Defensive against
 * hand-edited or older-version-written files. Returns false (and
 * the caller warns) for any record whose shape drifts from the
 * v1.36.0 contract.
 *
 * v1.36.1 PATCH M2 — per-record validation at the storage
 * boundary. Previously readXlsxHistory only checked
 * Array.isArray; a bad record like { source: 'wizard' } crashed
 * the renderer on record.rows.map().
 */
function isMainXlsxImportRecord(value: unknown): value is MainXlsxImportRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v['rows'])) return false;
  const source = v['source'];
  if (source !== 'manual' && source !== 'wizard') return false;
  if (typeof v['importedAt'] !== 'number') return false;
  return true;
}
```

#### Step 2.4: Use the guard in `readXlsxHistory`

Edit `src/main/xlsxHistoryStorage.ts:44-65`. Replace the body:

```ts
export function readXlsxHistory(): MainXlsxImportRecord[] {
  const path = historyFilePath();
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try {
    const raw = readFileSync(path, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `xlsxHistoryStorage: corrupt or unreadable file at ${path}: ${
        e instanceof Error ? e.message : String(e)
      }; resetting to empty`,
    );
    return [];
  }
  if (!Array.isArray(parsed)) {
    // eslint-disable-next-line no-console
    console.warn(`xlsxHistoryStorage: expected array, got ${typeof parsed}; resetting`);
    return [];
  }
  const valid: MainXlsxImportRecord[] = [];
  for (let i = 0; i < parsed.length; i++) {
    if (isMainXlsxImportRecord(parsed[i])) {
      valid.push(parsed[i]);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `xlsxHistoryStorage: dropping record at index ${i} (shape mismatch: ${JSON.stringify(parsed[i])}); file may be hand-edited or older than v1.36.0`,
      );
    }
  }
  return valid.slice(0, MAX_HISTORY);
}
```

#### Step 2.5: Run tests to verify they pass

Run: `pnpm exec vitest run src/main/xlsxHistoryStorage.test.ts`
Expected: all 3 new tests PASS; pre-existing tests still PASS.

Run typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: clean.

#### Step 2.6: Commit

```bash
git add src/main/xlsxHistoryStorage.ts src/main/xlsxHistoryStorage.test.ts
git commit -m "fix(main): v1.36.1 PATCH T2 — per-record validation in readXlsxHistory

v1.36.0 T1 only checked Array.isArray on the persisted file;
each element was cast via \`as MainXlsxImportRecord\`. A
hand-edited or older-version-written file (e.g.
{ source: 'wizard' } without rows) crashes the renderer at
record.rows.map('') because rows is undefined.

M2 adds isMainXlsxImportRecord type guard: rows must be an
array, source in {'manual','wizard'}, importedAt a number.
Bad records are dropped with console.warn (matches the
corrupt-file recovery pattern already in this file).

+3 tests in xlsxHistoryStorage.test.ts:
- missing-rows record dropped, valid prefix returned
- bogus source all-bad file returns []
- string importedAt (not number) treated as bad
tsc clean."
```

---

## Task 3: Remove `offXlsxImportComplete` dead stub from preload (L1)

### Files

- Modify: `src/preload/index.ts:329-340` (delete the stub)
- Verify (no test changes needed): grep for any renderer call site — there should be none, since renderer uses the unsubscribe fn returned from `onXlsxImportComplete`.

### Why this is L1

The v1.36.0 MINOR T2 preload bridge exposes an `offXlsxImportComplete` function that receives a handler but does nothing with it (`void handler`). The actual unsubscribe happens via the cleanup fn returned from `onXlsxImportComplete` (`removeListener(XLSX_IMPORT_COMPLETE, listener)`). The stub exists "for symmetry with the public IPC API shape" but:

- It's never called anywhere in renderer/main.
- API surface that lies about its behavior is a foot-gun.
- YAGNI — delete the stub; if a future caller really needs an explicit-off, that's the moment to add the real unsubscribe.

### Steps

#### Step 3.1: Verify zero call sites

Run: `grep -rn "offXlsxImportComplete" src/`
Expected: 0 renderer/main call sites, 1 hit on the stub definition. (If a real call site exists, STOP — escalate to the human before deletion.)

#### Step 3.2: Delete the stub

Edit `src/preload/index.ts`. Find lines 329-340 (the `offXlsxImportComplete` stub) and delete them entirely. Also remove the trailing comma after the `xlsxHistoryLoad` block so the resulting object literal closes cleanly:

```ts
  // v1.36.0 MINOR T2 — xlsxImportHistory load bridge.
  // Renderer bootstrap calls this on App mount to hydrate the
  // session-scope xlsxImportHistory from disk. The save side is
  // main-internal (T3 wires it into xlsxEcucBatchImportHandler) and
  // is NOT exposed via this bridge.
  xlsxHistoryLoad: (): Promise<XlsHistoryLoadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.XLSX_HISTORY_LOAD),
};  // <-- trailing comma removed, brace closes the api object
```

#### Step 3.3: Run typecheck + relevant tests

Run:

- `pnpm exec tsc --noEmit -p tsconfig.json` — clean
- `pnpm exec tsc --noEmit -p tsconfig.web.json` — clean
- `pnpm exec vitest run src/renderer/store/__tests__/xlsxImportListener.test.ts` — still PASS
- `pnpm exec vitest run src/preload` (if any preload tests exist) — if no test directory under `src/preload`, skip

Expected: no test or type errors. The cleanup fn returned from `onXlsxImportComplete` already handles unsubscription; this stub did nothing.

#### Step 3.4: Commit

```bash
git add src/preload/index.ts
git commit -m "refactor(preload): v1.36.1 PATCH T3 — remove dead offXlsxImportComplete stub

L1 review finding: the offXlsxImportComplete bridge exposed a
no-op function that received a handler arg but did nothing
(\`void handler\`). The actual unsubscribe happens via the
cleanup fn returned from onXlsxImportComplete
(removeListener(XLSX_IMPORT_COMPLETE, listener)). The stub was
'for symmetry' but is misleading API surface.

YAGNI — delete. If a future caller needs an explicit-off, that
is the moment to add the real unsubscribe.

Verified grep: 0 renderer/main call sites before deletion.
tsc clean."
```

---

## Task 4: release notes + CHANGELOG + vault lessons dispatch

### Files

- Modify: `docs/release-notes/v1.36.1/README.md` (NEW file, ship-style notes)
- Modify: `CHANGELOG.md` (add v1.36.1 PATCH row + entry)
- Modify: `.git/sdd/progress-v1.36.1.md` (NEW file, progress ledger)
- Vault: `01-Projects/claude-AutosarCfg/development/lessons/` (NEW lesson file, parent controller dispatch)

### Why this task

Ship-artifact baseline per `claude-AutosarCfg/MEMORY.md`: release-notes README + CHANGELOG row + progress ledger are the 3 ship-baseline locations. v1.36.0 baseline pattern applies — same template. Vault lessons dispatch is parent controller's job (NOT this task).

### Steps

#### Step 4.1: Write v1.36.1 README release notes

Create `docs/release-notes/v1.36.1/README.md`. Use the v1.36.0 README as a template (read it first — the pattern is already proven). Cover:

- **What shipped:** M1 + M2 + L1 (3 fixes, single line each).
- **Reverse-closes:** the v1.36.0 post-ship review findings (cite the exact review file if reachable; otherwise reference `.git/sdd/progress-v1.36.0.md` Round 3 review block).
- **Test budget:** 3046 + 7 SKIP / 0 fail (+5 net from v1.36.0's 3041 baseline).
- **Lessons (NEW):** 2 one-liners:
  1. `ipc-payload-timestamp-single-source-of-truth` — derive once in main, thread into all downstream consumers (push payload + persistence call + UI display), never re-stamp at the receiver.
  2. `persisted-json-file-must-validate-per-record-shape` — `Array.isArray` on the top level is not enough; the storage boundary must check each element's shape via type guard to survive hand-edits and version drift.
- **Known follow-ups (deferred):** no new follow-ups generated by this PATCH.

#### Step 4.2: Update CHANGELOG

Edit `CHANGELOG.md`. Read the v1.36.0 row to mirror the format exactly. Add a v1.36.1 PATCH row above it (newest first), with a short bullet for each of M1/M2/L1. Cite the commit SHAs from tasks 1.8 / 2.6 / 3.4 once they're committed.

#### Step 4.3: Write progress ledger

Create `.git/sdd/progress-v1.36.1.md`. Use the v1.36.0 `.git/sdd/progress-v1.36.0.md` as a template. Cover T1-T4 + ship task, each with commit SHA + test result + reviewer verdict (or write "verifier's note: skipped — see test counts in release notes" if a formal reviewer pass wasn't run on this small PATCH).

#### Step 4.4: Run pnpm verify 7-stage GREEN

Run: `pnpm verify`
Expected: all 7 stages green, exit 0. If any stage fails, STOP — don't ship.

Record the output in the progress ledger ("pnpm verify GREEN 2026-07-08").

#### Step 4.5: Commit release artifacts

```bash
git add docs/release-notes/v1.36.1/README.md CHANGELOG.md .git/sdd/progress-v1.36.1.md
git commit -m "docs(release): v1.36.1 PATCH T4 — release notes + CHANGELOG + progress ledger"
```

Do NOT ship yet. Ship is T5.

---

## Task 5: ship v1.36.1 PATCH

### Files

- Modify: local git state (tag, push)
- Verify: GH release

### Why a separate ship task

The `follow-tags-unreliable-separate-push-tag` lesson (`docs/lessons/follow-tags-unreliable-separate-push-tag.md`) requires two separate pushes (no `--follow-tags`). The `gh-api-ship-pattern-recap` lesson requires `gh api` for tag/ref ops if direct `git push` fails on github.com:443. Tier 3 fallback (`scripts/tier3_push.py`) for the rebase+ship commit if needed.

### Steps

#### Step 5.1: Pre-ship sanity check

Run:

- `git status` — clean tree
- `git log --oneline origin/main..HEAD` — exactly 4 commits (T1 + T2 + T3 + T4)
- `pnpm verify` — still GREEN
- 3046 + 7 SKIP / 0 fail

If any check fails, STOP — fix before pushing.

#### Step 5.2: Push commits to origin/main

```bash
git push origin main
```

If `github.com:443` is blocked (per lessons `gh-api-ship-pattern-recap` and `block-timeout-recovery`), fall back to:

```bash
# wait 90s then retry
sleep 90 && git push origin main
```

If still blocked, escalate to Tier 3 (use `scripts/tier3_push.py` per the README's "Orphan Recovery" section).

#### Step 5.3: Create the v1.36.1 tag locally

```bash
git tag -a v1.36.1 -m "v1.36.1 PATCH — T-fix review closure (M1 + M2 + L1)"
```

Verify the tag is on the latest commit (the T4 docs commit):

```bash
git log --oneline -1 v1.36.1
git log --oneline -1 HEAD
# Both should be the same SHA
```

#### Step 5.4: Push the tag separately (no --follow-tags)

```bash
git push origin v1.36.1
```

If blocked, use `gh api`:

```bash
gh api repos/jasontaotao/claude-autosar-cfg/git/refs/tags/v1.36.1 \
   -X POST \
   --field sha="$(git rev-parse HEAD)" \
   --field ref="refs/tags/v1.36.1"
```

#### Step 5.5: Create the GH release

```bash
gh release create v1.36.1 \
  --title "v1.36.1 PATCH" \
  --notes-file docs/release-notes/v1.36.1/README.md
```

If `gh release create` complains about asset uploads / notes rendering, fall back to:

```bash
gh release create v1.36.1 --generate-notes
```

#### Step 5.6: Verify the release is published

Run:

```bash
gh release view v1.36.1 --json tagName,publishedAt,url
```

Expected: `tagName: v1.36.1`, `publishedAt: <recent timestamp>`, `url: https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.36.1`.

Write the final state to `.git/sdd/progress-v1.36.1.md` (append a "Ship" section with the GH release URL + commit SHA + push command output).

#### Step 5.7: Final commit (record ship state)

```bash
git add .git/sdd/progress-v1.36.1.md
git commit -m "docs(ship): v1.36.1 PATCH T5 — record GH release URL + ship state"

git push origin main
```

---

## Self-Review

### 1. Spec coverage

Review findings → task mapping:

- **M1** (single source-of-truth for `importedAt`) → Task 1 (T1). ✓
- **M2** (per-record validation in `readXlsxHistory`) → Task 2 (T2). ✓
- **L1** (delete `offXlsxImportComplete` stub) → Task 3 (T3). ✓
- **L2 + L3** (record-only, no action) → Ack in the progress ledger T4 task as "Findings acknowledged, not actioned per L-tier policy". ✓

### 2. Placeholder scan

- All test code shown verbatim. No "appropriate test" / "similar to above" placeholders.
- All commands have expected output spelled out.
- No "implement later" / TBD strings.

### 3. Type consistency

- `XlsxImportCompletePayload` defined once at T1 step 1.4; reused in the preload bridge type at T1 step 1.6 — same shape (`{rows, source, importedAt}`).
- `isMainXlsxImportRecord` defined once at T2 step 2.3; used by `readXlsxHistory` at T2 step 2.4 — same shape check.
- `MAX_HISTORY = 5` enforced at both write (existing line 83) and read (T2 step 2.4 final `.slice(0, MAX_HISTORY)`).

### 4. Reverse-closes

This PATCH closes the post-ship review findings of v1.36.0 MINOR. No previously-deferred promises from older versions are addressed here (those live in v1.37.0 candidate pool).
