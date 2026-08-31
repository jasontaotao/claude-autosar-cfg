# P3 Dock 工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the react-resizable-panels workspace with dockview, add panel registry, layout persistence, and a View menu for panel restore.

**Architecture:** dockview 8.2.0 (exact pin) replaces the Group/Panel/Separator between left-panel and param-editor. Five panels register in a central registry with wrapper components that inject store state. Layout serializes to localStorage key autosarcfg.layout.v1 with schema version 1. A View menu (separate trigger, same BrandMenu pattern) restores closed panels and resets layout.

**Tech Stack:** dockview@8.2.0, React 18, Zustand, Vitest, Playwright

**Spec:** docs/superpowers/specs/2026-08-30-ui-v2-workbench-design.md §5

## Global Constraints

- dockview version: **8.2.0** exact (no caret/tilde in package.json)
- localStorage key: `autosarcfg.layout.v1` (never rename; schema version inside payload)
- Payload schema: `{ version: 1, layout: <dockview.serialize() output> }`
- Debounce: 500ms layout-change write + beforeunload flush
- Restore failure: silent fallback to default layout + console.warn once
- Panel ids (immutable): `left-panel`, `param-editor`, `script-panel`, `dbc-viewer`, `odx-viewer`
- defaultGroup enums: `left` | `center` | `bottom` | `viewer` (viewer P3 not consumed)
- Business component props contracts unchanged (§6 migration constraint)
- i18n three-file sync: src/shared/i18n/app.ts + i18n.en/app.ts + i18n.zh-CN/app.ts
- Codemod CSS count check: node scripts/codemod/hex-to-tokens.mjs --check
- Feature branch: p3-dock-workbench (from main)

---

### Task 1: Install dockview + type setup

**Files:**
- Modify: package.json (add dockview dependency)
- Modify: pnpm-lock.yaml

**Interfaces:**
- Produces: dockview available for import in renderer code

- [ ] **Step 1: Install dockview with exact version**

Run: pnpm add dockview@8.2.0 --save-exact
Expected: package.json shows "dockview": "8.2.0"

- [ ] **Step 2: Verify CSS import path exists**

Run: Get-ChildItem node_modules/dockview/dist -Name | Select-String "css"
Expected: dockview.css or similar

- [ ] **Step 3: Verify type declarations**

Run: Get-ChildItem node_modules/dockview/dist -Name | Select-String "d.ts"
Expected: index.d.ts or similar

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(p3): install dockview@8.2.0 (exact pin)"
```

---

### Task 2: Panel registry

**Files:**
- Create: src/renderer/panels/registry.ts
- Test: src/renderer/panels/__tests__/registry.test.ts

**Interfaces:**
- Produces: `PanelDef` interface, `PANEL_REGISTRY` array, `PanelId` type, `DefaultGroup` type, `getPanelDef(id: string): PanelDef | undefined`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { PANEL_REGISTRY, getPanelDef } from "../registry";

describe("PanelRegistry", () => {
  it("registers exactly 5 panels with stable ids", () => {
    const ids = PANEL_REGISTRY.map((p) => p.id);
    expect(ids).toEqual(["left-panel", "param-editor", "script-panel", "dbc-viewer", "odx-viewer"]);
  });

  it("every panel has a component, titleKey, and defaultGroup", () => {
    for (const p of PANEL_REGISTRY) {
      expect(p.component).toBeDefined();
      expect(typeof p.titleKey).toBe("string");
      expect(["left", "center", "bottom", "viewer"]).toContain(p.defaultGroup);
    }
  });

  it("getPanelDef returns undefined for unknown ids", () => {
    expect(getPanelDef("nonexistent")).toBeUndefined();
    expect(getPanelDef("left-panel")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: pnpm vitest run src/renderer/panels/__tests__/registry.test.ts
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/panels/registry.ts
import type { ComponentType } from "react";

/** Stable panel id - never rename (layout persistence references id). */
export type PanelId = "left-panel" | "param-editor" | "script-panel" | "dbc-viewer" | "odx-viewer";

/** defaultGroup: viewer is defined for P4 but not consumed in P3. */
export type DefaultGroup = "left" | "center" | "bottom" | "viewer";

export interface PanelDef {
  readonly id: PanelId;
  readonly component: ComponentType;
  readonly titleKey: string;
  readonly defaultGroup: DefaultGroup;
}

/** Placeholder wrappers - replaced in Task 3 with real components. */
const LeftPanelWrapper: ComponentType = () => null;
const ParamEditorWrapper: ComponentType = () => null;
const ScriptPanelWrapper: ComponentType = () => null;
const DbcViewerWrapper: ComponentType = () => null;
const OdxViewerWrapper: ComponentType = () => null;

export const PANEL_REGISTRY: readonly PanelDef[] = [
  { id: "left-panel", component: LeftPanelWrapper, titleKey: "panels.leftPanel", defaultGroup: "left" },
  { id: "param-editor", component: ParamEditorWrapper, titleKey: "panels.paramEditor", defaultGroup: "center" },
  { id: "script-panel", component: ScriptPanelWrapper, titleKey: "panels.scriptPanel", defaultGroup: "bottom" },
  { id: "dbc-viewer", component: DbcViewerWrapper, titleKey: "panels.dbcViewer", defaultGroup: "viewer" },
  { id: "odx-viewer", component: OdxViewerWrapper, titleKey: "panels.odxViewer", defaultGroup: "viewer" },
] as const;

export function getPanelDef(id: string): PanelDef | undefined {
  return PANEL_REGISTRY.find((p) => p.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: pnpm vitest run src/renderer/panels/__tests__/registry.test.ts
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/
git commit -m "feat(p3): panel registry with 5 stable panel ids"
```

---

### Task 3: Panel wrapper components

**Files:**
- Create: src/renderer/panels/wrappers/LeftPanelWrapper.tsx
- Create: src/renderer/panels/wrappers/ParamEditorWrapper.tsx
- Create: src/renderer/panels/wrappers/ScriptPanelWrapper.tsx
- Create: src/renderer/panels/wrappers/DbcViewerWrapper.tsx
- Create: src/renderer/panels/wrappers/OdxViewerWrapper.tsx

**Interfaces:**
- Consumes: existing components LeftPanel, ParamEditor, ScriptPanel, DbcViewer, OdxViewer
- Produces: wrapper components with zero props (dockview panels read store directly)

- [ ] **Step 1: Create wrapper components**

Each wrapper imports the business component and supplies props from store/hooks. The wrappers will be fully wired when integrated in Task 5.

LeftPanelWrapper.tsx:
```tsx
import { LeftPanel } from "../../components/LeftPanel";
import { useAppMainHandlers } from "../../app/useAppMainHandlers";

export function LeftPanelWrapper(): JSX.Element {
  const { handleAddEcucFromBswmd, handleContextMenu } = useAppMainHandlers();
  return (
    <LeftPanel
      onAddEcucFromBswmd={handleAddEcucFromBswmd}
      onContextMenu={handleContextMenu}
    />
  );
}
```

(Repeat similar pattern for the other 4 wrappers, supplying their required props from store/hooks.)

- [ ] **Step 2: Verify imports resolve**

Run: pnpm tsc --noEmit
Expected: PASS (or only pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/panels/wrappers/
git commit -m "feat(p3): panel wrapper components"
```

---

### Task 4: Layout persistence

**Files:**
- Create: src/renderer/panels/useDockLayout.ts
- Create: src/renderer/panels/defaultLayout.ts
- Test: src/renderer/panels/__tests__/useDockLayout.test.ts
- Test: src/renderer/panels/__tests__/defaultLayout.test.ts

**Interfaces:**
- Produces: parseStoredLayout(raw: string): SerializedLayout | null, serializeLayout(layout): { version, layout }, getLayoutStorageKey(): string, saveLayout(layout): void, loadLayout(): SerializedLayout | null, clearLayout(): void
- Produces: DEFAULT_LAYOUT: { version: number, layout: object }

- [ ] **Step 1: Write failing test for useDockLayout**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseStoredLayout, serializeLayout } from "../useDockLayout";

describe("parseStoredLayout", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns layout for valid stored data", () => {
    const valid = JSON.stringify({ version: 1, layout: { grid: {}, activePanel: "x" } });
    expect(parseStoredLayout(valid)).toEqual({ grid: {}, activePanel: "x" });
  });

  it("returns null for invalid JSON", () => {
    expect(parseStoredLayout("not-json")).toBeNull();
  });

  it("returns null for version mismatch", () => {
    const wrong = JSON.stringify({ version: 99, layout: {} });
    expect(parseStoredLayout(wrong)).toBeNull();
  });

  it("returns null for missing layout field", () => {
    const noLayout = JSON.stringify({ version: 1 });
    expect(parseStoredLayout(noLayout)).toBeNull();
  });

  it("returns null when layout references unknown panel ids", () => {
    const unknownPanel = JSON.stringify({
      version: 1,
      layout: { grid: { root: { type: "leaf", data: { id: "ghost-panel", component: "ghost" } } } },
    });
    expect(parseStoredLayout(unknownPanel)).toBeNull();
  });
});

describe("serializeLayout", () => {
  it("wraps dockview serialize output with version 1", () => {
    const layout = { grid: {}, activePanel: "test" };
    const result = serializeLayout(layout);
    expect(result.version).toBe(1);
    expect(result.layout).toEqual(layout);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: pnpm vitest run src/renderer/panels/__tests__/useDockLayout.test.ts
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/panels/useDockLayout.ts
import { PANEL_REGISTRY } from "./registry";

const LAYOUT_KEY = "autosarcfg.layout.v1";
const SCHEMA_VERSION = 1;

type SerializedLayout = Record<string, unknown>;

/** Parses a stored layout string. Returns null for any failure. */
export function parseStoredLayout(raw: string): SerializedLayout | null {
  try {
    const parsed = JSON.parse(raw) as { version?: number; layout?: unknown };
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!parsed.layout || typeof parsed.layout !== "object") return null;
    if (!validatePanelIds(parsed.layout)) return null;
    return parsed.layout as SerializedLayout;
  } catch {
    return null;
  }
}

function validatePanelIds(layout: unknown): boolean {
  if (typeof layout !== "object" || layout === null) return true;
  const obj = layout as Record<string, unknown>;
  if ("data" in obj && typeof obj.data === "object" && obj.data !== null) {
    const data = obj.data as Record<string, unknown>;
    if ("id" in data && typeof data.id === "string") {
      if (!PANEL_REGISTRY.some((p) => p.id === data.id)) return false;
    }
  }
  for (const value of Object.values(obj)) {
    if (!validatePanelIds(value)) return false;
  }
  return true;
}

/** Wraps dockview serialize output in the version envelope. */
export function serializeLayout(layout: SerializedLayout): { version: number; layout: SerializedLayout } {
  return { version: SCHEMA_VERSION, layout };
}

export function getLayoutStorageKey(): string {
  return LAYOUT_KEY;
}

export function saveLayout(layout: SerializedLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(serializeLayout(layout)));
  } catch {
    // QuotaExceededError etc - silent.
  }
}

export function loadLayout(): SerializedLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const parsed = parseStoredLayout(raw);
    if (!parsed) {
      console.warn("[dock-layout] invalid stored layout, falling back to default");
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLayout(): void {
  try {
    localStorage.removeItem(LAYOUT_KEY);
  } catch {
    // Silent.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: pnpm vitest run src/renderer/panels/__tests__/useDockLayout.test.ts
Expected: PASS

- [ ] **Step 5: Write test for defaultLayout**

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_LAYOUT } from "../defaultLayout";

describe("DEFAULT_LAYOUT", () => {
  it("has version 1", () => {
    expect(DEFAULT_LAYOUT.version).toBe(1);
  });
  it("contains left-panel and param-editor only in layout", () => {
    const str = JSON.stringify(DEFAULT_LAYOUT.layout);
    expect(str).toContain("left-panel");
    expect(str).toContain("param-editor");
    expect(str).not.toContain("script-panel");
    expect(str).not.toContain("dbc-viewer");
    expect(str).not.toContain("odx-viewer");
  });
});
```

- [ ] **Step 6: Run test**

Run: pnpm vitest run src/renderer/panels/__tests__/defaultLayout.test.ts
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/panels/
git commit -m "feat(p3): layout persistence with schema version and bad-data fallback"
```

---

### Task 5: Wire DockviewReact into App.tsx

**Files:**
- Modify: src/renderer/App.tsx (replace Group/Panel/Separator with DockviewReact)
- Modify: src/renderer/styles CSS (dockview theme overrides)

**Interfaces:**
- Consumes: PANEL_REGISTRY, useDockLayout persistence functions, wrapper components
- Produces: App renders DockviewReact instead of Group/Panel; dockApiRef for ViewMenu wiring

- [ ] **Step 1: Import dockview CSS and components in App.tsx**

```tsx
import { DockviewReact } from "dockview";
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from "dockview";
import "dockview/dist/dockview.css";
```

- [ ] **Step 2: Create panel components mapping for dockview**

```tsx
const panelComponents: Record<string, React.ComponentType<IDockviewPanelProps>> = {};
for (const def of PANEL_REGISTRY) {
  panelComponents[def.id] = def.component as React.ComponentType<IDockviewPanelProps>;
}
```

- [ ] **Step 3: Replace the Group/Panel/Separator JSX with DockviewReact**

Replace the <Group> block with:

```tsx
<DockviewReact
  components={panelComponents}
  onReady={handleDockReady}
  className="dockview-theme-reambia"
  style={{ height: "100%", width: "100%" }}
/>
```

The handleDockReady callback:
1. Stores the DockviewApi in a ref (dockApiRef)
2. Loads stored layout from localStorage (or uses DEFAULT_LAYOUT)
3. Calls api.fromJSON(storedLayout) if valid stored layout exists
4. Otherwise builds default: addPanel("left-panel"), addPanel("param-editor", position right of left-panel)
5. Sets up onDidLayoutChange listener with 500ms debounce -> saveLayout(api.serialize())
6. Sets up beforeunload -> saveLayout(api.serialize()) immediately

- [ ] **Step 4: Handle script-panel / dbc-viewer / odx-viewer transitions**

The existing UI triggers (btn-scripts-toggle, DBC/ODX viewer opens) should now interact with the dockview api:
- script-panel toggle: if open, activate/close; if closed, addPanel into dock
- DBC viewer open: instead of rendering modal, addPanel("dbc-viewer") into param-editor group
- ODX viewer open: instead of rendering modal, addPanel("odx-viewer") into param-editor group

This means the old modal/strip rendering code for these 3 panels is removed from App JSX. Their PanelErrorBoundary wrappers are preserved inside the wrapper components.

- [ ] **Step 5: Skip workspace-resize e2e tests**

Modify tests/e2e/workspace-resize.spec.ts: add test.skip() with comment:
```ts
// P3: workspace splitter replaced by dockview. Superseded by dock-workbench.spec.ts.
// Full removal of react-resizable-panels in P4.
```

- [ ] **Step 6: Run full unit test suite**

Run: pnpm test
Expected: PASS

- [ ] **Step 7: Run e2e (excluding workspace-resize)**

Run: pnpm test:e2e --grep-invert "workspace-resize"
Expected: PASS (pre-existing failures accepted per P2 ledger R4)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/ tests/e2e/workspace-resize.spec.ts
git commit -m "feat(p3): replace workspace layout with dockview"
```

---

### Task 6: View menu (i18n + component)

**Files:**
- Create: src/renderer/components/AppHeader/ViewMenu.tsx
- Modify: src/renderer/components/AppHeader.tsx (add ViewMenu next to BrandMenu)
- Modify: src/shared/i18n/app.ts (add AppMessages keys)
- Modify: src/shared/i18n/i18n.en/app.ts (add English values)
- Modify: src/shared/i18n/i18n.zh-CN/app.ts (add Chinese values)
- Test: src/renderer/components/AppHeader/__tests__/ViewMenu.test.tsx

**Interfaces:**
- Produces: <ViewMenu onTogglePanel(id: PanelId): void, onResetLayout(): void />
- Consumes: PANEL_REGISTRY, PanelId from registry

i18n keys (all three files):
- app.menu.view
- app.menu.resetLayout
- panels.leftPanel
- panels.paramEditor
- panels.scriptPanel
- panels.dbcViewer
- panels.odxViewer

- [ ] **Step 1: Add i18n keys to all three files**

app.ts (AppMessages interface):
```ts
readonly "app.menu.view": string;
readonly "app.menu.resetLayout": string;
readonly "panels.leftPanel": string;
readonly "panels.paramEditor": string;
readonly "panels.scriptPanel": string;
readonly "panels.dbcViewer": string;
readonly "panels.odxViewer": string;
```

i18n.en/app.ts:
```ts
"app.menu.view": "View",
"app.menu.resetLayout": "Reset Layout",
"panels.leftPanel": "Left Panel",
"panels.paramEditor": "Param Editor",
"panels.scriptPanel": "Scripts",
"panels.dbcViewer": "DBC Viewer",
"panels.odxViewer": "ODX Viewer",
```

i18n.zh-CN/app.ts:
```ts
"app.menu.view": "视图",
"app.menu.resetLayout": "重置布局",
"panels.leftPanel": "左面板",
"panels.paramEditor": "参数编辑器",
"panels.scriptPanel": "脚本",
"panels.dbcViewer": "DBC 查看器",
"panels.odxViewer": "ODX 查看器",
```

- [ ] **Step 2: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewMenu } from "../ViewMenu";

describe("ViewMenu", () => {
  it("renders trigger button", () => {
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={vi.fn()} />);
    expect(screen.getByTestId("btn-view-menu")).toBeDefined();
  });

  it("opens dropdown and shows all 5 panels + reset", () => {
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={vi.fn()} />);
    fireEvent.click(screen.getByTestId("btn-view-menu"));
    expect(screen.getByTestId("menu-item-left-panel")).toBeDefined();
    expect(screen.getByTestId("menu-item-param-editor")).toBeDefined();
    expect(screen.getByTestId("menu-item-script-panel")).toBeDefined();
    expect(screen.getByTestId("menu-item-dbc-viewer")).toBeDefined();
    expect(screen.getByTestId("menu-item-odx-viewer")).toBeDefined();
    expect(screen.getByTestId("btn-reset-layout")).toBeDefined();
  });

  it("calls onTogglePanel with correct panel id", () => {
    const togglePanel = vi.fn();
    render(<ViewMenu onTogglePanel={togglePanel} onResetLayout={vi.fn()} />);
    fireEvent.click(screen.getByTestId("btn-view-menu"));
    fireEvent.click(screen.getByTestId("menu-item-left-panel"));
    expect(togglePanel).toHaveBeenCalledWith("left-panel");
  });

  it("calls onResetLayout on reset click", () => {
    const resetLayout = vi.fn();
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={resetLayout} />);
    fireEvent.click(screen.getByTestId("btn-view-menu"));
    fireEvent.click(screen.getByTestId("btn-reset-layout"));
    expect(resetLayout).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: pnpm vitest run src/renderer/components/AppHeader/__tests__/ViewMenu.test.tsx
Expected: FAIL

- [ ] **Step 4: Implement ViewMenu.tsx**

Follow BrandMenu.tsx pattern: trigger div with testid btn-view-menu, dropdown with app-dropdown class, controlled menuOpen state, click-outside + Escape close. Items iterated from PANEL_REGISTRY. Also add Reset Layout button at bottom with divider.

- [ ] **Step 5: Run test to verify it passes**

Run: pnpm vitest run src/renderer/components/AppHeader/__tests__/ViewMenu.test.tsx
Expected: PASS

- [ ] **Step 6: Wire ViewMenu into AppHeader.tsx**

Add alongside BrandMenu in AppHeader JSX:
```tsx
<ViewMenu onTogglePanel={onTogglePanel} onResetLayout={onResetLayout} />
```

AppHeader receives these as new optional props, forwarded from App.

- [ ] **Step 7: Commit**

```bash
git add src/shared/i18n/ src/renderer/components/AppHeader/
git commit -m "feat(p3): View menu for panel restore and layout reset"
```

---

### Task 7: Wire ViewMenu actions to dockview API

**Files:**
- Modify: src/renderer/App.tsx (connect ViewMenu callbacks to DockviewApi)
- Modify: src/renderer/components/AppHeader.tsx (forward onTogglePanel/onResetLayout props)

**Interfaces:**
- Consumes: ViewMenu props, DockviewApi methods, loadLayout, clearLayout, saveLayout, DEFAULT_LAYOUT
- Produces: handleTogglePanel and handleResetLayout callbacks

- [ ] **Step 1: Implement handleTogglePanel in App**

```tsx
const handleTogglePanel = useCallback((panelId: PanelId): void => {
  const api = dockApiRef.current;
  if (!api) return;
  const existing = api.getPanel(panelId);
  if (existing) {
    existing.api.setActive();
    return;
  }
  const def = getPanelDef(panelId);
  if (!def) return;
  if (def.defaultGroup === "viewer" || def.defaultGroup === "center") {
    const paramEditor = api.getPanel("param-editor");
    if (paramEditor) {
      api.addPanel({
        id: panelId,
        component: panelId,
        title: t(locale, def.titleKey),
        position: { referencePanel: "param-editor", direction: "within" },
      });
      return;
    }
  }
  api.addPanel({ id: panelId, component: panelId, title: t(locale, def.titleKey) });
}, [locale]);
```

- [ ] **Step 2: Implement handleResetLayout**

```tsx
const handleResetLayout = useCallback((): void => {
  clearLayout();
  const api = dockApiRef.current;
  if (!api) return;
  // Remove all panels and rebuild default
  api.clear();
  api.addPanel({ id: "left-panel", component: "left-panel", title: t(locale, "panels.leftPanel") });
  api.addPanel({
    id: "param-editor",
    component: "param-editor",
    title: t(locale, "panels.paramEditor"),
    position: { referencePanel: "left-panel", direction: "right" },
  });
}, [locale]);
```

- [ ] **Step 3: Wire into AppHeader and ViewMenu props**

```tsx
<ViewMenu onTogglePanel={handleTogglePanel} onResetLayout={handleResetLayout} />
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/
git commit -m "feat(p3): wire ViewMenu toggle/reset to dockview api"
```

---

### Task 8: E2E tests for dock workbench

**Files:**
- Create: tests/e2e/dock-workbench.spec.ts

**Interfaces:**
- Consumes: dockview DOM classes (.dv-*), ViewMenu testids
- Produces: e2e verification of default layout, toggle, close+restore, persist, reset

- [ ] **Step 1: Write e2e tests**

```ts
// tests/e2e/dock-workbench.spec.ts
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.getByTestId("app-header")).toBeVisible();
  await expect(page.locator(".dv-workspace").first()).toBeVisible();
}

test.describe("Dock workbench", () => {
  test("default layout renders left-panel and param-editor", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await expect(page.locator("[data-panel-id='left-panel']").first()).toBeVisible();
    await expect(page.locator("[data-panel-id='param-editor']").first()).toBeVisible();
  });

  test("script-panel opens in dock when toggled", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await page.click("[data-testid='btn-scripts-toggle']");
    await expect(page.locator("[data-panel-id='script-panel']").first()).toBeVisible();
  });

  test("closed panel can be restored via View menu", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await page.click("[data-testid='btn-scripts-toggle']");
    await expect(page.locator("[data-panel-id='script-panel']").first()).toBeVisible();
    // Close via tab close button
    const closeButton = page.locator("[data-panel-id='script-panel']").first()
      .locator(".dv-default-tab-close-button");
    await closeButton.click();
    await expect(page.locator("[data-panel-id='script-panel']")).not.toBeVisible();
    // Restore via View menu
    await page.click("[data-testid='btn-view-menu']");
    await page.click("[data-testid='menu-item-script-panel']");
    await expect(page.locator("[data-panel-id='script-panel']").first()).toBeVisible();
  });

  test("layout persists across reload", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await page.click("[data-testid='btn-scripts-toggle']");
    await expect(page.locator("[data-panel-id='script-panel']").first()).toBeVisible();
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator("[data-panel-id='script-panel']").first()).toBeVisible();
  });

  test("reset layout restores default", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await page.click("[data-testid='btn-scripts-toggle']");
    await page.click("[data-testid='btn-view-menu']");
    await page.click("[data-testid='btn-reset-layout']");
    await expect(page.locator("[data-panel-id='script-panel']")).not.toBeVisible();
    await expect(page.locator("[data-panel-id='left-panel']").first()).toBeVisible();
    await expect(page.locator("[data-panel-id='param-editor']").first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run e2e tests**

Run: pnpm test:e2e dock-workbench
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/dock-workbench.spec.ts
git commit -m "test(p3): dock workbench e2e (default, toggle, restore, persist, reset)"
```

---

### Task 9: Full verification + lint

**Files:** (no new files)

- [ ] **Step 1: Run pnpm test**

Run: pnpm test
Expected: PASS

- [ ] **Step 2: Run pnpm test:e2e (excluding workspace-resize)**

Run: pnpm test:e2e --grep-invert "workspace-resize"
Expected: PASS (pre-existing failures accepted)

- [ ] **Step 3: Run codemod check**

Run: node scripts/codemod/hex-to-tokens.mjs --check
Expected: PASS

- [ ] **Step 4: Run pnpm verify**

Run: pnpm verify
Expected: PASS

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "style(p3): lint and format fixes"
```

---

## Self-Review

- Spec §5.1 (dockview exact pin): Task 1
- Spec §5.2 (DockviewReact replaces workspace): Task 5
- Spec §5.3 (registry 5 panels): Tasks 2, 3
- Spec §5.4 (default layout + persistence + bad-data fallback): Tasks 4, 5
- Spec §5.5 (coexistence ParamEditor internals): noted in Task 5
- Spec §5.6 (View menu restore + reset): Tasks 6, 7
- Spec §5.7 (unit + e2e tests): Tasks 4, 8
- workspace-resize.spec.ts skipped with P4 comment: Task 5 Step 5
- Type consistency: PanelId in Tasks 2, 6, 7; persistence fns in Tasks 4, 5, 7; ViewMenu props in Tasks 6, 7
