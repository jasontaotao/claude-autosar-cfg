// Sprint 14 ECUC ARXML Import — buildModuleDiff.
//
// Pure function: given an existing target module (or null) and an
// incoming module, produce a `ModuleDiff` describing every container
// path that differs and every param/referenec that changed. Spec §6.1
// Step 5 + §8.2 (8 test cases).
//
// Design choices:
//   - Path is a virtual key (`/<Module>/<ContainerA>/<SubContainer>`)
//     assembled from shortNames joined with '/'. The merged view and
//     patch.apply use the same key shape so they round-trip without
//     a translation step.
//   - Same-named containers in incoming that land at the same path
//     multiple times is multiplicity=2+; the caller passes a
//     `multiplicityLimits` map (path → max allowed instances) and we
//     surface a `multiplicity-exceeded` ImportError when exceeded.
//   - The function NEVER mutates its inputs. The result containers
//     array is sorted by path so equality checks in tests are stable.

import type {
  ArxmlContainer,
  ArxmlElement,
  ArxmlModule,
  ParamValue,
  Result,
} from '../arxml/types.js';

import type { ContainerDiff, ImportError, ModuleDiff, ParamOverride } from './types.js';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface BuildModuleDiffOptions {
  /**
   * Caller-supplied multiplicity caps keyed by container path
   * (`/<Module>/<Container>` → max allowed instances). When omitted
   * we conservatively cap at 1 instance per path; when present the
   * stricter limit wins.
   */
  readonly multiplicityLimits?: ReadonlyMap<string, number>;
}

/**
 * Compute a ModuleDiff for the given existing/incoming pair.
 *
 * Returns a `Result<ModuleDiff, ImportError>`:
 *   - `ok: true, value: ModuleDiff` on success
 *   - `ok: false, error: ImportError` on multiplicity violation
 */
export function buildModuleDiff(
  existing: ArxmlModule | null,
  incoming: ArxmlModule,
  options: BuildModuleDiffOptions = {},
): Result<ModuleDiff, ImportError> {
  const moduleShortName = incoming.shortName;
  const modulePath = `/${moduleShortName}`;

  // Flatten both modules into path → container maps. Each path can
  // hold 0..N instances; we count them so multiplicity is observable.
  const existingMap = existing
    ? flattenContainers(existing, modulePath)
    : new Map<string, ArxmlContainer[]>();
  const incomingMap = flattenContainers(incoming, modulePath);

  // 1. Multiplicity check on incoming. The caller controls the cap
  //    per-path; default is 1.
  for (const [path, list] of incomingMap) {
    const limit = options.multiplicityLimits?.get(path) ?? 1;
    if (list.length > limit) {
      return {
        ok: false,
        error: {
          kind: 'multiplicity-exceeded',
          sourceFile: incoming.tagName, // we don't know path here; tagName is the closest stable id we have at the module level
          containerPath: path,
          limit,
        },
      };
    }
  }

  // 2. Build the union of paths. Sort for stable test output.
  const allPaths = new Set<string>([...existingMap.keys(), ...incomingMap.keys()]);
  const sortedPaths = [...allPaths].sort();

  const containers: ContainerDiff[] = [];
  const paramOverrides: ParamOverride[] = [];

  for (const path of sortedPaths) {
    const existingList = existingMap.get(path) ?? [];
    const incomingList = incomingMap.get(path) ?? [];

    // Pick representative (first) instance for diffing. If multiplicity
    // is >1 the caller will see this in the per-row resolution flow.
    const existingInstance = existingList[0] ?? null;
    const incomingInstance = incomingList[0] ?? null;

    let resolution: ContainerDiff['resolution'];
    if (existingInstance && incomingInstance) {
      // Both sides — if the container content is byte-equal (same
      // params, same children) the safe default is 'keep-existing'
      // (no-op for the user; spec §8.2 case 2). When any param or
      // child differs we default to 'overwrite' so the user can
      // downgrade explicitly via the DiffTable.
      resolution = containersEqual(existingInstance, incomingInstance)
        ? 'keep-existing'
        : 'overwrite';
    } else if (incomingInstance) {
      resolution = 'overwrite';
    } else {
      // only existing — keep it (spec §8.2 case 4 default)
      resolution = 'keep-existing';
    }

    containers.push({
      path,
      existing: existingInstance,
      incoming: incomingInstance,
      resolution,
    });

    // Param diffs only make sense when both sides have the container.
    if (existingInstance && incomingInstance) {
      for (const override of diffParams(path, existingInstance, incomingInstance)) {
        paramOverrides.push(override);
      }
    }
  }

  // 3. References — diff the array contents.
  const references = diffReferences(existing?.references ?? [], incoming.references);

  return {
    ok: true,
    value: {
      moduleShortName,
      containers,
      references,
      paramOverrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk a module's container subtree and produce a `path → instances`
 * map. Paths are absolute (`/Can/Cfg/...`) so they can be diffed
 * between two modules without collision.
 */
function flattenContainers(module: ArxmlModule, modulePath: string): Map<string, ArxmlContainer[]> {
  const out = new Map<string, ArxmlContainer[]>();
  for (const el of module.children) {
    walk(el, modulePath, out);
  }
  return out;
}

function walk(el: ArxmlElement, parentPath: string, out: Map<string, ArxmlContainer[]>): void {
  if (el.kind !== 'container') return;
  const path = `${parentPath}/${el.shortName}`;
  const list = out.get(path);
  if (list) {
    list.push(el);
  } else {
    out.set(path, [el]);
  }
  for (const child of el.children) {
    walk(child, path, out);
  }
}

/**
 * Compute the symmetric difference of param keys between two
 * containers. For shared keys with different values, emit a 'value
 * changed' override. For keys only on one side, emit an override
 * where the missing side is `null`.
 */
function diffParams(
  path: string,
  existing: ArxmlContainer,
  incoming: ArxmlContainer,
): ParamOverride[] {
  const overrides: ParamOverride[] = [];
  const allKeys = new Set<string>([
    ...Object.keys(existing.params),
    ...Object.keys(incoming.params),
  ]);
  for (const k of [...allKeys].sort()) {
    const ev = existing.params[k];
    const iv = incoming.params[k];
    if (ev && iv) {
      if (!paramValueEqual(ev, iv)) {
        overrides.push({
          path,
          param: k,
          existingValue: ev.value as string | number | boolean,
          incomingValue: iv.value as string | number | boolean,
        });
      }
    } else if (ev && !iv) {
      overrides.push({
        path,
        param: k,
        existingValue: ev.value as string | number | boolean,
        incomingValue: null,
      });
    } else if (!ev && iv) {
      overrides.push({
        path,
        param: k,
        existingValue: null,
        incomingValue: iv.value as string | number | boolean,
      });
    }
  }
  return overrides;
}

function paramValueEqual(a: ParamValue, b: ParamValue): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'string':
    case 'integer':
    case 'float':
    case 'boolean':
    case 'enum':
      return a.value === (b as typeof a).value;
    case 'reference':
      return (
        a.value === (b as { value: unknown }).value && a.dest === (b as { dest?: string }).dest
      );
  }
}

function diffReferences(existing: readonly string[], incoming: readonly string[]): string[] {
  const set = new Set<string>([...existing, ...incoming]);
  return [...set].sort();
}

/**
 * Byte-equality for two containers at the same path. Used to decide
 * the default resolution when both sides have the container: equal →
 * 'keep-existing' (no work to do), different → 'overwrite'.
 */
function containersEqual(a: ArxmlContainer, b: ArxmlContainer): boolean {
  if (a.shortName !== b.shortName) return false;
  if (a.tagName !== b.tagName) return false;
  const aKeys = Object.keys(a.params).sort();
  const bKeys = Object.keys(b.params).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const k of aKeys) {
    if (!paramValueEqual(a.params[k]!, b.params[k]!)) return false;
  }
  if (a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    const ac = a.children[i]!;
    const bc = b.children[i]!;
    if (ac.kind !== bc.kind) return false;
    if (ac.kind === 'container' && bc.kind === 'container') {
      if (!containersEqual(ac, bc)) return false;
    } else if (ac.kind === 'reference' && bc.kind === 'reference') {
      if (ac.value !== bc.value) return false;
    } else {
      return false;
    }
  }
  return true;
}
