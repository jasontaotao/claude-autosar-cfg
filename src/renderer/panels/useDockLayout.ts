// src/renderer/panels/useDockLayout.ts
// P3 Dock 工作台 — 布局持久化（spec §5.4）
// localStorage key autosarcfg.layout.v1（key 永不递增，schema 演进由
// payload 内 version 字段承载）。写入防抖 500ms + beforeunload flush。
// 坏数据 / version 不匹配 / 未知面板 id → 静默回退默认布局（console.warn 一次）。
import { PANEL_REGISTRY } from './registry.js';

const LAYOUT_KEY = 'autosarcfg.layout.v1';
const SCHEMA_VERSION = 2;

export type SerializedLayout = Record<string, unknown>;

/** Parses a stored layout string. Returns null for any failure. */
export function parseStoredLayout(raw: string): SerializedLayout | null {
  try {
    const parsed = JSON.parse(raw) as { version?: number; layout?: unknown };
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!parsed.layout || typeof parsed.layout !== 'object') return null;
    if (!validatePanelIds(parsed.layout)) return null;
    return parsed.layout as SerializedLayout;
  } catch {
    return null;
  }
}

/** Recursively walks the parsed layout tree checking for panel ids
 *  that are not in the registry. Returns false if any unknown id found. */
function validatePanelIds(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return true;
  if (Array.isArray(node)) {
    return node.every((item) => validatePanelIds(item));
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj['id'] === 'string' && obj['component'] !== undefined) {
    if (!PANEL_REGISTRY.some((p) => p.id === obj['id'])) {
      return false;
    }
  }
  return Object.values(obj).every((value) => validatePanelIds(value));
}

/** Wraps dockview serialize output in the version envelope. */
export function serializeLayout(layout: SerializedLayout): {
  version: number;
  layout: SerializedLayout;
} {
  return { version: SCHEMA_VERSION, layout };
}

export function getLayoutStorageKey(): string {
  return LAYOUT_KEY;
}

export function saveLayout(layout: SerializedLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(serializeLayout(layout)));
  } catch {
    // QuotaExceededError etc — silent.
  }
}

export function loadLayout(): SerializedLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const parsed = parseStoredLayout(raw);
    if (!parsed) {
      console.warn('[dock-layout] invalid stored layout, falling back to default');
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
