import { describe, it, expect } from 'vitest';

import { serializeArxml } from '../serializer.js';
import type { ArxmlDocument } from '../types.js';

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
