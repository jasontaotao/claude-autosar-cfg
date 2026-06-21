# Shipped Plans & Specs Archive

> **DO NOT READ in active dev sessions.** Every file here has already been
> shipped (committed, versioned, release-noted). Reading them wastes ~1–3 KB
> of context each and adds noise — the code on `main` **IS** the truth; these
> plans are frozen artifacts of how we got there.

## Structure

```
archive/
├── plans/   18 files — implementation plans, v0.12.0 → v1.6.0
└── specs/   14 files — design specs,       v0.12.0 → v1.6.0  (+ 1 HTML preview)
```

## What's here

| Stage / Plan                                            | Landed in            | Released as             |
| ------------------------------------------------------- | -------------------- | ----------------------- |
| Sprint 12 #2 — BSWMD renderer integration               | sprint-12 work       | v0.12.0                 |
| Sprint 12 #3 — new project dialog                       | sprint-12 work       | v0.13.0                 |
| Stage 1 — namespace + BSWMD strict                      | `fd25ad9`            | v0.13.1                 |
| Stage 2 — templates backend (12 tasks)                  | `67c32…`             | v0.14.0                 |
| Stage 3.1 — Left-panel tabs refactor                    | `142c968`            | v0.15.0                 |
| Stage 3.2 — Sprint 12 #3 Phase 1 cleanup                | `679ff25`            | v0.15.0                 |
| Stage 3.3 — TemplateCard UI                             | `0c20e9c`            | v0.15.0                 |
| Stage 3.4 — BSWMD chips                                 | `c382a5d`            | v0.16.0                 |
| Stage 3.5 — Combined Tree View                          | `b16a2a9`            | v0.16.0                 |
| Stage 4 — i18n polish (M6/M7/M8)                        | `b924ccb`            | v0.15.0                 |
| Stage 5.D — validators + cap + choices depth            | `ecb7385`            | v0.15.0                 |
| Sprint 13+ master roadmap                               | n/a (orchestrator)   | drives all of the above |
| **Wave 4 / Sprint 15** — ECUC add/delete                | `4963ba7 → ac53cc0`  | v1.0.1                  |
| **Sprint 14 #1** — BSWMD → ECUC skeleton (default       | `14a0f7f`            | v1.1.0                  |
| **Sprint 14 #3** — ECUC ARXML Import (EB tresos wizard) | `0cc4d8e…`           | v1.2.0                  |
| **Sprint 14 #4** — Script Engine (CodeMirror 6 +        | `267b79d → 48b3aa5`  | v1.3.0                  |
| **Sprint 16** — 5 fixes (DEFINITION-REF, _EcucValues,   | `f7b69a3`            | v1.1.1                  |
| **Sprint 16 #2** — v1.1.2 polish (5 trivial + 2 UX +    | `5ef376c`            | v1.1.2                  |
| **Trust Sprint 17a/17b/17c** — Dialog i18n + path-walker | `4c5f96d → 7b29b7a`  | v1.4.0                  |
| **Foundation sprint** — isPathInside + preserveOrder +  | `ad635ed`            | v1.5.1                  |
| **Vendor-CDD followup** — EnumEditor + moduleRoots +    | `d296a6f`            | v1.5.1                  |
| **Sprint 14 Final (W + A+C + G + U)** — Onboarding +    | `2907177`            | v1.6.0                  |

## Active plans/specs (in `../plans/` and `../specs/`)

| File                                          | Status     | Next action                          |
| --------------------------------------------- | ---------- | ------------------------------------ |
| `../plans/2026-06-20-sprint-17-remove-bswmd.md` | in-flight | P3 (UI context-menu) + P4 (E2E) pending |
| `../plans/release-notes-v1.6.0.md`            | just-shipped | historical reference for v1.6.0 |
| `../specs/2026-06-21-v1-6-0-{W,U,AC,G}-*-design.md` | v1.6.0 fresh | keep visible as current context |
| `../specs/2026-06-21-v1-6-0-{W,U,AC,G}-*-report.md`  | v1.6.0 retro | keep visible as current context |

## How to recover context if you really need it

- **Code is the truth**: `git show <commit>` for any landed commit
- **Why a decision was made**: read the design spec in `archive/specs/`
- **Coverage / test counts at each stage**: `CHANGELOG.md` + `release-notes/`
- **Cross-stage dependency graph**: `archive/plans/2026-06-17-sprint-13-master-roadmap.md`

## Adding to this archive

When a plan/spec is fully shipped (tagged + pushed + release-notes written):

```bash
# from claude-AutosarCfg/
git mv docs/superpowers/plans/YYYY-MM-DD-<name>.md docs/superpowers/archive/plans/
git mv docs/superpowers/specs/YYYY-MM-DD-<name>-design.md docs/superpowers/archive/specs/
# then update the table above + commit
```

**Do NOT delete** — git history + this archive are the audit trail.
