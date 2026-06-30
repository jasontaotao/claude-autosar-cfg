# v1.17.1 Release Notes (2026-06-30) — PATCH

**T5 M1 follow-up closure**

See [CHANGELOG](../../CHANGELOG.md#v1171-2026-06-30--patch) for the headline.

## 关键决策

- **Helper extraction, not inline wiring** — `registerMainWindowCloseHandler` lives in `src/main/window.ts` (the same module that owns `setMainWindow`/`getMainWindow`) rather than inline at the call site. Rationale: T5 created `window.ts` precisely to enable testing without mocking `electron`. A helper exported from that module lets the test exercise the wiring with a duck-typed fake — no `vi.mock('../../window.js')` indirection, no `electron` BrowserWindow fake.
- **No local `mainWindow` null-out** — the accessor (`_mainWindow` in window.ts) is cleared on close, but the local `mainWindow: BrowserWindow | null` in `src/main/index.ts:24` is NOT. Code-reviewer confirmed harmless: no call site reads it post-close (all reads are inside `createMainWindow` or attached to the window's own webContents, which become inert on destruction), and macOS re-activation reassigns it via `mainWindow = new BrowserWindow(...)`. Fixing it would require a callback into `createMainWindow`'s closure or a side-channel setter — not worth the indirection for a 1-PATCH hygiene fix.
- **2 tests, not 3** — covered (a) cleared-on-close, (b) idempotent-when-no-window. The "wiring is correct in `src/main/index.ts`" assertion is left to integration / code review; a third test would require mocking `electron`'s `BrowserWindow` and `app`, which violates the T5 design intent.

## 流程教训（PKM）

1. **Helper extraction over inline for testable seams** — when a 1-line fix needs a unit test, prefer extracting it into the module that owns the relevant state (window.ts owns the accessor). The extraction keeps the call site readable (still 1 line in `index.ts`) while making the test surface clean (no mocks). Pattern: extract at the seam, not at the call site.
2. **afterEach reset for module-scoped singletons** — `window.ts` holds state in a module-scoped `_mainWindow` variable. Tests that mutate this state MUST reset in `afterEach` (`setMainWindow(null)`), otherwise test order becomes load-bearing. The comment in the test file documents this explicitly so future contributors don't strip the reset.
3. **Format ↔ lint loop** — `prettier --write` and `eslint --fix` disagree on import-group spacing (prettier collapses, eslint wants a blank line between groups). One pass each is not enough; the stable state requires looping both until the file no longer changes. Verified this PATCH (2-iteration loop).

## Ship Method

- Direct on `main` (no feature branch — change is single-file wiring + new test, surgical scope per v1.16.1 PATCH pattern)
- 1 production commit (helper + wiring) + 1 release artifacts commit (CHANGELOG + version bump + this file)
- `pnpm verify` 8-stage green before commit
- Code-reviewer agent dispatched on 3 changed files → APPROVED 0C/0H/0M/0L
- `git tag v1.17.1` → `git push origin main v1.17.1` → `gh release create v1.17.1 --target main --notes-file docs/release-notes/v1.17.1/README.md --title "v1.17.1 — T5 M1 follow-up"`

## 测试基线

- v1.17.0: 2525 + 2 SKIP / 0 fail
- v1.17.1: 2527 + 2 SKIP / 0 fail (+2 net: the 2 new tests in window-close-handler.test.ts)
- pnpm verify 8-stage 全绿 (format / lint / type-check / test / coverage / build / import-regression)