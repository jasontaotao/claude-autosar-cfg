// End-to-end invariant on the user's actual `test1.autosarcfg.json`
// project. Loads the real ECUC arxml + BSWMD, runs the full
// `useArxmlStore.addContainer` action against a 0..* sub-container
// that the BSWMD actually declares, and asserts the new instance is
// inserted. Pre-fix this test would fail with
// `mutation.error.path-not-found` because the BSWMD lookup couldn't
// bridge the vendor-prefix AR-PACKAGE chain. Post-fix the full
// store→core path succeeds for both post-fold (renderer output) and
// pre-fold (source-doc) path shapes.

import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import { parseArxml } from '../../src/core/arxml/parser';
import type { BswModuleDef } from '../../src/core/project/bswmd';
import { parseBswmd } from '../../src/core/project/bswmd';
import { useArxmlStore } from '../../src/renderer/store/useArxmlStore';

const ECUC_PATH = 'C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/ecuc/JWQ3399_EcucValues.arxml';
const BSWMD_PATH = 'C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/bswmd/JWQ3399_bswmd.arxml';

function findZeroOrInfiniteContainer(mod: BswModuleDef): { parent: string; child: string } | null {
  const stack: { container: (typeof mod.containers)[number]; path: string[] }[] =
    mod.containers.map((c) => ({ container: c, path: [c.shortName] }));
  while (stack.length > 0) {
    const { container, path } = stack.shift()!;
    for (const sub of [...container.subContainers, ...container.choices]) {
      if (sub.lowerMultiplicity === 0 && sub.upperMultiplicity === 'infinite') {
        return { parent: container.shortName, child: sub.shortName };
      }
      stack.push({ container: sub, path: [...path, sub.shortName] });
    }
  }
  return null;
}

beforeEach(() => {
  useArxmlStore.getState().clear();
});

describe('user JWQ3399 addContainer end-to-end', () => {
  it('adds a 0..* sub-container via the post-fold path (renderer-fold shape)', () => {
    const ecucXml = readFileSync(ECUC_PATH, 'utf-8');
    const bswmdXml = readFileSync(BSWMD_PATH, 'utf-8');
    const ecuc = parseArxml(ecucXml);
    const bswmd = parseBswmd(bswmdXml);
    if (!ecuc.ok) throw new Error(`ECUC parse: ${JSON.stringify(ecuc.error)}`);
    if (!bswmd.ok) throw new Error(`BSWMD parse: ${JSON.stringify(bswmd.error)}`);

    const target = findZeroOrInfiniteContainer(bswmd.value.modules[0]!);
    expect(target).not.toBeNull();
    if (target === null) return;

    useArxmlStore.getState().addDocument(ecuc.value, ECUC_PATH);
    useArxmlStore.setState({ bswmdSchemas: [bswmd.value] });

    // The renderer fold collapses 2-layer AR-PACKAGE
    // (JWQ_CDD_PACK > JWQ_Packet) into 1-layer; the Tree emits the
    // post-fold 3-segment path /JWQ3399/<parent>. The store's
    // addContainer must accept this shape on the 2-layer source doc.
    const parentPath = `/JWQ3399/${target.parent}`;
    useArxmlStore.getState().addContainer(parentPath, target.child);

    const after = useArxmlStore.getState();
    expect(after.error).toBeNull();

    // Walk the doc tree (including nested AR-PACKAGES) to confirm the
    // new instance landed. The traversal intentionally widens the
    // element type to `unknown`-backed shape because the in-test
    // re-collection reads the runtime doc through a single helper
    // that doesn't need the full ArxmlElement discriminated union.
    type TraversalNode = {
      readonly kind?: string;
      readonly shortName?: string;
      readonly children?: readonly TraversalNode[];
      readonly elements?: readonly TraversalNode[];
      readonly packages?: readonly TraversalNode[];
    };
    const collect = (nodes: readonly TraversalNode[]): TraversalNode[] => {
      const out: TraversalNode[] = [];
      for (const n of nodes) {
        if (n.kind === 'container') {
          out.push(n);
          out.push(...collect(n.children ?? []));
        } else if (n.kind === 'module') {
          out.push(...collect(n.children ?? []));
        } else if (n.packages !== undefined) {
          out.push(...collect(n.packages));
          out.push(...collect(n.elements ?? []));
        } else if (n.elements !== undefined) {
          out.push(...collect(n.elements));
        }
      }
      return out;
    };
    const nodes = collect(after.documents[0]!.packages as readonly TraversalNode[]);
    const parent = nodes.find((n) => n.kind === 'container' && n.shortName === target.parent);
    expect(parent).toBeDefined();
    const newInstance = parent?.children?.find(
      (c) => c.kind === 'container' && c.shortName === target.child,
    );
    expect(newInstance).toBeDefined();
  });

  it('adds a 0..* sub-container via the pre-fold path (vendor-prefix source-doc shape)', () => {
    const ecucXml = readFileSync(ECUC_PATH, 'utf-8');
    const bswmdXml = readFileSync(BSWMD_PATH, 'utf-8');
    const ecuc = parseArxml(ecucXml);
    const bswmd = parseBswmd(bswmdXml);
    if (!ecuc.ok) throw new Error(`ECUC parse: ${JSON.stringify(ecuc.error)}`);
    if (!bswmd.ok) throw new Error(`BSWMD parse: ${JSON.stringify(bswmd.error)}`);

    const target = findZeroOrInfiniteContainer(bswmd.value.modules[0]!);
    expect(target).not.toBeNull();
    if (target === null) return;

    useArxmlStore.getState().addDocument(ecuc.value, ECUC_PATH);
    useArxmlStore.setState({ bswmdSchemas: [bswmd.value] });

    // Pre-fold: the source doc carries the full vendor chain
    // `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/<parent>`. The store must
    // accept this shape (covers legacy docs and the skeleton's
    // pre-c46f4a8 vendor branch).
    const parentPath = `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/${target.parent}`;
    useArxmlStore.getState().addContainer(parentPath, target.child);

    const after = useArxmlStore.getState();
    expect(after.error).toBeNull();
  });
});
