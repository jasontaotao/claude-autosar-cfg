# BSWMD fixtures

Real-world BSW Module Description (BSWMD, schema-side) samples used by the
BSWMD parser round-trip tests under `__tests__/bswmd-roundtrip.test.ts`.

The fixtures are **byte-identical** copies of source files; do not edit or
re-format them in place. If a sample needs to be replaced, drop in the new
file and update the README.

## Fixtures

### `Can_Bswmd.arxml` — EB tresos BSW-MODULE-DESCRIPTION (Dialect 1)

- Source: `D:\claude_proj2\src\S32K148_EAS_EB_3399A\EB_Cfg\simple_demo_rte\output\generated\swcd\Can_Bswmd.arxml`
- Size: 14,367 bytes (247 lines)
- Namespace: `http://autosar.org/schema/r4.0` (`AUTOSAR_4-0-3_STRICT_COMPACT.xsd`)
- Tool: EB tresos (vendor-private schema location; detected as dialect
  `bsw-module-description` by the parser)

Observed by `parseBswmd` on this fixture:

- 1 module: `Can`, path `/AUTOSAR_Can/BswModuleDescriptions/Can`, moduleId `80`
- 0 top-level containers, 0 nested containers (BSW-MODULE-DESCRIPTION
  dialect does not carry the schema-side ECUC container tree)
- 2 `providedEntries` recovered via the EB tresos fallback path
  (entry-ref-only, no wrapper `<SHORT-NAME>`). `entryKind` is captured as
  `BSW-MODULE-ENTRY` from the inner `<BSW-MODULE-ENTRY-REF>` `@_DEST`:
  - `Can_Init` → `/AUTOSAR_Can/BswModuleEntrys/Can_Init`
  - `Can_MainFunction_Mode` → `/AUTOSAR_Can/BswModuleEntrys/Can_MainFunction_Mode`
- 5 non-fatal warnings:
  - 2 × "provided entry omits wrapper <SHORT-NAME>; derived … from
    <BSW-MODULE-ENTRY-REF>" (the fallback case above; the entries are
    returned but the renderer should flag them)
  - 3 × unknown module kinds (`BSW-MODULE-ENTRY` and `BSW-IMPLEMENTATION`
    in sibling packages — value-side / impl-side, out of scope for this
    schema-side parser)

### `Adc_bswmd.arxml` — AUTOSAR standard ECUC-MODULE-DEF (Dialect 2)

- Source: `D:\上位机开发\Autosar-Configurator-1.0.1\Autosar-Configurator-1.0.1\test\bswmd\Adc_bswmd.arxml`
- Size: 81,952 bytes (1,224 lines)
- Namespace: `http://autosar.org/schema/r4.0` (`AUTOSAR_00046.xsd`)
- Tool: AUTOSAR standard ECUC-MODULE-DEF schema

Observed by `parseBswmd` on this fixture:

- 1 module: `Adc`, path `/AUTOSAR_R22/EcucDefs/Adc`, no `moduleId`
- 3 top-level containers:
  - `AdcConfigSet` (1 sub-container: `AdcHwUnit`)
  - `AdcGeneral` (1 sub-container: `AdcPowerStateConfig`; 13 parameters;
    2 references)
  - `AdcPublishedInformation` (3 parameters)
- Recursive totals: 7 containers, 42 parameters, 4 references
- 0 warnings (the AUTOSAR standard sample is self-contained and uses only
  schema-side kinds the parser dispatches).

## Usage

The BSWMD parser Round-trip test uses these as the source of truth. The
tests in `__tests__/bswmd-roundtrip.test.ts` `readFileSync` each fixture,
parse it via `parseBswmd`, and assert dialect/path/moduleId/container
counts/lookup helper results against the numbers above. The numbers in
this README are the same ones the tests check — keep them in sync if a
fixture is replaced.
