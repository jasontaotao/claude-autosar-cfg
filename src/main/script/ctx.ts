// Sprint 14 #1 — script ctx.
//
// Whitelisted API surface exposed to user scripts. Binds an
// `ArxmlDocument` (read-only view) and three sinks (log / violation /
// mutation) that the vm-runner collects during execution.
//
// Implementation note: the canonical element type is `ArxmlElement`
// (module | container | reference). Only `module` and `container`
// have user-facing params + children, so the script view only wraps
// those two. References are surfaced as read-only `params[name].value`
// via the module/container's `params` record.

import type { ArxmlContainer, ArxmlDocument, ArxmlElement, ArxmlModule } from '../../core/arxml/types.js';
import type { ParamValue, ParamSnapshot, ScriptLog, ScriptMutation, ScriptViolation } from './types.js';

export interface ScriptCtxOptions {
  readonly project: ArxmlDocument;
  readonly onLog: (l: ScriptLog) => void;
  readonly onViolation: (v: ScriptViolation) => void;
  readonly onMutation: (m: ScriptMutation) => void;
}

export interface ScriptContainer {
  readonly path: string;
  readonly def: string;
  readonly shortName: string;
  readonly kind: 'module' | 'container';
  /** Snapshot of params at view-build time. Mutations do not mutate the underlying doc. */
  readonly params: readonly ScriptParam[];
  readonly children: readonly ScriptContainer[];
  getParam(name: string): ScriptParam | null;
  addChild(shortName: string): ScriptContainer;
  removeChild(shortName: string): boolean;
}

export interface ScriptParam {
  readonly name: string;
  readonly type: ParamSnapshot['type'];
  readonly definition: string;
  asInteger(): number;
  asString(): string;
  asBoolean(): boolean;
  asEnum(): string;
  asReference(): { value: string; dest?: string };
  setValue(v: ParamValue): void;
}

export interface ScriptProject {
  readonly projectId: string;
  findContainers(filter: {
    def?: string;
    predicate?: (c: ScriptContainer) => boolean;
  }): ScriptContainer[];
  getContainer(path: string): ScriptContainer | null;
  buildPathIndex(): ReadonlyMap<string, ScriptContainer>;
}

export interface ScriptCtx {
  readonly project: ScriptProject;
  readonly validator: {
    addViolation(
      input: Omit<ScriptViolation, 'severity' | 'message'> & {
        severity: 'error' | 'warning';
        message: string;
      },
    ): void;
  };
  readonly log: {
    info(m: string): void;
    warn(m: string): void;
    error(m: string): void;
    debug(m: string): void;
  };
  readonly utils: {
    path: { join(...s: string[]): string; split(p: string): string[]; basename(p: string): string };
    now(): string;
    assert(cond: unknown, msg: string): asserts cond;
  };
  // Internal hook for import resolver: ctx._import('./<shortName>') → module exports.
  _import(from: string): Readonly<Record<string, unknown>>;
}

interface RawContainer {
  readonly path: string;
  readonly def: string;
  readonly shortName: string;
  readonly kind: 'module' | 'container';
  readonly params: ReadonlyArray<readonly [string, RawParam]>;
  readonly children: readonly RawContainer[];
}

interface RawParam {
  readonly name: string;
  readonly type: ParamSnapshot['type'];
  readonly value: ParamValue;
  readonly definition: string;
}

function toScriptType(t: string): ParamSnapshot['type'] {
  if (t === 'integer' || t === 'float' || t === 'boolean' || t === 'string' || t === 'enum' || t === 'reference') {
    return t;
  }
  // Multiline is a UI-only ParamEditMode; persist as 'string' for setValue
  return 'string';
}

function flattenElement(el: ArxmlElement, parentPath: string): RawContainer[] {
  // Reference elements have no params / children — skip
  if (el.kind === 'reference') return [];
  // Both module and container share the same shape: { path, shortName, params, children }
  const path = `${parentPath}/${el.shortName}`;
  // Use el.path if set (parser usually pre-computes); fall back to computed
  const elemPath = el.path || path;
  const rawParams: RawParam[] = [];
  for (const [pname, pval] of Object.entries(el.params)) {
    rawParams.push({
      name: pname,
      type: toScriptType(pval.type),
      value: extractValue(pval.value),
      // The ARXML value object's definitionRef is exposed as the script
      // param's "definition" (e.g. '/EAS/Com/ComConfig/ComIPdu/ComPduId').
      definition: pval.definitionRef ?? '',
    });
  }
  // Recurse into all child elements FIRST so we have the full sub-tree
  // to attach as `children` and the flat list of descendants to add
  // to the top-level result.
  const childContainers: RawContainer[] = [];
  for (const child of el.children) {
    childContainers.push(...flattenElement(child, elemPath));
  }
  const me: RawContainer = {
    path: elemPath,
    def: elemPath, // parser path is the def-path inside the manifest
    shortName: el.shortName,
    kind: el.kind,
    params: rawParams.map((p) => [p.name, p] as const),
    children: childContainers,
  };
  // Return [self, ...all descendants] so pathIndex and findContainers
  // see every container, not just top-level elements.
  return [me, ...childContainers];
}

function extractValue(v: unknown): ParamValue {
  // The ArxmlElement params Record holds ParamValue objects with
  // { type, value, definitionRef? }. User scripts see the raw inner
  // `value` (number / string / boolean / reference wrapper).
  // Primitives short-circuit — they're already the inner value.
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
    return v;
  }
  if (typeof v !== 'object' || v === null) {
    // Defensive: should not happen for a well-typed element
    return String(v);
  }
  const inner = (v as { value?: unknown }).value;
  if (typeof inner === 'number' || typeof inner === 'string' || typeof inner === 'boolean') {
    return inner;
  }
  if (inner && typeof inner === 'object' && 'value' in (inner as Record<string, unknown>)) {
    return inner as { value: string; dest?: string };
  }
  return String(inner);
}

function flattenDocument(doc: ArxmlDocument): RawContainer[] {
  const out: RawContainer[] = [];
  for (const pkg of doc.packages) {
    // Top-level AR-PACKAGE has no path inside the document tree; treat
    // the package itself as transparent and walk its elements.
    const pkgPath = `/${pkg.shortName}`;
    for (const el of pkg.elements) {
      out.push(...flattenElement(el, pkgPath));
    }
    // Recurse into nested packages (R21+ BSWMD shape)
    if (pkg.packages) {
      for (const sub of pkg.packages) {
        const subPath = `${pkgPath}/${sub.shortName}`;
        for (const el of sub.elements) {
          out.push(...flattenElement(el, subPath));
        }
      }
    }
  }
  return out;
}

function asModuleOrContainer(el: ArxmlElement): ArxmlModule | ArxmlContainer | null {
  if (el.kind === 'module' || el.kind === 'container') return el;
  return null;
}

export function buildScriptCtx(opts: ScriptCtxOptions): ScriptCtx {
  const { project, onLog, onViolation, onMutation } = opts;

  const log = (level: ScriptLog['level']) => (msg: string): void => {
    if (typeof msg !== 'string') throw new Error('ctx.log.*: message must be a string');
    onLog({ level, message: msg, ts: Date.now() });
  };

  // Pre-compute the path index once. Mutations to the underlying doc
  // are NOT picked up — the view is built at ctx-construction time,
  // consistent with spec § 7.2 "WorkingCopy holds (original, mutations[])
  // and view functions apply the mutations on read".
  const pathIndex = new Map<string, RawContainer>();
  for (const c of flattenDocument(project)) {
    pathIndex.set(c.path, c);
  }

  function wrapContainer(c: RawContainer): ScriptContainer {
    return {
      path: c.path,
      def: c.def,
      shortName: c.shortName,
      kind: c.kind,
      params: c.params.map(([, p]) => wrapParam(p, c.path)),
      children: c.children.map(wrapContainer),
      getParam: (name: string) => {
        for (const [n, p] of c.params) {
          if (n === name) return wrapParam(p, c.path);
        }
        return null;
      },
      addChild: (shortName: string) => {
        onMutation({ kind: 'add-child', containerPath: c.path, newShortName: shortName });
        return wrapContainer({
          path: `${c.path}/${shortName}`,
          def: '',
          shortName,
          kind: 'container',
          params: [],
          children: [],
        });
      },
      removeChild: (shortName: string) => {
        onMutation({ kind: 'remove-child', containerPath: c.path, shortName });
        return true;
      },
    };
  }

  function wrapParam(p: RawParam, containerPath: string): ScriptParam {
    const setValue = (v: ParamValue): void => {
      switch (p.type) {
        case 'integer':
          if (typeof v !== 'number' || !Number.isInteger(v)) {
            throw new Error(`setValue: expected integer for ${p.name}`);
          }
          break;
        case 'float':
          if (typeof v !== 'number') throw new Error(`setValue: expected number for ${p.name}`);
          break;
        case 'boolean':
          if (typeof v !== 'boolean') throw new Error(`setValue: expected boolean for ${p.name}`);
          break;
        case 'string':
        case 'multiline':
          if (typeof v !== 'string') throw new Error(`setValue: expected string for ${p.name}`);
          break;
        case 'enum':
          if (typeof v !== 'string') throw new Error(`setValue: expected string for enum ${p.name}`);
          break;
        case 'reference':
          if (
            typeof v !== 'object' ||
            v === null ||
            typeof (v as { value: unknown }).value !== 'string'
          ) {
            throw new Error(
              `setValue: expected { value: string, dest?: string } for reference ${p.name}`,
            );
          }
          break;
      }
      onMutation({ kind: 'set-param', containerPath, paramName: p.name, newValue: v });
    };
    return {
      name: p.name,
      type: p.type,
      definition: p.definition,
      asInteger: () => {
        if (typeof p.value !== 'number') throw new Error('not an integer');
        return p.value;
      },
      asString: () => (typeof p.value === 'string' ? p.value : String(p.value)),
      asBoolean: () => {
        if (typeof p.value !== 'boolean') throw new Error('not a boolean');
        return p.value;
      },
      asEnum: () => (typeof p.value === 'string' ? p.value : String(p.value)),
      asReference: () => {
        if (typeof p.value === 'object' && p.value !== null && 'value' in (p.value as Record<string, unknown>)) {
          return p.value as { value: string; dest?: string };
        }
        throw new Error('not a reference');
      },
      setValue,
    };
  }

  const ctx: ScriptCtx = {
    project: {
      projectId: project.path,
      findContainers: ({ def, predicate }) => {
        const out: ScriptContainer[] = [];
        for (const node of pathIndex.values()) {
          if (def !== undefined) {
            // Match if the container's def ends with the given path
            // (e.g. '/Com/ComConfig/ComIPdu' matches
            //  '/EcucDefs/Com/ComConfig/ComIPdu') OR contains the
            // substring. Spec § 3.2 says `def` is the AUTOSAR path
            // e.g. '/Com/ComConfig/ComIPdu'.
            const matches = node.def === def || node.def.endsWith(def) || node.path.endsWith(def);
            if (!matches) continue;
          }
          const w = wrapContainer(node);
          if (predicate && !predicate(w)) continue;
          out.push(w);
        }
        return out;
      },
      getContainer: (path: string) => {
        const n = pathIndex.get(path);
        return n ? wrapContainer(n) : null;
      },
      buildPathIndex: () => {
        const out = new Map<string, ScriptContainer>();
        for (const [k, v] of pathIndex) out.set(k, wrapContainer(v));
        return out;
      },
    },
    validator: {
      addViolation: (input) => {
        if (!input.kind.startsWith('script:')) {
          throw new Error(
            `ctx.validator.addViolation: kind must start with "script:", got "${input.kind}"`,
          );
        }
        onViolation(input);
      },
    },
    log: { info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug') },
    utils: {
      path: {
        join: (...s) => s.join('/'),
        split: (p) => p.split('/'),
        basename: (p) => p.split('/').pop() ?? p,
      },
      now: () => new Date().toISOString(),
      assert: (cond, msg) => {
        if (!cond) throw new Error(msg);
      },
    },
    _import: (_from: string) => {
      // Populated by vm-runner before user code runs. Default impl
      // throws so a misuse surfaces a clear error rather than silent
      // empty object.
      throw new Error(`import: module '${_from}' not found`);
    },
  };
  return ctx;
}

// Helper to expose a module/container element lookup for callers
// (used by vm-runner when wiring `_import`).
export function findElementByPath(doc: ArxmlDocument, path: string): ArxmlElement | null {
  function walk(elements: readonly ArxmlElement[]): ArxmlElement | null {
    for (const el of elements) {
      if (el.kind === 'reference') continue;
      if (el.path === path) return el;
      const inner = walk(el.children);
      if (inner) return inner;
    }
    return null;
  }
  for (const pkg of doc.packages) {
    const found = walk(pkg.elements);
    if (found) return found;
    if (pkg.packages) {
      for (const sub of pkg.packages) {
        const inner = walk(sub.elements);
        if (inner) return inner;
      }
    }
  }
  return null;
}

// Suppress unused import warnings for ArxmlModule / ArxmlContainer when
// the file is tree-shaken by the build (used via flattenElement type narrowing).
export type { ArxmlModule, ArxmlContainer };
export { asModuleOrContainer };
