import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { parseArxml } from '../parser.js';
import type { ArxmlModule, ArxmlContainer } from '../types.js';

describe('EcuC_EcuC.arxml debug', () => {
  it('module children and params', async () => {
    const p = join(process.cwd(), 'tests', 'fixtures', 'arxml', 'EcuC_EcuC.arxml');
    const xml = await readFile(p, 'utf8');
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = r.value;
    expect(doc.packages.length).toBeGreaterThanOrEqual(1);
    const pkg = doc.packages[0]!;
    console.log('root package:', pkg.shortName, 'elements:', pkg.elements.length);

    // Find the EcuC module
    const mod = pkg.elements.find(
      // v1.4.0 trust sprint — 17c. Narrow to module/container (unknown
      // vendor extensions have no SHORT-NAME and can't match 'EcuC').
      (e): e is Extract<typeof e, { kind: 'module' | 'container' }> =>
        (e.kind === 'module' || e.kind === 'container') && e.shortName === 'EcuC',
    );
    expect(mod).toBeDefined();
    if (!mod) return;
    expect(mod.kind).toBe('module');
    const m = mod as ArxmlModule;
    console.log(
      'module:',
      m.shortName,
      'kind:',
      m.kind,
      'children:',
      m.children.length,
      'params:',
      Object.keys(m.params).length,
    );

    // List children
    for (const ch of m.children) {
      // v1.4.0 trust sprint — 17c. The EcuC fixture has no unknown
      // children, but skip defensively so the debug helper is robust.
      if (ch.kind !== 'container' && ch.kind !== 'module') continue;
      const c = ch as ArxmlContainer;
      console.log(
        '  child:',
        c.shortName,
        'kind:',
        c.kind,
        'params:',
        Object.keys(c.params).length,
        'children:',
        c.children.length,
      );
    }

    // EcucGeneral should be a child
    // v1.4.0 trust sprint — 17c. Narrow to known kinds before reading
    // SHORT-NAME (unknown elements have no SHORT-NAME).
    const ecucGeneral = m.children.find(
      (c): c is ArxmlContainer => c.kind === 'container' && c.shortName === 'EcucGeneral',
    );
    expect(ecucGeneral).toBeDefined();
    if (!ecucGeneral) return;
    expect(Object.keys(ecucGeneral.params)).toEqual(['BitOrder', 'ByteOrder', 'CPUType']);

    // EcucPduCollection should have sub-containers
    const pduCollection = m.children.find(
      // v1.4.0 trust sprint — 17c. Narrow to container before reading SHORT-NAME.
      (c): c is ArxmlContainer => c.kind === 'container' && c.shortName === 'EcucPduCollection',
    );
    expect(pduCollection).toBeDefined();
    if (!pduCollection) return;
    console.log('EcucPduCollection children count:', pduCollection.children.length);
    expect(pduCollection.children.length).toBeGreaterThan(0);

    // First Pdu sub-container should have params
    const firstPdu = pduCollection.children[0] as ArxmlContainer;
    console.log('first Pdu:', firstPdu.shortName, 'params:', Object.keys(firstPdu.params));
    expect(Object.keys(firstPdu.params).length).toBeGreaterThan(0);
  });
});
