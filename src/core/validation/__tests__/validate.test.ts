// Unit tests for validate(). Constructs minimal ArxmlDocument literals —
// no fixtures, no fs. Each test exercises a single rule against a real
// schema entry from ECUC_SUBSET_SCHEMA so future schema edits surface
// as test failures with full diagnostic context.

import { describe, it, expect } from 'vitest';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ArxmlReference,
  ParamValue,
} from '../../arxml/types.js';
import { validate } from '../validate.js';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

const PKG_PATH = '/EcucDefs';

function makeDoc(...elements: readonly ArxmlElement[]): ArxmlDocument {
  const pkg: ArxmlPackage = {
    shortName: 'EcucDefs',
    path: PKG_PATH,
    elements,
  };
  return { path: '', version: '4.6', packages: [pkg] };
}

function makeContainer(
  shortName: string,
  params: Readonly<Record<string, ParamValue>>,
  children: readonly ArxmlElement[] = [],
): ArxmlContainer {
  return { kind: 'container', tagName: 'ECUC-CONTAINER-VALUE', shortName, params, children };
}

function makeModule(
  shortName: string,
  params: Readonly<Record<string, ParamValue>>,
  children: readonly ArxmlElement[] = [],
): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params,
    children,
    references: [],
  };
}

function makeReference(shortName: string, value: string, dest: string | undefined): ArxmlReference {
  return {
    kind: 'reference',
    tagName: 'DEFINITION-REF',
    shortName,
    value,
    ...(dest !== undefined ? { dest } : {}),
  };
}

const intVal = (n: number): ParamValue => ({ type: 'integer', value: n });
const floatVal = (n: number): ParamValue => ({ type: 'float', value: n });
const enumVal = (s: string): ParamValue => ({ type: 'enum', value: s });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validate()', () => {
  it('returns 0 errors for an empty document', () => {
    const doc = makeDoc();
    expect(validate(doc)).toEqual([]);
  });

  it('returns 0 errors for a param not covered by the schema', () => {
    // /EcucDefs/EcuC/EcucGeneral/FooBar is unconstrained — schema is silent.
    const eucC = makeModule('EcuC', {}, [
      makeContainer('EcucGeneral', { FooBar: intVal(999) }, []),
    ]);
    const doc = makeDoc(eucC);
    expect(validate(doc)).toEqual([]);
  });

  it('emits a range error when integer is below schema min', () => {
    // EcuC/EcucPduCollection/Pdu/PduLength is integer 0..64
    const pdu = makeContainer('Pdu', { PduLength: intVal(-1) }, []);
    const collection = makeContainer('EcucPduCollection', {}, [pdu]);
    const eucC = makeModule('EcuC', {}, [collection]);
    const doc = makeDoc(eucC);

    const errors = validate(doc);
    expect(errors).toHaveLength(1);
    const e = errors[0]!;
    expect(e.kind).toBe('range');
    expect(e.path).toBe('/EcucDefs/EcuC/EcucPduCollection/Pdu/PduLength');
    expect(e.paramKey).toBe('PduLength');
    expect(e.expected).toBe('>= 0');
    expect(e.actual).toBe('-1');
    expect(e.message).toMatch(/below min 0/);
  });

  it('emits a range error when integer is above schema max', () => {
    const pdu = makeContainer('Pdu', { PduLength: intVal(65) }, []);
    const collection = makeContainer('EcucPduCollection', {}, [pdu]);
    const eucC = makeModule('EcuC', {}, [collection]);
    const doc = makeDoc(eucC);

    const errors = validate(doc);
    expect(errors).toHaveLength(1);
    const e = errors[0]!;
    expect(e.kind).toBe('range');
    expect(e.expected).toBe('<= 64');
    expect(e.actual).toBe('65');
  });

  it('returns 0 errors when integer is within range', () => {
    const pdu = makeContainer('Pdu', { PduLength: intVal(8) }, []);
    const collection = makeContainer('EcucPduCollection', {}, [pdu]);
    const eucC = makeModule('EcuC', {}, [collection]);
    const doc = makeDoc(eucC);
    expect(validate(doc)).toEqual([]);
  });

  it('emits a range error when float is below min', () => {
    // Com/ComConfig/ComIPdu/ComTxIPdu/ComMinimumDelayTime is float 0..65.535
    const txPdu = makeContainer('ComTxIPdu', { ComMinimumDelayTime: floatVal(-0.1) }, []);
    const ipdu = makeContainer('ComIPdu', {}, [txPdu]);
    const config = makeContainer('ComConfig', {}, [ipdu]);
    const com = makeModule('Com', {}, [config]);
    const doc = makeDoc(com);

    const errors = validate(doc);
    expect(errors).toHaveLength(1);
    const e = errors[0]!;
    expect(e.kind).toBe('range');
    expect(e.path).toBe('/EcucDefs/Com/ComConfig/ComIPdu/ComTxIPdu/ComMinimumDelayTime');
    expect(e.expected).toBe('>= 0');
    expect(e.actual).toBe('-0.1');
  });

  it('emits a range error when float is above max', () => {
    const txPdu = makeContainer('ComTxIPdu', { ComMinimumDelayTime: floatVal(100.5) }, []);
    const ipdu = makeContainer('ComIPdu', {}, [txPdu]);
    const config = makeContainer('ComConfig', {}, [ipdu]);
    const com = makeModule('Com', {}, [config]);
    const doc = makeDoc(com);

    const errors = validate(doc);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe('range');
    expect(errors[0]!.expected).toBe('<= 65.535');
  });

  it('emits an enum error when value is not in literals', () => {
    // EcuC/EcucGeneral/BitOrder is enumeration, only LSB is allowed
    const general = makeContainer('EcucGeneral', { BitOrder: enumVal('MSB') }, []);
    const eucC = makeModule('EcuC', {}, [general]);
    const doc = makeDoc(eucC);

    const errors = validate(doc);
    expect(errors).toHaveLength(1);
    const e = errors[0]!;
    expect(e.kind).toBe('enum');
    expect(e.expected).toBe('LSB');
    expect(e.actual).toBe('MSB');
  });

  it('returns 0 errors when enum value is in literals', () => {
    const general = makeContainer('EcucGeneral', { BitOrder: enumVal('LSB') }, []);
    const eucC = makeModule('EcuC', {}, [general]);
    const doc = makeDoc(eucC);
    expect(validate(doc)).toEqual([]);
  });

  it('emits a reference error when DEST attribute mismatches', () => {
    // WdgIf/WdgIfDevice/WdgIfDriverRef is reference, refDest='ECUC-CONTAINER-VALUE'
    const device = makeContainer(
      'WdgIfDevice',
      {
        WdgIfDeviceIndex: intVal(0),
        WdgSetModeName: enumVal('WdgSetMode'),
      },
      [makeReference('WdgIfDriverRef', '/path/to/target', 'ECUC-PARAM-CONF-CONTAINER')],
    );
    const wdg = makeModule('WdgIf', {}, [device]);
    const doc = makeDoc(wdg);

    const errors = validate(doc);
    // Note: the reference's shortName+value forms its path; lookup by
    // `${parent}/WdgIfDriverRef` matches the schema entry.
    const refErr = errors.find((e) => e.kind === 'reference');
    expect(refErr).toBeDefined();
    expect(refErr!.path).toBe('/EcucDefs/WdgIf/WdgIfDevice/WdgIfDriverRef');
    expect(refErr!.expected).toBe('ECUC-CONTAINER-VALUE');
    expect(refErr!.actual).toBe('ECUC-PARAM-CONF-CONTAINER');
  });

  it('emits a schema error when param type mismatches schema expectation', () => {
    // PduLength is integer in schema; supply a string.
    const pdu = makeContainer(
      'Pdu',
      { PduLength: { type: 'string', value: 'oops' } as ParamValue },
      [],
    );
    const collection = makeContainer('EcucPduCollection', {}, [pdu]);
    const eucC = makeModule('EcuC', {}, [collection]);
    const doc = makeDoc(eucC);

    const errors = validate(doc);
    expect(errors).toHaveLength(1);
    const e = errors[0]!;
    expect(e.kind).toBe('schema');
    expect(e.expected).toBe('integer');
    expect(e.actual).toBe('string');
    expect(e.message).toMatch(/Type mismatch/);
  });

  it('walks nested 3-level containers and validates every constrained param', () => {
    // Det module with 3 levels of nesting, exercising all rule types:
    //   - integer VersionCheck at level 2 (in range, OK)
    //   - integer DetDebugLoop at level 2 (out of range → range error)
    //   - enum BitOrder at /EcucDefs/EcuC/EcucGeneral (mismatch → enum error)
    //   - reference DEST at level 3 (path not in schema → silently skipped)
    // No errors for the OK ones, errors for the rest.
    const level3 = makeContainer(
      'DetVersion',
      {
        // No schema entry for /EcucDefs/Det/DetGeneral/DetVersion/* — all params here
        // are unconstrained and skipped by validate().
        FooBar: enumVal('Baz'),
      },
      [makeReference('DriverRef', '/path', 'WRONG-DEST')],
    );
    const level2 = makeContainer(
      'DetGeneral',
      {
        VersionCheck: intVal(1), // integer 0..1, in range — no error
        DetDebugLoop: intVal(7), // integer 0..1, out of range — range error
      },
      [level3],
    );
    // EcuC/EcucGeneral/BitOrder lives at /EcucDefs/EcuC/EcucGeneral — attach a
    // sibling EcuC module so the enum mismatch error surfaces in this test.
    const ecucGeneral = makeContainer('EcucGeneral', { BitOrder: enumVal('MSB') }, []);
    const eucC = makeModule('EcuC', {}, [ecucGeneral]);
    const det = makeModule('Det', {}, [level2]);
    const doc = makeDoc(det, eucC);

    const errors = validate(doc);

    // DetDebugLoop (integer) at level 2 — schema says 0..1, value 7 → range error
    const rangeErr = errors.find((e) => e.path.endsWith('/DetDebugLoop'));
    expect(rangeErr).toBeDefined();
    expect(rangeErr!.kind).toBe('range');
    expect(rangeErr!.expected).toBe('<= 1');
    expect(rangeErr!.actual).toBe('7');

    // BitOrder (enum) at /EcucDefs/EcuC/EcucGeneral — schema says LSB
    const enumErr = errors.find((e) => e.path.endsWith('/BitOrder'));
    expect(enumErr).toBeDefined();
    expect(enumErr!.kind).toBe('enum');
    expect(enumErr!.actual).toBe('MSB');

    // VersionCheck (integer) at level 2 — schema entry present, in range → no error
    // DriverRef path is not in the schema → silently skipped (intentional).

    const refErrors = errors.filter((e) => e.kind === 'reference');
    expect(refErrors).toHaveLength(0);

    // Total: range + enum = 2 errors. Verify no other kinds slipped in.
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.kind === 'range' || e.kind === 'enum')).toBe(true);
  });

  it('produces no errors for a fully-valid nested module', () => {
    // Build a Com/ComConfig/ComIPdu/ComTxIPdu tree that satisfies the
    // schema entry for ComMinimumDelayTime (float 0..65.535) and
    // ComTxModeRepetitionPeriod. Validates that the walker does not
    // miss the deep path.
    // Need ComTxModeRepetitionPeriod nested inside ComTxModeTrue/ComTxMode
    // (per schema path).
    const txMode = makeContainer(
      'ComTxMode',
      {
        ComTxModeMode: enumVal('PERIODIC'),
        ComTxModeRepetitionPeriod: floatVal(0.05),
      },
      [],
    );
    const txModeTrue = makeContainer('ComTxModeTrue', {}, [txMode]);
    const txPdu = makeContainer(
      'ComTxIPdu',
      {
        ComMinimumDelayTime: floatVal(0.01),
        ComTxIPduClearUpdateBit: enumVal('Confirmation'),
      },
      [txModeTrue],
    );
    const ipdu = makeContainer('ComIPdu', {}, [txPdu]);
    const config = makeContainer('ComConfig', {}, [ipdu]);
    const com = makeModule('Com', {}, [config]);
    const doc = makeDoc(com);
    expect(validate(doc)).toEqual([]);
  });
});
