# v1.49.0 — Round-8 F-2 Closure (PATCH)

**Released:** 2026-07-12
**Tag:** [`v1.49.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.49.0)
**Cycle type:** PATCH (dev-mode HMR ergonomic fix; deferred from v1.48.1 ship)
**Ship basis:** 2 source commits (T1 + T2) + 1 docs ship (T3)

## Summary

Closes the **Round-8 F-2 finding** deferred from v1.48.1 PATCH: `src/preload/index.ts:225 onScriptProgress` listener registration was leaky under Vite Fast Refresh HMR in dev mode. Production runtime ships with `sandbox: true` + `contextIsolation: true` (F-10 negative-evidence verified at v1.18.0 `79d79f3`) so the leak was dev-only — but worth shipping for dev ergonomics.

| | v1.48.1 baseline | **v1.49.0** | Delta |
|---|---|---|---|
| `onScriptProgress` listener registration | direct `ipcRenderer.on` | idempotent Map-tracked | leak-resistant under HMR |
| Tests | 3131 + 7 SKIP | **3135 + 7 SKIP** | +4 regression cases |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |
| Public API | unchanged | **unchanged** | 0 (internally observable via `__testApi` test shim only) |
| Production runtime impact | n/a | **0** (sandbox + contextIsolation hardened) | dev-only fix |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `9c79475` | `fix(preload): v1.49.0 PATCH T1 -- idempotent onScriptProgress listener` |
| T2 | `77af9b0` | `test(preload): v1.49.0 PATCH T2 -- idempotent onScriptProgress regression test` |
| T3 | (this commit) | `docs(release): v1.49.0 PATCH -- Round-8 F-2 closure` |

## What's new

### T1 — Idempotent listener registration (58 LoC src)

`src/preload/index.ts:225` onScriptProgress now uses a closure-scoped Map-tracking pattern:

```ts
// Module-scope Map tracking the most-recently-registered handler per
// IPC push channel. Survives Fast Refresh HMR re-execution.
const recentHandlersByChannel = new Map<string, (...args: unknown[]) => unknown>();

// In the api object:
onScriptProgress: (cb) => {
  const handler = (_evt, e) => cb(e);
  // Idempotent registration: remove the prior handler before
  // adding the new one.
  const prior = recentHandlersByChannel.get(IPC_CHANNELS.SCRIPT_PROGRESS);
  if (prior !== undefined) {
    ipcRenderer.off(
      IPC_CHANNELS.SCRIPT_PROGRESS,
      prior as (event: unknown, ...args: unknown[]) => void,
    );
  }
  ipcRenderer.on(IPC_CHANNELS.SCRIPT_PROGRESS, handler);
  recentHandlersByChannel.set(
    IPC_CHANNELS.SCRIPT_PROGRESS,
    handler as (...args: unknown[]) => unknown,
  );
  return () => {
    // Idempotent unsubscribe: a subsequent call after a re-
    // registration has already replaced our handler reference.
    const current = recentHandlersByChannel.get(IPC_CHANNELS.SCRIPT_PROGRESS);
    if (current === (handler as (...args: unknown[]) => unknown)) {
      ipcRenderer.off(
        IPC_CHANNELS.SCRIPT_PROGRESS,
        handler as (event: unknown, ...args: unknown[]) => void,
      );
      recentHandlersByChannel.delete(IPC_CHANNELS.SCRIPT_PROGRESS);
    }
  };
}
```

**Why module-scope**: Fast Refresh HMR re-evaluates the preload module without tearing down module-scope closures. The Map state survives HMR re-execution; closures don't leak across re-registrations because the prior handler reference is always removed before the new one is added.

**Why loose Map type**: the Map spans heterogeneous handler shapes (different channel types have different `(evt, payload)` signatures). The Map's `(...args: unknown[]) => unknown` type is widened at the storage boundary and narrowed back at the `ipcRenderer.off` call sites via two casts per call. The casts are localized to the idempotent bridge, not scattered through the rest of the preload module.

### T2 — Regression test (144 LoC test file)

NEW `src/preload/__tests__/onScriptProgress-idempotent.test.ts`. 4 cases pinning the contract:

| Case | Pins |
|---|---|
| `first registration captures the handler reference` | onScriptProgress is reachable via the contextBridge shim; produces a usable callback path |
| `unsubscribe returned by onScriptProgress is callable without throwing` | The Map.delete path on first unsubscribe succeeds |
| `idempotent unsubscribe: calling unsubscribe twice is safe` | A re-registered channel's prior unsubscribe no-ops (the Map's current handler reference has been replaced) |
| `re-registration replaces the prior handler (closure-scoped Map contract)` | The end-to-end idempotency: first registration → second registration → prior unsubscribe becomes a no-op |

**Mock surface**: `vi.mock('electron', importOriginal)` captures `contextBridge.exposeInMainWorld` into a `globalThis.__testApi` shim so the test can invoke the exposed api without booting Electron (same GENUINE-SKIP pattern as Round-7 audit `src/main/ipc/__tests__/dcmConfigRegistration.test.ts:32`). `ipcRenderer.on` and `ipcRenderer.off` are mocked to a Map-tracking shim. `vi.resetModules()` between tests ensures each test re-imports the preload module fresh, exercising the closure-scoped Map semantics.

## Decisions

- **D1 PATCH-not-MINOR** — 2 source commits (1 src fix + 1 test file). Internal preload refactor; no renderer-facing API change.
- **D2 deferred from v1.48.1 ship** — v1.48.1 PATCH D4 deferred F-2 explicitly to "v1.49.x PATCH — idempotent-listener pattern + dedicated test scaffold". This cycle ships that exact scope.
- **D3 defer F-2 HMR fix to v1.49.x in v1.48.1 D4** — `production sandbox-safe (F-10 negative-evidence); the dev-mode-only leak is bounded to HMR module re-evaluation cycles; not user-facing. Idempotent-listener pattern + dedicated test scaffold deserve a separate PATCH cycle, not bundling with the metadata fix.`
- **D4 module-scope Map, not class-based registration** — class instance would also work but introduces a new abstraction (Singleton + initialisation) for a single Map. The Map literal at module-scope is the smallest behavioral change with the highest readability per the v1.46.0 D5 dual-home precedent (kept private until shared context emerges).
- **D5 loose Map type + narrow casts** — heterogeneous handler shapes across channels means `(cb: (e: A) => void)` vs `(cb: (e: B) => void)` can't share a typed Map without structural inference gymnastics. Wide `(...args: unknown[]) => unknown` + narrow at the call site is the standard TS escape.
- **D6 test scaffold via shim, not direct introspection** — capturing the api object via contextBridge mock shim is one more layer of indirection than introspecting `recentHandlersByChannel` directly. The shim approach exercises the entire surface (contextBridge + ipcRenderer mock + Map), whereas direct introspection would only exercise the Map. Shim approach is more representative of the actual production flow.

## Honest deviations

- **(a)** `contextBridge.exposeInMainWorld` is a no-op in the mock environment (the bridge doesn't have a real Electron implementation). The test re-imports the preload module under the mock to surface `exposeInMainWorld` side effects. This is the Round-7 GENUINE-SKIP pattern documented in release-checklist.md § "Tests-with-skip classification policy".
- **(b)** The test exercises observable contract behavior (calls `onScriptProgress`, exercises unsubscribe) rather than introspecting `recentHandlersByChannel` directly. Direct introspection would couple the test to internal state shape; the observable contract surface is the public-consumed surface.
- **(c)** Production runtime is `sandbox: true` + `contextIsolation: true` (Round-8 F-10 negative-evidence verified at v1.18.0 `79d79f3`). The leak being closed here is dev-mode-only; production user-facing surface is unchanged.

## Process lessons applied (across T1-T2)

- **Lesson #10** (devlog-follow-up-status-claims) — `pnpm verify` 8-stage state confirmed at every commit boundary.
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions file written inline via Write tool.
- **Lesson #13** (per-flow prereq analysis) — F-2 closure required `recentHandlersByChannel` Map + dual-cast at `ipcRenderer.off` call sites + idempotent unsubscribe. Three contract surfaces pinned.
- **Lesson #14** (chunk-replacement guard) — N/A (single-file edit + new test file).
- **Lesson #15** (`function-extract-must-clip-verbatim-not-reimplement`) — N/A (no file-split).
- **Round-N review protocol** (promoted to standalone in v1.48.1 PATCH) — preflight `git log --oneline -20` confirmed F-2 closure scope.

## Round-8 audit summary (closes the cycle)

| Finding | Severity | Status |
|---|---|---|
| F-1 package.json 3rd-cycle drift | **CRITICAL** | CLOSED at v1.48.1 PATCH T1 |
| F-2 onScriptProgress HMR leak | MEDIUM (dev-only) | **CLOSED at this v1.49.0 PATCH T1+T2** |
| F-3 GET_APP_VERSION `'0.11.0'` literal | LOW | CLOSED at v1.48.1 PATCH T2 |
| 14 INFO + negative-evidence findings | INFO | verified |

**Round-8 audit fully closed**. Repo at stable state.

## Test results

- vitest 350/350 files / **3135 + 7 SKIP / 0 fail** (+4 net from v1.48.1).
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean.
- prettier check clean (1 auto-fix at T2 commit-time for the new test file).
- eslint `--max-warnings 0` clean (0 errors, 0 warnings after `--fix`).
- **`pnpm verify` 8-stage GREEN** — python-self-test 8/8 PASS.

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`.
- **v1.48.1 ship notes** (predecessor, F-1 + F-3 closure): `docs/release-notes/v1.48.1/README.md`.
- **Round-8 review report**: `01-Projects/claude-AutosarCfg/development/capture-decisions/claude-autosarcfg-round-8-fresh-review-2026-07-12.md`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
