// v1.32.0 MINOR T4 — findDcmBswmd locates Dcm BSWMD via parse-based detection.
import { describe, expect, it } from 'vitest';
import { findDcmBswmd } from '../bswmdHasDcm.js';

const DCM_BSWMD = `<?xml version="1.0"?>
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Ecuc</SHORT-NAME><ELEMENTS>
<ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF>
</ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;

const NON_DCM_BSWMD = `<?xml version="1.0"?>
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Ecuc</SHORT-NAME><ELEMENTS>
<ECUC-MODULE-DEF><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-DEF>
</ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;

function fakeFs(map: Record<string, string>) {
  return {
    readFile: async (p: string): Promise<string> => {
      if (p in map) return map[p]!;
      throw new Error(`ENOENT: ${p}`);
    },
  };
}

describe('findDcmBswmd (v1.32.0 T4)', () => {
  it('returns hasDcm:false when paths is empty', async () => {
    const r = await findDcmBswmd([], fakeFs({}));
    expect(r).toEqual({ hasDcm: false });
  });

  it('returns hasDcm:true with the matching path when one BSWMD has Dcm', async () => {
    const r = await findDcmBswmd(['/x.arxml'], fakeFs({ '/x.arxml': DCM_BSWMD }));
    expect(r).toEqual({ hasDcm: true, dcmBswmdPath: '/x.arxml' });
  });

  it('returns hasDcm:false when no BSWMD has Dcm', async () => {
    const r = await findDcmBswmd(['/x.arxml'], fakeFs({ '/x.arxml': NON_DCM_BSWMD }));
    expect(r).toEqual({ hasDcm: false });
  });

  it('returns first matching path when multiple BSWMDs have Dcm (deterministic order)', async () => {
    const r = await findDcmBswmd(
      ['/a.arxml', '/b.arxml', '/c.arxml'],
      fakeFs({ '/a.arxml': DCM_BSWMD, '/b.arxml': DCM_BSWMD, '/c.arxml': DCM_BSWMD }),
    );
    expect(r.hasDcm).toBe(true);
    expect(r.dcmBswmdPath).toBe('/a.arxml');
  });

  it('returns the matching path in a mixed list (Dcm + non-Dcm)', async () => {
    const r = await findDcmBswmd(
      ['/a.arxml', '/b.arxml'],
      fakeFs({ '/a.arxml': NON_DCM_BSWMD, '/b.arxml': DCM_BSWMD }),
    );
    expect(r).toEqual({ hasDcm: true, dcmBswmdPath: '/b.arxml' });
  });

  it('returns hasDcm:false when fs.readFile throws for all paths (fail-soft)', async () => {
    const r = await findDcmBswmd(['/missing.arxml'], fakeFs({}));
    expect(r).toEqual({ hasDcm: false });
  });

  it('returns hasDcm:false when BSWMD XML is malformed (fail-soft)', async () => {
    const r = await findDcmBswmd(['/bad.arxml'], fakeFs({ '/bad.arxml': '<not-xml' }));
    expect(r).toEqual({ hasDcm: false });
  });

  it('skips unparseable files and finds Dcm in a parseable file (mixed)', async () => {
    const r = await findDcmBswmd(
      ['/bad.arxml', '/good.arxml'],
      fakeFs({ '/bad.arxml': '<not-xml', '/good.arxml': DCM_BSWMD }),
    );
    expect(r).toEqual({ hasDcm: true, dcmBswmdPath: '/good.arxml' });
  });

  it('handles many paths in parallel (performance smoke)', async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `/f${i}.arxml`);
    const fs = fakeFs(Object.fromEntries(paths.map((p, i) => [p, i === 7 ? DCM_BSWMD : NON_DCM_BSWMD])));
    const r = await findDcmBswmd(paths, fs);
    expect(r.hasDcm).toBe(true);
    expect(r.dcmBswmdPath).toBe('/f7.arxml');
  });

  it('returns hasDcm:false when all paths parse but declare no modules', async () => {
    const empty = `<?xml version="1.0"?><AR-PACKAGES></AR-PACKAGES>`;
    const r = await findDcmBswmd(['/empty.arxml'], fakeFs({ '/empty.arxml': empty }));
    expect(r).toEqual({ hasDcm: false });
  });

  it('handles deeply nested AR-PACKAGES', async () => {
    const nested = `<?xml version="1.0"?>
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>A</SHORT-NAME><AR-PACKAGES>
<AR-PACKAGE><SHORT-NAME>B</SHORT-NAME><ELEMENTS>
<ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF>
</ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES>`;
    const r = await findDcmBswmd(['/nested.arxml'], fakeFs({ '/nested.arxml': nested }));
    expect(r).toEqual({ hasDcm: true, dcmBswmdPath: '/nested.arxml' });
  });

  it('does not pick up non-Dcm module shortNames like "DcmDsl"', async () => {
    // The DCM_MODULE_SHORT_NAME constant is 'Dcm' (literal); a BSWMD with
    // 'DcmDsl' should not match. This is a regression lock for substring
    // matching bugs.
    const dslOnly = `<?xml version="1.0"?>
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Ecuc</SHORT-NAME><ELEMENTS>
<ECUC-MODULE-DEF><SHORT-NAME>DcmDsl</SHORT-NAME></ECUC-MODULE-DEF>
</ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;
    const r = await findDcmBswmd(['/dsl.arxml'], fakeFs({ '/dsl.arxml': dslOnly }));
    expect(r).toEqual({ hasDcm: false });
  });
});
