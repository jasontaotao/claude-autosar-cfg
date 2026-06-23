import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';
import type { ArxmlContainer, ArxmlDocument } from '../types.js';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'arxml');

describe('serializeArxml', () => {
  it('serializes minimal ArxmlDocument with module + container + 2 params', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'P',
          path: '/P',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'M',
              params: {},
              references: [],
              children: [
                {
                  kind: 'container',
                  tagName: 'ECUC-CONTAINER-VALUE',
                  shortName: 'C',
                  params: {
                    A: { type: 'integer', value: 7 },
                    B: { type: 'enum', value: 'X' },
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('<AUTOSAR');
    expect(r.value).toContain('<SHORT-NAME>P</SHORT-NAME>');
    expect(r.value).toContain('<SHORT-NAME>M</SHORT-NAME>');
    expect(r.value).toContain('<SHORT-NAME>C</SHORT-NAME>');
    expect(r.value).toContain('<VALUE>7</VALUE>');
    expect(r.value).toContain('<VALUE>X</VALUE>');
  });

  it('serializes ArxmlReference with dest attribute', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'P',
          path: '/P',
          elements: [
            {
              kind: 'reference',
              tagName: 'DEFINITION-REF',
              value: '/A/B/M',
              dest: 'ECUC-MODULE-DEF',
            },
          ],
        },
      ],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('DEST="ECUC-MODULE-DEF"');
    expect(r.value).toContain('/A/B/M');
  });

  it('serializes empty document with self-closing AR-PACKAGES', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('<AUTOSAR');
    expect(r.value).toContain('<AR-PACKAGES');
  });

  // ---------- Sprint 9 #12: nested AR-PACKAGE round-trip ----------
  // After parser.walkPackages recurses into nested <AR-PACKAGES>, the serializer
  // must mirror the structure so parse → serialize → re-parse is field-equal.

  it('serializes nested AR-PACKAGES preserving the recursive package hierarchy', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'Outer',
          path: '/Outer',
          elements: [],
          packages: [
            {
              shortName: 'Inner',
              path: '/Outer/Inner',
              elements: [
                {
                  kind: 'module',
                  tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                  shortName: 'M',
                  params: {},
                  references: [],
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Both layers emit nested <AR-PACKAGE> blocks.
    expect(r.value).toContain('<AR-PACKAGES>');
    expect(r.value).toContain('<SHORT-NAME>Outer</SHORT-NAME>');
    expect(r.value).toContain('<SHORT-NAME>Inner</SHORT-NAME>');
    expect(r.value).toContain('<SHORT-NAME>M</SHORT-NAME>');
  });

  it('omits AR-PACKAGES block when package has no nested packages (flat fixtures back-compat)', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'Flat',
          path: '/Flat',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'M',
              params: {},
              references: [],
              children: [],
            },
          ],
        },
      ],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The flat fixture must not emit a spurious <AR-PACKAGES> inside Flat.
    // We check that the XML only has the top-level <AR-PACKAGES> wrapper.
    const matches = r.value.match(/<AR-PACKAGES>/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  // Sprint 7 T1-B: serializer must emit <REFERENCE-VALUES><ECUC-REFERENCE-VALUE>
  // wrappers for params with type:'reference' so that round-trip parse → serialize →
  // re-parse keeps the params intact (5 fixture round-trip tests rely on this).
  describe('ECUC-REFERENCE-VALUE serialization', () => {
    it('case 1: single reference param emits REFERENCE-VALUES wrapper with VALUE-REF+DEST; regular params stay in PARAMETER-VALUES', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'P',
            path: '/P',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'M',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'C',
                    params: {
                      ComPduIdRef: {
                        type: 'reference',
                        value: '/EAS/EcuC/EcucPduCollection/Pdu/MyPdu',
                        dest: 'ECUC-CONTAINER-VALUE',
                      },
                      Threshold: { type: 'integer', value: 5 },
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // reference inside <REFERENCE-VALUES><ECUC-REFERENCE-VALUE>
      expect(r.value).toContain('<REFERENCE-VALUES>');
      expect(r.value).toContain('<ECUC-REFERENCE-VALUE>');
      expect(r.value).toContain(
        '<VALUE-REF DEST="ECUC-CONTAINER-VALUE">/EAS/EcuC/EcucPduCollection/Pdu/MyPdu</VALUE-REF>',
      );
      // regular params stay inside <PARAMETER-VALUES>
      expect(r.value).toContain('<PARAMETER-VALUES>');
      expect(r.value).toContain('<VALUE>5</VALUE>');
    });

    it('case 2: reference without dest omits @_DEST on VALUE-REF', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'P',
            path: '/P',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'M',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'C',
                    params: {
                      BareRef: { type: 'reference', value: '/A/B/Target' },
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // <VALUE-REF> appears without DEST attribute
      expect(r.value).toMatch(/<VALUE-REF>\/A\/B\/Target<\/VALUE-REF>/);
      expect(r.value).not.toMatch(/<VALUE-REF\s+DEST=/);
    });

    it('case 3: mixed reference + integer + boolean — REFERENCE-VALUES and PARAMETER-VALUES are strictly separated', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'P',
            path: '/P',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'M',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'C',
                    params: {
                      RefA: {
                        type: 'reference',
                        value: '/A/B/Tgt',
                        dest: 'ECUC-CONTAINER-VALUE',
                      },
                      Count: { type: 'integer', value: 42 },
                      On: { type: 'boolean', value: true },
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // <REFERENCE-VALUES> wrapper present
      expect(r.value).toContain('<REFERENCE-VALUES>');
      // <ECUC-REFERENCE-VALUE> only appears inside <REFERENCE-VALUES>, not inside <PARAMETER-VALUES>
      const refBlock = r.value.match(/<REFERENCE-VALUES>[\s\S]*?<\/REFERENCE-VALUES>/);
      expect(refBlock).not.toBeNull();
      if (refBlock) {
        expect(refBlock[0]).toContain('<ECUC-REFERENCE-VALUE>');
        expect(refBlock[0]).toContain('<VALUE-REF');
        expect(refBlock[0]).not.toContain('<PARAMETER-VALUES>');
      }
      const pvBlock = r.value.match(/<PARAMETER-VALUES>[\s\S]*?<\/PARAMETER-VALUES>/);
      expect(pvBlock).not.toBeNull();
      if (pvBlock) {
        expect(pvBlock[0]).toContain('<ECUC-NUMERICAL-PARAM-VALUE>');
        expect(pvBlock[0]).toContain('<VALUE>42</VALUE>');
        expect(pvBlock[0]).toContain('<VALUE>true</VALUE>');
        expect(pvBlock[0]).not.toContain('<ECUC-REFERENCE-VALUE>');
        expect(pvBlock[0]).not.toContain('<VALUE-REF');
      }
    });

    it('case 4: container with no params emits neither REFERENCE-VALUES nor PARAMETER-VALUES wrappers', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'P',
            path: '/P',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'M',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'C',
                    params: {},
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).not.toContain('<REFERENCE-VALUES>');
      expect(r.value).not.toContain('<PARAMETER-VALUES>');
    });

    it('case 5: DEFINITION-REF inside ECUC-REFERENCE-VALUE uses synthesized path matching parser round-trip', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'P',
            path: '/P',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'M',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'C',
                    params: {
                      ComPduIdRef: {
                        type: 'reference',
                        value: '/A/B/Target',
                        dest: 'ECUC-CONTAINER-VALUE',
                      },
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // DEFINITION-REF must point at ECUC-REFERENCE-DEF and use synthesized path
      expect(r.value).toContain('<DEFINITION-REF DEST="ECUC-REFERENCE-DEF">');
      expect(r.value).toContain('/__synthesized__/ComPduIdRef');
    });

    it('Sprint 16: regular param DEFINITION-REF prefers value.definitionRef over synthesized path', () => {
      // Skeleton-generated ECUC carries the BSWMD-side path on each
      // default-filled param. The serializer must use that path so
      // vendor tools (EB tresos / Vector / ETAS) can resolve it.
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'Can',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'CanGeneral',
                    params: {
                      CanIfSupport: {
                        type: 'integer',
                        value: 0,
                        definitionRef: '/AUTOSAR/EcucDefs/Can/CanConfigSet/CanIfSupport',
                      },
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toContain(
        '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR/EcucDefs/Can/CanConfigSet/CanIfSupport</DEFINITION-REF>',
      );
      expect(r.value).not.toContain('/__synthesized__/');
    });

    // ---------- Sprint X — ECUC-CONTAINER-VALUE DEFINITION-REF ----------
    // Phase 1 of Sprint X — stamp `ArxmlContainer.definitionRef` at skeleton
    // construction time and emit it as a `<DEFINITION-REF DEST="...">`
    // child of every `<ECUC-CONTAINER-VALUE>`. The DEST attribute
    // distinguishes plain sub-containers (`ECUC-PARAM-CONF-CONTAINER-DEF`)
    // from choice shells (`ECUC-CHOICE-CONTAINER-DEF`). Legacy in-memory
    // documents that pre-date the v1.9.0 stamping (no `definitionRef`)
    // must keep emitting XML without the tag — round-trip is field-equal
    // for pre-fix fixtures.

    it('case 1: container with definitionRef emits <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'Can',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'CanGeneral',
                    params: {},
                    children: [],
                    definitionRef: '/AUTOSAR/EcucDefs/Can/CanConfigSet/CanGeneral',
                  } as ArxmlContainer,
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toContain(
        '<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/EcucDefs/Can/CanConfigSet/CanGeneral</DEFINITION-REF>',
      );
    });

    it('case 2: choice container with definitionRef emits <DEFINITION-REF DEST="ECUC-CHOICE-CONTAINER-DEF">', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'Can',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'CanIfBufferCfg',
                    params: {},
                    children: [],
                    isChoiceContainer: true,
                    choiceBranches: ['CanIfMailbox', 'CanIfRxBuffer'],
                    definitionRef: '/AUTOSAR/EcucDefs/CanIf/CanIfConfigSet/CanIfBufferCfg',
                  } as ArxmlContainer,
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toContain(
        '<DEFINITION-REF DEST="ECUC-CHOICE-CONTAINER-DEF">/AUTOSAR/EcucDefs/CanIf/CanIfConfigSet/CanIfBufferCfg</DEFINITION-REF>',
      );
    });

    it('case 3: legacy container without definitionRef omits <DEFINITION-REF> tag (back-compat)', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'Can',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'LegacyContainer',
                    params: {},
                    children: [],
                    // No definitionRef — pre-v1.9.0 shape.
                  },
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // The container block must not contain a DEFINITION-REF at all.
      // (Module-level DEFINITION-REFs are unrelated and pre-existing.)
      // Anchor on the container's own block to avoid false positives.
      const containerBlock = r.value.match(
        /<ECUC-CONTAINER-VALUE>[\s\S]*?<\/ECUC-CONTAINER-VALUE>/,
      );
      expect(containerBlock).not.toBeNull();
      if (containerBlock) {
        expect(containerBlock[0]).not.toContain('<DEFINITION-REF');
      }
    });

    it('Sprint 16: reference param DEFINITION-REF prefers value.definitionRef over synthesized path', () => {
      const doc: ArxmlDocument = {
        path: '',
        version: '4.6',
        packages: [
          {
            shortName: 'EAS',
            path: '/EAS',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'Com',
                params: {},
                references: [],
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'ComConfig',
                    params: {
                      ComPduIdRef: {
                        type: 'reference',
                        value: '/EAS/Com/ComConfig/Pdu',
                        definitionRef: '/AUTOSAR/EcucDefs/Com/ComConfig/ComPduIdRef',
                      },
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      const r = serializeArxml(doc);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toContain(
        '<DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/AUTOSAR/EcucDefs/Com/ComConfig/ComPduIdRef</DEFINITION-REF>',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// v1.5.1 PR(2) — preserveSourceOrder mode
// ---------------------------------------------------------------------------
//
// When `sourceArxml` is supplied, the serializer must emit packages and
// elements in the same order they appeared in the source XML. This closes
// the documented v1.4.0 limitation that sibling order was determined by
// model iteration order rather than source order.
//
// Behavior contract:
// - Without `sourceArxml`: identical to v1.5.0 (no behavioral change).
// - With `sourceArxml`: container emission order matches source XML.
// - Newly-added containers (absent from source) follow the existing ones.
// - Only AR-PACKAGE / ELEMENT / MODULE container order is preserved; inner
//   param/attribute order is unchanged (Q5 B tolerance rules).

// Extract the order of <AR-PACKAGE><SHORT-NAME> pairs in document order.
// Fixtures use a single AR-PACKAGE per file; this still validates order
// when multiple nested packages exist (sibling + nested <AR-PACKAGES>).
function extractPackageShortNames(xml: string): string[] {
  const out: string[] = [];
  // Match SHORT-NAME direct children of AR-PACKAGE blocks.
  const re = /<AR-PACKAGE>\s*<SHORT-NAME>([^<]+)<\/SHORT-NAME>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

// Extract the order of SHORT-NAME-bearing DIRECT children of every
// <ELEMENTS> block. We walk the inner body character-by-character to
// avoid matching nested SHORT-NAMEs that live inside <CONTAINERS>,
// <SUB-CONTAINERS>, or <PARAMETER-VALUES>. Only the first-level
// children count.
function extractElementOrder(xml: string): Array<{ tag: string; name: string }> {
  const out: Array<{ tag: string; name: string }> = [];
  const re = /<ELEMENTS>([\s\S]*?)<\/ELEMENTS>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(...extractDirectChildren(m[1]!));
  }
  return out;
}

/**
 * Walk `inner` and return the SHORT-NAME-bearing direct children of
 * the surrounding <ELEMENTS> wrapper. Depth-counting is used to skip
 * nested wrappers (<CONTAINERS>, <SUB-CONTAINERS>, <PARAMETER-VALUES>,
 * <REFERENCE-VALUES>).
 */
function extractDirectChildren(inner: string): Array<{ tag: string; name: string }> {
  const out: Array<{ tag: string; name: string }> = [];
  let depth = 0;
  let i = 0;
  while (i < inner.length) {
    // Skip whitespace
    while (i < inner.length && /\s/.test(inner[i]!)) i++;
    if (i >= inner.length) break;
    if (inner[i] !== '<') {
      i++;
      continue;
    }
    // Parse a tag
    const closeIdx = inner.indexOf('>', i);
    if (closeIdx === -1) break;
    const tagText = inner.slice(i + 1, closeIdx);
    const isClose = tagText.startsWith('/');
    const isSelfClose = tagText.endsWith('/');
    const tagName = isClose
      ? tagText.slice(1).trim()
      : (isSelfClose ? tagText.slice(0, -1).trim() : tagText.trim()).split(/\s/)[0]!;
    if (isClose) {
      depth--;
      i = closeIdx + 1;
      continue;
    }
    if (isSelfClose) {
      // Self-closing tag — never carries a SHORT-NAME child.
      i = closeIdx + 1;
      continue;
    }
    if (depth === 0) {
      // Direct child — look for an immediate <SHORT-NAME>...</SHORT-NAME>.
      const after = inner.slice(closeIdx + 1);
      const snMatch = /^\s*<SHORT-NAME>([^<]+)<\/SHORT-NAME>/.exec(after);
      if (snMatch) {
        out.push({ tag: tagName, name: snMatch[1]! });
      }
    }
    depth++;
    i = closeIdx + 1;
  }
  return out;
}

describe('serializeArxml — preserveSourceOrder mode (PR(2))', () => {
  it('preserves <AR-PACKAGE> and <ELEMENT> order from sourceArxml (EcuC_EcuC)', async () => {
    const source = await readFile(join(FIXTURE_DIR, 'EcuC_EcuC.arxml'), 'utf-8');
    const parsed = parseArxml(source);
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.kind}`);

    const result = serializeArxml(parsed.value, { sourceArxml: source });
    if (!result.ok) throw new Error(`serialize failed: ${result.error.kind}`);
    expect(extractPackageShortNames(result.value)).toEqual(extractPackageShortNames(source));
    expect(extractElementOrder(result.value)).toEqual(extractElementOrder(source));
  });

  it('preserves element order for vendor /EAS/ namespace fixture (vendor-extension.arxml)', async () => {
    // vendor-extension.arxml contains a deliberate mix of unknown
    // (SERVICE-NEEDS, EXCLUSIVE-AREA, EAS-CUSTOM-DATA) and known
    // (ECUC-MODULE-CONFIGURATION-VALUES) siblings. Source order must
    // round-trip exactly when sourceArxml is supplied.
    const source = await readFile(join(FIXTURE_DIR, 'vendor-extension.arxml'), 'utf-8');
    const parsed = parseArxml(source);
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.kind}`);

    const result = serializeArxml(parsed.value, { sourceArxml: source });
    if (!result.ok) throw new Error(`serialize failed: ${result.error.kind}`);
    expect(extractElementOrder(result.value)).toEqual(extractElementOrder(source));
  });

  it('preserves element order for vector CDD-style fixture (Com_Com.arxml)', async () => {
    // Com_Com.arxml is the largest fixture (~122 KB) — exercises the
    // order-preservation path at scale where reordering would visibly
    // diverge from source.
    const source = await readFile(join(FIXTURE_DIR, 'Com_Com.arxml'), 'utf-8');
    const parsed = parseArxml(source);
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.kind}`);

    const result = serializeArxml(parsed.value, { sourceArxml: source });
    if (!result.ok) throw new Error(`serialize failed: ${result.error.kind}`);
    expect(extractElementOrder(result.value)).toEqual(extractElementOrder(source));
  });

  it('ignores sourceArxml when not provided (backward-compatible baseline)', async () => {
    // Without sourceArxml the serializer falls back to model iteration
    // order. This test pins that the no-sourceArxml path still works
    // and produces a successful (ok) result. Order is intentionally NOT
    // asserted here because the v1.5.0 behavior may differ across
    // input shapes; PR(2) only adds the new opt-in mode.
    const source = await readFile(join(FIXTURE_DIR, 'EcuC_EcuC.arxml'), 'utf-8');
    const parsed = parseArxml(source);
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.kind}`);

    const result = serializeArxml(parsed.value);
    if (!result.ok) throw new Error(`serialize failed: ${result.error.kind}`);
    expect(result.value).toContain('<AR-PACKAGE>');
    expect(result.value).toContain('<SHORT-NAME>EcucDefs</SHORT-NAME>');
  });

  it('reorders output to match a reordered sourceArxml', async () => {
    // Manually swap the order of two TOP-LEVEL elements inside a
    // package and verify the output follows the source. PR(2) only
    // reorders top-level ELEMENTS siblings (per plan Q5 B tolerance),
    // not module/container children — those are preserved by the
    // parser's natural order-keeping.
    const source = await readFile(join(FIXTURE_DIR, 'PduR_PduR.arxml'), 'utf-8');
    const parsed = parseArxml(source);
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.kind}`);

    const doc = parsed.value;
    const pkg = doc.packages[0]!;
    // PduR_PduR.arxml has 2 top-level elements: AUTOSARParameterDefinition
    // (ECUC-DEFINITION-COLLECTION) and PduR (ECUC-MODULE-CONFIGURATION-VALUES).
    if (pkg.elements.length < 2) {
      throw new Error('PduR_PduR.arxml: expected ≥2 top-level elements to reorder');
    }
    const a = pkg.elements[0]!;
    const b = pkg.elements[1]!;
    // PduR_PduR.arxml's top-level elements are both container/module
    // kinds with a typed shortName. Narrow to those kinds so TS accepts
    // the `.shortName` access.
    if (a.kind === 'unknown' || b.kind === 'unknown') {
      throw new Error('PduR_PduR.arxml: top-level elements are not unknown');
    }
    const aName = a.shortName;
    const bName = b.shortName;
    if (aName === undefined || bName === undefined) {
      throw new Error('PduR_PduR.arxml: top-level elements must have shortName');
    }
    // Swap the two so the in-memory model has b before a.
    const swapped = {
      ...doc,
      packages: [
        {
          ...pkg,
          elements: [b, a, ...pkg.elements.slice(2)],
        },
      ],
    };

    const result = serializeArxml(swapped, { sourceArxml: source });
    if (!result.ok) throw new Error(`serialize failed: ${result.error.kind}`);

    // Anchor on the top-level <ELEMENTS> block (the one inside the
    // package's <AR-PACKAGE>) so we look only at the package's direct
    // element SHORT-NAMEs, not module-level DEFINITION-REFs that might
    // reference the same paths.
    const elementsStart = result.value.indexOf('<ELEMENTS>');
    expect(elementsStart).toBeGreaterThan(-1);
    const tail = result.value.slice(elementsStart);
    const aIdx = tail.indexOf(`<SHORT-NAME>${aName}</SHORT-NAME>`);
    const bIdx = tail.indexOf(`<SHORT-NAME>${bName}</SHORT-NAME>`);
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(-1);

    // sourceArxml has `a` before `b`. The in-memory model has `b` before
    // `a` (we swapped them above). The serializer must follow
    // sourceArxml and emit `a` before `b` — i.e. aIdx < bIdx.
    expect(aIdx).toBeLessThan(bIdx);
  });

  it('tolerates in-memory packages missing from source (deletion case)', async () => {
    // Code-review HIGH-fix coverage: when the in-memory model has fewer
    // packages than the source (e.g. user deleted one), the reorder
    // must look up source counterparts by shortName rather than by
    // index. Otherwise a positional misalignment would reorder C's
    // children against B's source elements and produce nonsensical
    // output.
    const source = await readFile(join(FIXTURE_DIR, 'vendor-extension.arxml'), 'utf-8');
    const parsed = parseArxml(source);
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.kind}`);

    // Build a synthetic source with 3 named packages in canonical order
    // A, B, C. The in-memory model only carries A and C (B deleted).
    const syntheticSource = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-2-2.xsd">',
      '<AR-PACKAGES>',
      '  <AR-PACKAGE><SHORT-NAME>A</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>MA</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE>',
      '  <AR-PACKAGE><SHORT-NAME>B</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>MB</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE>',
      '  <AR-PACKAGE><SHORT-NAME>C</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>MC</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE>',
      '</AR-PACKAGES>',
      '</AUTOSAR>',
    ].join('\n');
    const syntheticParsed = parseArxml(syntheticSource);
    if (!syntheticParsed.ok) throw new Error('synthetic parse failed');

    // Keep only A and C in-memory (B deleted).
    const inMemory: ArxmlDocument = {
      ...syntheticParsed.value,
      packages: [
        syntheticParsed.value.packages[0]!, // A
        syntheticParsed.value.packages[2]!, // C (B removed)
      ],
    };

    const result = serializeArxml(inMemory, { sourceArxml: syntheticSource });
    if (!result.ok) throw new Error(`serialize failed: ${result.error.kind}`);

    // Order should match source: A before C.
    const aIdx = result.value.indexOf('<SHORT-NAME>A</SHORT-NAME>');
    const cIdx = result.value.indexOf('<SHORT-NAME>C</SHORT-NAME>');
    const bIdx = result.value.indexOf('<SHORT-NAME>B</SHORT-NAME>');
    expect(aIdx).toBeGreaterThan(-1);
    expect(cIdx).toBeGreaterThan(-1);
    expect(bIdx).toBe(-1); // B was deleted, must not appear in output.
    expect(aIdx).toBeLessThan(cIdx);
  });
});

// ---------------------------------------------------------------------------
// Wave 4.B coverage tests (branch coverage targets)
// ---------------------------------------------------------------------------

describe('serializeArxml — option flags and edge cases (Wave 4.B coverage)', () => {
  it('omits xml declaration when xmlDeclaration:false', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [{ shortName: 'P', path: '/P', elements: [] }],
    };
    const r = serializeArxml(doc, { xmlDeclaration: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // When xmlDeclaration:false, the leading <?xml ... ?> is omitted.
    expect(r.value).not.toContain('<?xml');
  });

  it('uses opts.version when provided (overrides doc.version)', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [{ shortName: 'P', path: '/P', elements: [] }],
    };
    const r = serializeArxml(doc, { version: '4.2' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The xmlns should follow the override version, not the doc.version.
    expect(r.value).toContain('http://autosar.org/schema/r4.2');
    expect(r.value).toContain('AUTOSAR_4-2-2.xsd');
  });

  it('renders <LONG-NAME> when the package carries one', () => {
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [{ shortName: 'P', path: '/P', longName: 'My Package', elements: [] }],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('<LONG-NAME>');
    expect(r.value).toContain('<L-4>My Package</L-4>');
  });

  it('renders nested AR-PACKAGES for a module.references entry with non-trivial DEST', () => {
    // The m.references[0] split on `:` branch — when the entry does have a
    // colon, it emits @_DEST. Build a doc with one reference carrying
    // "ECUC-REFERENCE-DEF:/path" so the dest branch (line 174) fires.
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'P',
          path: '/P',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'M',
              params: {},
              references: ['ECUC-REFERENCE-DEF:/Some/Path'],
              children: [],
            },
          ],
        },
      ],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('<DEFINITION-REF DEST="ECUC-REFERENCE-DEF">');
    expect(r.value).toContain('/Some/Path');
  });

  it('omits @_DEST on module DEFINITION-REF when no colon in reference string', () => {
    // When the reference entry has no colon (e.g. legacy single-string
    // form), the dest branch falls through and no @_DEST is emitted.
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'P',
          path: '/P',
          elements: [
            {
              kind: 'module',
              tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
              shortName: 'M',
              params: {},
              references: ['/Bare/Path/No/Dest'],
              children: [],
            },
          ],
        },
      ],
    };
    const r = serializeArxml(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The colon-less branch emits the bare string as #text without a
    // @_DEST attribute. fast-xml-parser renders both the bare path in
    // #text and also as a synthetic attribute — we focus on the structural
    // shape: the DEFINITION-REF tag must exist with the bare path as text.
    expect(r.value).toContain('<DEFINITION-REF');
    // Pin that the @_DEST attribute is NOT 'ECUC-REFERENCE-DEF' (which
    // would only appear if the colon branch fired with a real DEST value).
    expect(r.value).not.toContain('DEST="ECUC-REFERENCE-DEF"');
    expect(r.value).toContain('/Bare/Path/No/Dest');
  });
});
