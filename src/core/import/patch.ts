// Sprint 14 ECUC ARXML Import — patch compile + apply.
//
// Two pure functions that close the import loop:
//
//   1. compileResolutionToPatches(session, targetDocs?)
//      Walks session.selections and produces one `ImportPatch` per
//      *source file* that has at least one operation to perform.
//      Unselected modules + skip resolutions are filtered out so the
//      caller can use `patches.length === 0` as the "no changes"
//      signal. ops are emitted in spec §6.2 order:
//
//        'overwrite' on no-collision      → 'add-module'
//        'overwrite' on collision         → 'merge-into-module'
//        'keep-both' on collision         → 'rename-incoming'
//                                            (op paired with add-module)
//
//   2. applyPatchesToDocument(doc, ops)
//      Returns a new ArxmlDocument (NEVER mutates the input) with the
//      ops applied. On any invariant violation (duplicate module
//      shortName, multiplicity >1, etc.) the function throws — the
//      caller is expected to catch + rollback via snapshot.
//
// Design invariants (spec §5.1 / §7.3):
//   - core/import/* has no react/electron/fs deps
//   - output documents are immutable (spread + map)
//   - all-or-nothing commit; if apply throws, no state has changed
//     in the calling layer (snapshot rollback)

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
} from '../arxml/types.js';

import type { ImportPatch, ImportPatchOp, ImportResolution, ImportSession } from './types.js';

// ---------------------------------------------------------------------------
// Public surface — compile
// ---------------------------------------------------------------------------

/**
 * Compile a session into per-source-file patch lists. The optional
 * `targetDocs` is only consulted to disambiguate add-module vs
 * merge-into-module: when the caller's `targetDocs` already has a
 * module with the incoming shortName, the emitted op is
 * `merge-into-module`; otherwise it's `add-module`.
 *
 * Output ordering:
 *   - groups patches by `sourceFile` (in originalPaths order)
 *   - ops within a patch appear in selection order
 *   - 'skip' / unselected rows are dropped entirely
 */
export function compileResolutionToPatches(
  session: ImportSession,
  targetDocs: readonly ArxmlDocument[] = [],
): readonly ImportPatch[] {
  // Build a quick lookup of incoming module by merged path so we can
  // resolve each selection to its actual ArxmlModule.
  const incomingModulesByPath = new Map<string, ArxmlModule>();
  for (let docIdx = 0; docIdx < session.incomingDocs.length; docIdx++) {
    const doc = session.incomingDocs[docIdx]!;
    forEachModuleInPackages(doc.packages, (m, pkg) => {
      // The merged path is constructed in merge.ts; here we key
      // by /[import:N]/<pkg.path>/<shortName>
      const key = `/[import:${docIdx}]${pkg.path}/${m.shortName}`;
      incomingModulesByPath.set(key, m);
    });
  }

  // Map of existing target modules by shortName for collision lookup.
  // 递归遍历（含嵌套 AR-PACKAGE）——R22 目标文档把模块放在
  // `AUTOSAR_R2x/EcucDefs/<module>`，只扫顶层 elements 会漏判 collision，
  // 导致误发 add-module 而非 merge-into-module。
  const targetShortNames = new Set<string>();
  for (const d of targetDocs) {
    forEachModuleInPackages(d.packages, (m) => {
      targetShortNames.add(m.shortName);
    });
  }

  // Group ops by source file.
  const opsByFile = new Map<string, ImportPatchOp[]>();

  for (const sel of session.selections) {
    if (!sel.selected) continue;
    const resolution = lookupResolution(session, sel.mergedModulePath);
    if (resolution === 'skip') continue;
    if (resolution === 'keep-existing') continue; // produces no op

    const incoming = incomingModulesByPath.get(sel.mergedModulePath);
    if (!incoming) continue; // no incoming module to apply; safety guard

    const sourcePath = session.originalPaths[sel.sourceDocIndex] ?? sel.mergedModulePath;
    const list = opsByFile.get(sourcePath) ?? [];

    if (resolution === 'keep-both') {
      // rename first, then add (so patch.apply sees the renamed module).
      list.push({
        kind: 'rename-incoming',
        originalShortName: incoming.shortName,
        newShortName: `${incoming.shortName}_imported`,
      });
      list.push({
        kind: 'add-module',
        module: { ...incoming, shortName: `${incoming.shortName}_imported` },
      });
      opsByFile.set(sourcePath, list);
      continue;
    }

    if (resolution === 'overwrite') {
      if (targetShortNames.has(incoming.shortName)) {
        // merge-into-module: keep target module's identity, add the
        // incoming-only containers.
        const additions = collectAllContainers(incoming);
        list.push({
          kind: 'merge-into-module',
          moduleShortName: incoming.shortName,
          additions,
        });
      } else {
        list.push({ kind: 'add-module', module: incoming });
      }
      opsByFile.set(sourcePath, list);
      continue;
    }
  }

  // Convert to ImportPatch[] preserving originalPaths order.
  const out: ImportPatch[] = [];
  for (const path of session.originalPaths) {
    const ops = opsByFile.get(path);
    if (ops && ops.length > 0) {
      out.push({ sourceFile: path, ops });
      opsByFile.delete(path);
    }
  }
  // Any leftover files (e.g. paths not in originalPaths) are appended.
  for (const [path, ops] of opsByFile) {
    if (ops.length > 0) out.push({ sourceFile: path, ops });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public surface — apply
// ---------------------------------------------------------------------------

/**
 * Apply ops to a document and return a new ArxmlDocument. The
 * original is never mutated (Object.is(doc, next) === false for any
 * non-empty op list).
 *
 * Throws on invariant violation. The store wraps the call in a
 * try/catch + snapshot rollback; see useArxmlStore.commitImport.
 */
export function applyPatchesToDocument(
  doc: ArxmlDocument,
  ops: readonly ImportPatchOp[],
): ArxmlDocument {
  if (ops.length === 0) return doc;
  let packages: readonly ArxmlPackage[] = doc.packages;
  for (const op of ops) {
    packages = applyOp(packages, op);
  }
  return { ...doc, packages };
}

// ---------------------------------------------------------------------------
// Apply helpers
// ---------------------------------------------------------------------------

/**
 * 递归遍历 package 树（含嵌套 AR-PACKAGE），对 `shortName` 匹配的 module element
 * 应用 `map` 变换。immutable：匹配不到时返回原 packages 引用。
 * 真实 R22 项目把模块放在 `AUTOSAR_R2x/EcucDefs/<module>`（两层嵌套），
 * merge/overwrite 必须递归命中，不能只改顶层 package 的 elements。
 */
function mapModuleInPackages(
  packages: readonly ArxmlPackage[],
  shortName: string,
  map: (module: ArxmlModule) => ArxmlModule,
): readonly ArxmlPackage[] {
  let changed = false;
  const next = packages.map((pkg) => {
    let elementsChanged = false;
    const mappedElements = pkg.elements.map((el) => {
      if (el.kind === 'module' && el.shortName === shortName) {
        elementsChanged = true;
        return map(el);
      }
      return el;
    });
    let subChanged = false;
    let mappedSubPackages: readonly ArxmlPackage[] | undefined;
    if (pkg.packages !== undefined) {
      mappedSubPackages = mapModuleInPackages(pkg.packages, shortName, map);
      subChanged = mappedSubPackages !== pkg.packages;
    }
    if (!elementsChanged && !subChanged) return pkg;
    changed = true;
    return {
      ...pkg,
      ...(elementsChanged ? { elements: mappedElements } : {}),
      ...(subChanged && mappedSubPackages !== undefined ? { packages: mappedSubPackages } : {}),
    };
  });
  return changed ? next : packages;
}

function applyOp(packages: readonly ArxmlPackage[], op: ImportPatchOp): readonly ArxmlPackage[] {
  switch (op.kind) {
    case 'add-module': {
      // Add a module to the first package. If a module with the same
      // shortName already exists anywhere in the doc, throw — callers
      // must use 'merge-into-module' or 'overwrite-module' instead.
      const dup = findModuleByShortName(packages, op.module.shortName);
      if (dup) {
        throw new Error(
          `applyPatchesToDocument: module ${op.module.shortName} already exists; use merge/overwrite`,
        );
      }
      // Multiplicity check at module level: only 1 instance per package
      // (matches BSWMD 'lowerMultiplicity=1 upperMultiplicity=1' default).
      return packages.map((pkg, idx) => {
        if (idx !== 0) return pkg;
        const dupInPkg = pkg.elements.some(
          (e) => e.kind === 'module' && e.shortName === op.module.shortName,
        );
        if (dupInPkg) {
          throw new Error(
            `applyPatchesToDocument: module ${op.module.shortName} duplicate in package ${pkg.shortName}`,
          );
        }
        return { ...pkg, elements: [...pkg.elements, op.module] };
      });
    }

    case 'merge-into-module': {
      // Append the incoming-only containers to the existing module.
      // 递归命中嵌套 AR-PACKAGE（真实项目模块在 `AUTOSAR_R2x/EcucDefs/<module>`）。
      return mapModuleInPackages(packages, op.moduleShortName, (el) => {
        const existingShortNames = new Set(
          el.children.filter((c) => c.kind === 'container').map((c) => c.shortName),
        );
        const additions = op.additions.filter((c) => !existingShortNames.has(c.shortName));
        return { ...el, children: [...el.children, ...additions] };
      });
    }

    case 'overwrite-module': {
      // Replace the module entirely. 递归命中嵌套 AR-PACKAGE。
      return mapModuleInPackages(packages, op.moduleShortName, () => op.replacement);
    }

    case 'rename-incoming': {
      // rename-incoming alone has no effect on a document; it pairs
      // with add-module which carries the renamed shortName. We
      // accept it as a no-op so the op stream is uniform.
      return packages;
    }
  }
}

// ---------------------------------------------------------------------------
// Walk helpers
// ---------------------------------------------------------------------------

function collectModules(el: ArxmlElement, visit: (m: ArxmlModule) => void): void {
  if (el.kind === 'module') {
    visit(el);
    return;
  }
  if (el.kind === 'container') {
    for (const c of el.children) collectModules(c, visit);
  }
}

/**
 * 递归遍历 package 树（含嵌套 AR-PACKAGE）的 elements，对每个 module 调用
 * `visit(module, pkg)`——`pkg` 是 module 直接所属的 AR-PACKAGE（用于构造
 * merged path）。compileResolutionToPatches 用它收集 incoming / target 的
 * module，避免 R22 嵌套结构（`AUTOSAR_R2x/EcucDefs/<module>`）只扫顶层
 * elements 导致漏判或静默不生效。
 */
function forEachModuleInPackages(
  packages: readonly ArxmlPackage[],
  visit: (module: ArxmlModule, pkg: ArxmlPackage) => void,
): void {
  for (const pkg of packages) {
    for (const el of pkg.elements) {
      collectModules(el, (m) => visit(m, pkg));
    }
    if (pkg.packages !== undefined) {
      forEachModuleInPackages(pkg.packages, visit);
    }
  }
}

function findModuleByShortName(
  packages: readonly ArxmlPackage[],
  shortName: string,
): ArxmlModule | null {
  for (const pkg of packages) {
    for (const el of pkg.elements) {
      let found: ArxmlModule | null = null;
      collectModules(el, (m) => {
        if (m.shortName === shortName) found = m;
        return undefined;
      });
      if (found) return found;
    }
    // 递归嵌套 AR-PACKAGE：R22 模块在 `AUTOSAR_R2x/EcucDefs/<module>`。
    if (pkg.packages !== undefined) {
      const found = findModuleByShortName(pkg.packages, shortName);
      if (found) return found;
    }
  }
  return null;
}

function collectAllContainers(mod: ArxmlModule): readonly ArxmlContainer[] {
  const out: ArxmlContainer[] = [];
  for (const el of mod.children) {
    collectContainers(el, out);
  }
  return out;
}

function collectContainers(el: ArxmlElement, out: ArxmlContainer[]): void {
  if (el.kind === 'container') {
    out.push(el);
    for (const c of el.children) collectContainers(c, out);
  }
}

function lookupResolution(session: ImportSession, mergedModulePath: string): ImportResolution {
  for (const r of session.resolutions) {
    if (r.mergedModulePath === mergedModulePath) return r.resolution;
  }
  return 'overwrite'; // spec §6.1 step 7 default for un-opened diffs
}
