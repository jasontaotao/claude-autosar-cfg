# Shipped Plans & Specs Archive

> **DO NOT READ in active dev sessions.** Every file here has already been
> shipped (committed, versioned, release-noted). Reading them wastes ~1–3 KB
> of context each and adds noise — the code on `main` **IS** the truth; these
> plans are frozen artifacts of how we got there.

## Structure

```
archive/
├── plans/   11 files — implementation plans, v0.12.0 → v1.0.0
└── specs/    7 files — design specs,     v0.12.0 → v1.0.0
```

## What's here

| Stage / Plan                                 | Landed in           | Released as             |
| -------------------------------------------- | ------------------- | ----------------------- |
| Sprint 12 #2 — BSWMD renderer integration    | sprint-12 work      | v0.12.0                 |
| Sprint 12 #3 — new project dialog            | sprint-12 work      | v0.13.0                 |
| Stage 1 — namespace + BSWMD strict           | `fd25ad9`           | v0.13.1                 |
| Stage 2 — templates backend (12 tasks)       | `67c32…`            | v0.14.0                 |
| Stage 3.1 — Left-panel tabs refactor         | `142c968`           | v0.15.0                 |
| Stage 3.2 — Sprint 12 #3 Phase 1 cleanup     | `679ff25`           | v0.15.0                 |
| Stage 3.3 — TemplateCard UI                  | `0c20e9c`           | v0.15.0                 |
| Stage 3.4 — BSWMD chips                      | `c382a5d`           | v0.16.0                 |
| Stage 3.5 — Combined Tree View               | `b16a2a9`           | v0.16.0                 |
| Stage 4 — i18n polish (M6/M7/M8)             | `b924ccb`           | v0.15.0                 |
| Stage 5.D — validators + cap + choices depth | `ecb7385`           | v0.15.0                 |
| Sprint 13+ master roadmap                    | n/a (orchestrator)  | drives all of the above |
| **Wave 4 / Sprint 15** — ECUC add/delete     | `4963ba7 → ac53cc0` | v1.0.1 (tag pending)    |

## Active plans/specs (in `../plans/` and `../specs/`)

| File                                          | Status          | Next action                        |
| --------------------------------------------- | --------------- | ---------------------------------- |
| `../plans/2026-06-18-ecuc-arxml-import.md`    | draft           | user 拍板稍后实施                  |
| `../plans/2026-06-18-ecuc-from-bswmd.md`      | design approved | S14 Task 1 起点 `e8822f2` 已落     |
| `../plans/2026-06-18-script-engine.md`        | design locked   | 最大未执行 feature (v1.1.0)        |
| `../specs/2026-06-18-ecuc-mutation-design.md` | approved (S15)  | ship 完毕但 v1.0.1 release 待 push |
| (3 S14 design specs above)                    | approved        | 等待对应 plan 启动                 |

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
