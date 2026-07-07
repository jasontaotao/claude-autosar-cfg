// v1.32.0 MINOR T3 — flatten BSWMD module shortNames for hasDcmBswmd gating.
import { describe, expect, it } from 'vitest';

import { arxmlModuleShortNames } from '../arxmlModuleShortNames.js';

const SINGLE_DCM = `<?xml version="1.0" encoding="UTF-8"?>
<AR-PACKAGES>
  <AR-PACKAGE>
    <SHORT-NAME>Ecuc</SHORT-NAME>
    <ELEMENTS>
      <ECUC-MODULE-DEF>
        <SHORT-NAME>Dcm</SHORT-NAME>
        <CONTAINERS>...</CONTAINERS>
      </ECUC-MODULE-DEF>
    </ELEMENTS>
  </AR-PACKAGE>
</AR-PACKAGES>`;

const MULTIPLE_MODULES = `<?xml version="1.0" encoding="UTF-8"?>
<AR-PACKAGES>
  <AR-PACKAGE>
    <SHORT-NAME>Ecuc</SHORT-NAME>
    <ELEMENTS>
      <ECUC-MODULE-DEF><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-DEF>
      <ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF>
      <ECUC-MODULE-DEF><SHORT-NAME>PduR</SHORT-NAME></ECUC-MODULE-DEF>
    </ELEMENTS>
  </AR-PACKAGE>
</AR-PACKAGES>`;

const NESTED_PACKAGES = `<?xml version="1.0" encoding="UTF-8"?>
<AR-PACKAGES>
  <AR-PACKAGE>
    <SHORT-NAME>A</SHORT-NAME>
    <AR-PACKAGES>
      <AR-PACKAGE>
        <SHORT-NAME>B</SHORT-NAME>
        <ELEMENTS>
          <ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF>
        </ELEMENTS>
      </AR-PACKAGE>
    </AR-PACKAGES>
  </AR-PACKAGE>
</AR-PACKAGES>`;

describe('arxmlModuleShortNames (v1.32.0 T3)', () => {
  it('returns the single module shortName for a minimal BSWMD', () => {
    expect(arxmlModuleShortNames(SINGLE_DCM)).toEqual(['Dcm']);
  });

  it('returns all module shortNames when multiple modules are declared', () => {
    expect(arxmlModuleShortNames(MULTIPLE_MODULES)).toEqual(['CanIf', 'Dcm', 'PduR']);
  });

  it('flattens nested AR-PACKAGES recursively', () => {
    expect(arxmlModuleShortNames(NESTED_PACKAGES)).toEqual(['Dcm']);
  });

  it('returns an empty array when no modules are declared', () => {
    const empty = `<?xml version="1.0"?><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>X</SHORT-NAME></AR-PACKAGE></AR-PACKAGES>`;
    expect(arxmlModuleShortNames(empty)).toEqual([]);
  });

  it('returns an empty array for malformed XML (fail-soft)', () => {
    expect(arxmlModuleShortNames('<not-xml')).toEqual([]);
  });

  it('returns an empty array for empty string', () => {
    expect(arxmlModuleShortNames('')).toEqual([]);
  });

  // Regression: locks the "anywhere" contract from the brief. The walker
  // must descend into keys beyond the AR-PACKAGES/AR-PACKAGE/ELEMENTS
  // whitelist. A real OEM BSWMD may host ECUC-MODULE-DEF directly under
  // AR-PACKAGES (no wrapping AR-PACKAGE) or under a non-package container.
  it('finds ECUC-MODULE-DEF when ELEMENTS lives directly under AR-PACKAGES (no AR-PACKAGE wrapper)', () => {
    const elementsUnderPackages = `<?xml version="1.0" encoding="UTF-8"?>
<AR-PACKAGES>
  <ELEMENTS>
    <ECUC-MODULE-DEF>
      <SHORT-NAME>Dcm</SHORT-NAME>
    </ECUC-MODULE-DEF>
  </ELEMENTS>
</AR-PACKAGES>`;
    expect(arxmlModuleShortNames(elementsUnderPackages)).toEqual(['Dcm']);
  });

  it('finds ECUC-MODULE-DEF buried under 3+ levels of nested AR-PACKAGE', () => {
    const deeplyNested = `<?xml version="1.0" encoding="UTF-8"?>
<AR-PACKAGES>
  <AR-PACKAGE>
    <SHORT-NAME>L1</SHORT-NAME>
    <AR-PACKAGES>
      <AR-PACKAGE>
        <SHORT-NAME>L2</SHORT-NAME>
        <AR-PACKAGES>
          <AR-PACKAGE>
            <SHORT-NAME>L3</SHORT-NAME>
            <AR-PACKAGES>
              <AR-PACKAGE>
                <SHORT-NAME>L4</SHORT-NAME>
                <ELEMENTS>
                  <ECUC-MODULE-DEF>
                    <SHORT-NAME>Dcm</SHORT-NAME>
                  </ECUC-MODULE-DEF>
                </ELEMENTS>
              </AR-PACKAGE>
            </AR-PACKAGES>
          </AR-PACKAGE>
        </AR-PACKAGES>
      </AR-PACKAGE>
    </AR-PACKAGES>
  </AR-PACKAGE>
</AR-PACKAGES>`;
    expect(arxmlModuleShortNames(deeplyNested)).toEqual(['Dcm']);
  });
});
