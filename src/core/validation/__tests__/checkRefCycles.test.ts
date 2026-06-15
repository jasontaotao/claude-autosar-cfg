// Unit tests for Sprint 9 #3 — `checkRefCycles` cyclic reference
// detection on the project-wide cross-ref graph.
//
// Builds a directed graph from `refSites` (edge: sourcePath → targetPath,
// both resolved via `resolveTargetPath` = normalizePath + tryStripTypeSegment)
// and surfaces every back-edge in DFS as a 'ref-cycle' error. Each
// distinct cycle is reported exactly once via canonical-key dedup
// (rotate the node sequence to start at the lex-smallest node).
//
// Skip rules (mirror checkCrossRefs / checkRefDests axis discipline):
//   - placeholder target (empty / trailing /) → 'required' owns it
//   - source or target not in pathIndex       → 'cross-ref' owns it
// Self-loops (A→A) are reported as cycles (locked by case #6).

import { describe, it, expect } from 'vitest';

import { checkRefCycles } from '../index.js';
import type { PathIndexEntry, RefSite } from '../types.js';

// PathIndexEntry helper — sets only the fields checkRefCycles reads.
function entry(kind: 'module' | 'container' | 'reference', path: string): PathIndexEntry {
  return { path, kind, shortName: path.split('/').pop() ?? path };
}

function site(overrides: Partial<RefSite> & { targetPath: string; sourcePath: string }): RefSite {
  // RefSite.targetDest is `string | undefined` via `?: string`; with
  // exactOptionalPropertyTypes we must omit the field rather than set
  // it to `undefined` when not provided. Default `tagName` only.
  return {
    tagName: 'TEST-REF',
    ...overrides,
  };
}

describe('checkRefCycles', () => {
  // 1. 空输入 → 0 errors
  it('returns no errors for empty refSites', () => {
    const index = new Map<string, PathIndexEntry>();
    expect(checkRefCycles([], index)).toEqual([]);
  });

  // 2. 线性链 A→B→C → 0 errors（无 back-edge）
  it('returns no errors for a linear chain A → B → C', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
      ['/P/C', entry('container', '/P/C')],
    ]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      site({ sourcePath: '/P/B', targetPath: '/P/C' }),
    ];
    expect(checkRefCycles(sites, index)).toEqual([]);
  });

  // 3. 简单 2-node cycle A→B→A → 1 error
  it('detects a simple 2-node cycle A → B → A', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
    ]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      site({ sourcePath: '/P/B', targetPath: '/P/A' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('ref-cycle');
    expect(errors[0]?.message).toMatch(/2 edges/);
  });

  // 4. 3-node cycle A→B→C→A → 1 error，message 含 "3 edges"
  it('detects a 3-node cycle A → B → C → A and reports "3 edges"', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
      ['/P/C', entry('container', '/P/C')],
    ]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      site({ sourcePath: '/P/B', targetPath: '/P/C' }),
      site({ sourcePath: '/P/C', targetPath: '/P/A' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('ref-cycle');
    expect(errors[0]?.message).toMatch(/3 edges/);
    // Full path chain in message, grep-able.
    expect(errors[0]?.message).toMatch(/\/P\/A.*\/P\/B.*\/P\/C.*\/P\/A/);
  });

  // 5. 4-node + side-branch：仅 cycle 1 error，分支不噪
  it('does not false-positive on a side-branch attached to a cycle', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
      ['/P/C', entry('container', '/P/C')],
      ['/P/Tail', entry('container', '/P/Tail')],
    ]);
    // Cycle: A→B→A. Side-branch: B→Tail (no return).
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      site({ sourcePath: '/P/B', targetPath: '/P/A' }),
      site({ sourcePath: '/P/B', targetPath: '/P/Tail' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/2 edges/);
  });

  // 6. 自环 A→A：报 1 error（锁"包含自环"决策）
  it('detects a self-loop A → A as a 1-edge cycle', () => {
    const index = new Map([['/P/A', entry('container', '/P/A')]]);
    const sites = [site({ sourcePath: '/P/A', targetPath: '/P/A' })];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('ref-cycle');
    expect(errors[0]?.message).toMatch(/1 edges?/);
  });

  // 7. diamond DAG → 0 errors
  it('returns no errors for a diamond DAG (A→B, A→C, B→D, C→D)', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
      ['/P/C', entry('container', '/P/C')],
      ['/P/D', entry('container', '/P/D')],
    ]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      site({ sourcePath: '/P/A', targetPath: '/P/C' }),
      site({ sourcePath: '/P/B', targetPath: '/P/D' }),
      site({ sourcePath: '/P/C', targetPath: '/P/D' }),
    ];
    expect(checkRefCycles(sites, index)).toEqual([]);
  });

  // 8. 多 disjoint cycle → 2 errors，零交叉污染
  it('reports each disjoint cycle independently', () => {
    const index = new Map([
      ['/P/A1', entry('container', '/P/A1')],
      ['/P/A2', entry('container', '/P/A2')],
      ['/P/B1', entry('container', '/P/B1')],
      ['/P/B2', entry('container', '/P/B2')],
    ]);
    const sites = [
      // Cycle 1: A1 → A2 → A1
      site({ sourcePath: '/P/A1', targetPath: '/P/A2' }),
      site({ sourcePath: '/P/A2', targetPath: '/P/A1' }),
      // Cycle 2: B1 → B2 → B1
      site({ sourcePath: '/P/B1', targetPath: '/P/B2' }),
      site({ sourcePath: '/P/B2', targetPath: '/P/B1' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.kind === 'ref-cycle')).toBe(true);
    // Distinct canonical chains
    const chains = errors.map((e) => e.message).sort();
    expect(chains[0]).not.toBe(chains[1]);
  });

  // 9. cycle 含悬空边：仅 resolved subgraph 形成 cycle 时报；纯悬空链不报
  it('ignores dangling edges in cycle candidates (only resolved subgraph cycles emit)', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
    ]);
    // A→B→A is a real cycle. C→Dangling→C is purely dangling (C not in index).
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      site({ sourcePath: '/P/B', targetPath: '/P/A' }),
      site({ sourcePath: '/P/C', targetPath: '/P/Dangling' }),
      site({ sourcePath: '/P/Dangling', targetPath: '/P/C' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/\/P\/A/);
    expect(errors[0]?.message).not.toMatch(/\/P\/C/);
  });

  // 10. 占位符 target（empty）→ 跳过，无 false cycle
  it('skips placeholder targets (empty / trailing /)', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
    ]);
    // A→'' is a placeholder; no edge added to graph.
    // A→B alone is not a cycle. A→'' is filtered. → 0 errors.
    const sites: RefSite[] = [
      site({ sourcePath: '/P/A', targetPath: '' }),
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
    ];
    expect(checkRefCycles(sites, index)).toEqual([]);
  });

  // 11. cycle length 1/2/4 同存：3 个独立错误，3 个不同 canonical chain
  it('reports cycles of length 1, 2, and 4 as three independent errors (disjoint node sets)', () => {
    const index = new Map<string, PathIndexEntry>();
    const makeNode = (shortName: string) => {
      const path = `/P/${shortName}`;
      index.set(path, entry('container', path));
      return path;
    };
    // Self-loop A→A on its own node.
    const A = makeNode('A');
    // Length-2 cycle B↔C on disjoint nodes.
    const B = makeNode('B');
    const C = makeNode('C');
    // Length-4 cycle D→E→F→G→D on disjoint nodes.
    const D = makeNode('D');
    const E = makeNode('E');
    const F = makeNode('F');
    const G = makeNode('G');

    const sites = [
      site({ sourcePath: A, targetPath: A }),
      site({ sourcePath: B, targetPath: C }),
      site({ sourcePath: C, targetPath: B }),
      site({ sourcePath: D, targetPath: E }),
      site({ sourcePath: E, targetPath: F }),
      site({ sourcePath: F, targetPath: G }),
      site({ sourcePath: G, targetPath: D }),
    ];
    const errors = checkRefCycles(sites, index);
    // Exactly 3 errors: one per cycle, all on disjoint node sets.
    expect(errors).toHaveLength(3);
    const lengths = errors.map((e) => {
      const m = e.message.match(/(\d+) edges?/);
      return m ? Number(m[1]) : 0;
    });
    expect(lengths.sort()).toEqual([1, 2, 4]);
  });

  // 12. dedup 严格：complete 3-node graph (6 edges) → 3 distinct cycle sequences
  it('emits one error per distinct cycle sequence in a complete 3-node graph', () => {
    // Complete 3-node graph: A→B, A→C, B→A, B→C, C→A, C→B. Rotation-based
    // dedup collapses identical cycle *sequences* (not whole SCCs). The
    // distinct cycle *sequences* the algorithm can find are:
    //   1. A→B→A          (2 nodes / 2 edges)
    //   2. B→C→B          (2 nodes / 2 edges)
    //   3. A→B→C→A        (3 nodes / 3 edges)
    // → exactly 3 errors, all with distinct canonical chain strings.
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
      ['/P/C', entry('container', '/P/C')],
    ]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      site({ sourcePath: '/P/A', targetPath: '/P/C' }),
      site({ sourcePath: '/P/B', targetPath: '/P/A' }),
      site({ sourcePath: '/P/B', targetPath: '/P/C' }),
      site({ sourcePath: '/P/C', targetPath: '/P/A' }),
      site({ sourcePath: '/P/C', targetPath: '/P/B' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(3);
    const chains = errors.map((e) => {
      const m = e.message.match(/edges\): (.+)$/);
      return m ? m[1] : '';
    });
    // All three chains distinct.
    expect(new Set(chains).size).toBe(3);
  });

  // 13. 路径归一化：cycle 仅在 tryStripTypeSegment strip 后才可见
  it('detects cycles only visible after tryStripTypeSegment strips type segments', () => {
    // /EcucDefs/Com/ComConfig/Pdu/ComConfigSet_Tx_X has a "/Pdu/"
    // type segment. pathIndex uses the resolved form WITHOUT "/Pdu/".
    // Without `resolveTargetPath`, the graph has no edge (the source
    // path "looks like" /P/Pdu/X but the target key in pathIndex is
    // /P/X). With the helper, the edge is added and a cycle is found.
    const index = new Map([
      [
        '/EcucDefs/Com/ComConfig/ComConfigSet_Tx_X',
        entry('container', '/EcucDefs/Com/ComConfig/ComConfigSet_Tx_X'),
      ],
      [
        '/EcucDefs/Com/ComConfig/ComConfigSet_Tx_Y',
        entry('container', '/EcucDefs/Com/ComConfig/ComConfigSet_Tx_Y'),
      ],
    ]);
    const sites = [
      site({
        sourcePath: '/EcucDefs/Com/ComConfig/ComConfigSet_Tx_X',
        targetPath: '/EcucDefs/Com/ComConfig/Pdu/ComConfigSet_Tx_Y',
      }),
      site({
        sourcePath: '/EcucDefs/Com/ComConfig/ComConfigSet_Tx_Y',
        targetPath: '/EcucDefs/Com/ComConfig/Pdu/ComConfigSet_Tx_X',
      }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors.length).toBe(1);
    expect(errors[0]?.kind).toBe('ref-cycle');
  });

  // 14. mixed kind：container→reference→container cycle
  it('survives a cycle that crosses container → reference → container', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/R', entry('reference', '/P/R')],
      ['/P/C', entry('container', '/P/C')],
    ]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/R' }),
      site({ sourcePath: '/P/R', targetPath: '/P/C' }),
      site({ sourcePath: '/P/C', targetPath: '/P/A' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/3 edges/);
  });

  // 15. 1336 sites 大图无 cycle → 0 errors，不爆栈
  it('handles a 1336-site acyclic graph without blowing up', () => {
    const index = new Map<string, PathIndexEntry>();
    const sites: RefSite[] = [];
    // Build a long linear chain: /P/N0 → /P/N1 → ... → /P/N1335
    const N = 1336;
    for (let i = 0; i < N; i++) {
      const path = `/P/N${i}`;
      index.set(path, entry('container', path));
      if (i > 0) {
        sites.push(site({ sourcePath: `/P/N${i - 1}`, targetPath: path }));
      }
    }
    const start = Date.now();
    const errors = checkRefCycles(sites, index);
    const elapsed = Date.now() - start;
    expect(errors).toEqual([]);
    // Sanity cap: must finish in under 2s. (Typical: <50ms.)
    expect(elapsed).toBeLessThan(2000);
  });

  // 16. 100+ edges 压测 cycle → 1 error
  it('detects a single cycle within a 100+ edge linear prefix', () => {
    const index = new Map<string, PathIndexEntry>();
    const sites: RefSite[] = [];
    // Linear chain N0 → N1 → ... → N100, then N100 → N0 (closes the cycle).
    const N = 101;
    for (let i = 0; i < N; i++) {
      const path = `/P/N${i}`;
      index.set(path, entry('container', path));
      if (i > 0) {
        sites.push(site({ sourcePath: `/P/N${i - 1}`, targetPath: path }));
      }
    }
    sites.push(site({ sourcePath: `/P/N${N - 1}`, targetPath: `/P/N0` }));
    const errors = checkRefCycles(sites, index);
    expect(errors.length).toBe(1);
    expect(errors[0]?.message).toMatch(/101 edges/);
  });

  // 17. paramKey 透传：闭合边是 param-level ref → error 带 paramKey
  it('propagates paramKey from the closing-edge site to the error payload', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
    ]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      // Closing edge is a param-level ref on B with paramKey "DestRef".
      site({ sourcePath: '/P/B', targetPath: '/P/A', paramKey: 'DestRef' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.paramKey).toBe('DestRef');
  });

  // 18. error payload: expected / actual 都 undefined
  it('omits expected and actual on ref-cycle errors (structural integrity violation)', () => {
    const index = new Map([
      ['/P/A', entry('container', '/P/A')],
      ['/P/B', entry('container', '/P/B')],
    ]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/B' }),
      site({ sourcePath: '/P/B', targetPath: '/P/A' }),
    ];
    const errors = checkRefCycles(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.expected).toBeUndefined();
    expect(errors[0]?.actual).toBeUndefined();
    // path still set: the closing site.sourcePath
    expect(errors[0]?.path).toBe('/P/B');
  });
});
