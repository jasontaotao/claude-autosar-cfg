import { createHash } from 'node:crypto';

import { serializeArxml } from '../arxml/serializer.js';
import type { ArxmlContainer, ArxmlElement, ArxmlModule } from '../arxml/types.js';

export type ImportDecision = 'import' | 'keep-local' | 'delete';

export type ImportCategory =
  | 'added'
  | 'updated'
  | 'locally-modified'
  | 'conflict'
  | 'converged'
  | 'removed-in-odx';

export interface ImportManifestEntry {
  readonly module: 'Dcm' | 'Dem';
  readonly containerPath: string;
  readonly odxId?: string;
  readonly contentHash: string;
}

export interface OdxImportRow {
  readonly path: string;
  readonly module: 'Dcm' | 'Dem';
  readonly shortName: string;
  readonly category: ImportCategory;
  readonly defaultDecision: ImportDecision;
  readonly conflictDetail?: { readonly localHash: string; readonly incomingHash: string };
}

export function hashContainerForProvenance(container: ArxmlContainer): string {
  const document = {
    path: 'provenance',
    version: '4.4' as const,
    packages: [{ shortName: 'P', path: '/P', elements: [container] }],
  };
  const serialized = serializeArxml(document, { xmlDeclaration: false, version: '4.4' });
  const content = serialized.ok ? serialized.value : JSON.stringify(container);
  return createHash('sha256').update(content).digest('hex');
}

function childPath(parentPath: string, shortName: string): string {
  return `${parentPath}/${shortName}`;
}

export function collectImportContainers(module: ArxmlModule): ReadonlyMap<string, ArxmlContainer> {
  const result = new Map<string, ArxmlContainer>();
  function walk(element: ArxmlContainer, path: string): void {
    result.set(path, element);
    for (const child of element.children) {
      if (child.kind === 'container') walk(child, childPath(path, child.shortName));
    }
  }
  for (const child of module.children) {
    if (child.kind === 'container') walk(child, childPath(`/${module.shortName}`, child.shortName));
  }
  return result;
}

export function classifyImportRows(args: {
  readonly module: 'Dcm' | 'Dem';
  readonly manifestEntries: ReadonlyMap<string, string | ImportManifestEntry>;
  readonly currentContainers: ReadonlyMap<string, string>;
  readonly incomingContainers: ReadonlyMap<string, string>;
}): OdxImportRow[] {
  const paths = new Set([
    ...args.manifestEntries.keys(),
    ...args.currentContainers.keys(),
    ...args.incomingContainers.keys(),
  ]);
  const rows: OdxImportRow[] = [];

  for (const path of [...paths].sort()) {
    const base = args.manifestEntries.get(path);
    const baseHash = typeof base === 'string' ? base : base?.contentHash;
    const current = args.currentContainers.get(path);
    const incoming = args.incomingContainers.get(path);
    const shortName = path.split('/').pop() ?? path;

    if (incoming !== undefined && baseHash === undefined) {
      rows.push({
        path,
        module: args.module,
        shortName,
        category: 'added',
        defaultDecision: 'import',
      });
    } else if (baseHash !== undefined && incoming === undefined) {
      rows.push({
        path,
        module: args.module,
        shortName,
        category: 'removed-in-odx',
        defaultDecision: 'keep-local',
      });
    } else if (baseHash !== undefined && current !== undefined && incoming !== undefined) {
      if (current === baseHash && incoming !== baseHash) {
        rows.push({
          path,
          module: args.module,
          shortName,
          category: 'updated',
          defaultDecision: 'import',
        });
      } else if (current !== baseHash && incoming === baseHash) {
        rows.push({
          path,
          module: args.module,
          shortName,
          category: 'locally-modified',
          defaultDecision: 'keep-local',
        });
      } else if (current !== baseHash && incoming !== baseHash && current !== incoming) {
        rows.push({
          path,
          module: args.module,
          shortName,
          category: 'conflict',
          defaultDecision: 'keep-local',
          conflictDetail: { localHash: current, incomingHash: incoming },
        });
      } else if (current !== baseHash && incoming !== baseHash && current === incoming) {
        rows.push({
          path,
          module: args.module,
          shortName,
          category: 'converged',
          defaultDecision: 'import',
        });
      }
    }
    // current-only paths are manual and intentionally produce no row.
  }
  return rows;
}

function mergeContainer(
  current: ArxmlContainer,
  incoming: ArxmlContainer | undefined,
  moduleShortName: string,
  path: string,
  decisions: ReadonlyMap<string, ImportDecision>,
  defaults: ReadonlyMap<string, ImportDecision>,
): ArxmlContainer | undefined {
  const decision = decisions.get(path) ?? defaults.get(path);
  if (decision === 'delete') return undefined;

  const incomingChildren = incoming?.children.filter(
    (child): child is ArxmlContainer => child.kind === 'container',
  );
  const currentChildren = current.children.filter(
    (child): child is ArxmlContainer => child.kind === 'container',
  );

  // keep-local preserves the current subtree. Explicit child decisions are
  // still honored so a broad parent choice can be narrowed below it.
  if (decision === 'keep-local') {
    const children: ArxmlElement[] = [];
    const incomingByName = new Map(
      (incomingChildren ?? []).map((child) => [child.shortName, child]),
    );
    for (const currentChild of currentChildren) {
      const childInstancePath = childPath(path, currentChild.shortName);
      const childDecision = decisions.get(childInstancePath) ?? defaults.get(childInstancePath);
      if (childDecision === 'delete') continue;
      const incomingChild = incomingByName.get(currentChild.shortName);
      if (childDecision === 'import' && incomingChild) {
        const mergedChild = mergeContainer(
          currentChild,
          incomingChild,
          moduleShortName,
          childInstancePath,
          decisions,
          defaults,
        );
        if (mergedChild) children.push(mergedChild);
        continue;
      }
      children.push(currentChild);
    }
    for (const incomingChild of incomingChildren ?? []) {
      if (currentChildren.some((child) => child.shortName === incomingChild.shortName)) continue;
      const childInstancePath = childPath(path, incomingChild.shortName);
      if ((decisions.get(childInstancePath) ?? defaults.get(childInstancePath)) === 'import')
        children.push(incomingChild);
    }
    return { ...current, children };
  }

  // Default/import behavior starts from the incoming subtree and preserves
  // current-only children unless they are explicitly deleted.
  const children: ArxmlElement[] = [];
  const currentByName = new Map(currentChildren.map((child) => [child.shortName, child]));
  for (const incomingChild of incomingChildren ?? []) {
    const childInstancePath = childPath(path, incomingChild.shortName);
    const childDecision = decisions.get(childInstancePath) ?? defaults.get(childInstancePath);
    if (childDecision === 'delete') continue;
    const currentChild = currentByName.get(incomingChild.shortName);
    if (childDecision === 'keep-local' && currentChild) {
      children.push(currentChild);
      continue;
    }
    const mergedChild = currentChild
      ? mergeContainer(
          currentChild,
          incomingChild,
          moduleShortName,
          childInstancePath,
          decisions,
          defaults,
        )
      : incomingChild;
    if (mergedChild) children.push(mergedChild);
  }
  for (const currentChild of currentChildren) {
    if ((incomingChildren ?? []).some((child) => child.shortName === currentChild.shortName))
      continue;
    const childInstancePath = childPath(path, currentChild.shortName);
    if ((decisions.get(childInstancePath) ?? defaults.get(childInstancePath)) !== 'delete')
      children.push(currentChild);
  }
  return { ...(incoming ?? current), children };
}

export function mergeModuleThreeWay(args: {
  readonly existing: ArxmlModule | null;
  readonly incoming: ArxmlModule;
  readonly baseContainers?: ReadonlyMap<string, string | ImportManifestEntry>;
  readonly currentContainers?: ReadonlyMap<string, string>;
  readonly incomingContainers?: ReadonlyMap<string, string>;
  readonly decisions: ReadonlyMap<string, ImportDecision>;
}): ArxmlModule {
  if (!args.existing) return args.incoming;

  const defaults = new Map<string, ImportDecision>();
  if (args.baseContainers && args.currentContainers && args.incomingContainers) {
    for (const row of classifyImportRows({
      module: args.incoming.shortName as 'Dcm' | 'Dem',
      manifestEntries: args.baseContainers,
      currentContainers: args.currentContainers,
      incomingContainers: args.incomingContainers,
    })) {
      defaults.set(row.path, row.defaultDecision);
    }
  }

  const children: ArxmlElement[] = [];
  const currentTop = args.existing.children.filter(
    (child): child is ArxmlContainer => child.kind === 'container',
  );
  const incomingTop = args.incoming.children.filter(
    (child): child is ArxmlContainer => child.kind === 'container',
  );

  for (const incomingChild of incomingTop) {
    const currentChild = currentTop.find((child) => child.shortName === incomingChild.shortName);
    if (currentChild) {
      const mergedChild = mergeContainer(
        currentChild,
        incomingChild,
        args.incoming.shortName,
        childPath(`/${args.incoming.shortName}`, currentChild.shortName),
        args.decisions,
        defaults,
      );
      if (mergedChild) children.push(mergedChild);
    } else {
      const path = childPath(`/${args.incoming.shortName}`, incomingChild.shortName);
      if (args.decisions.get(path) !== 'delete') children.push(incomingChild);
    }
  }

  for (const currentChild of currentTop) {
    if (incomingTop.some((child) => child.shortName === currentChild.shortName)) continue;
    const path = childPath(`/${args.incoming.shortName}`, currentChild.shortName);
    if (args.decisions.get(path) !== 'delete') children.push(currentChild);
  }

  return { ...args.incoming, children };
}
