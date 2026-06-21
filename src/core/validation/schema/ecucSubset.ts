// ECUC container multiplicity schema (formerly also a param-level subset).
//
// Sprint 17d — the param-level `ECUC_SUBSET_SCHEMA` (46 entries derived
// from 5 fixture ARXMLs) has been retired. Param-level rules now live
// exclusively in the BSWMD-driven `SchemaLayer`; this file retains
// only `ECUC_CONTAINER_SCHEMA` (container multiplicity, used by the
// 5-fixture baseline as a no-layer fallback).
//
//   Det_Det.arxml     — small (1 module, 1 container, 4 boolean + 4 string)
//   WdgIf_WdgIf.arxml — small (1 module, 2 containers, 3 boolean + 3 string + 1 ref)
//   EcuC_EcuC.arxml   — medium (1 module, EcucGeneral enums + ~125 EcucPduCollection Pdu
//                        instances with integer PduLength, boolean UserDefine/PduType,
//                        and 1 foreign reference SysTPduToFrameMappingRef)
//   PduR_PduR.arxml   — medium (1 module, integer handles, boolean module-support flags,
//                        enum src/dest modules, ref to PduRRoutingPath entries)
//   Com_Com.arxml     — large (1 module, ComGeneral, ~67 IPdus with integer handles /
//                        floats for timeouts / enums for direction & processing /
//                        strings for signal init values / refs to groups)

import { lookupContainerSchemaAcrossModuleRoots, type SchemaLayer } from '../runtimeSchema.js';
import type { EcucSchemaEntry, EcucContainerSchemaEntry } from '../types.js';

/**
 * Param-level schema lookup.
 *
 * Layer-only: a `SchemaLayer` is the sole source of truth for param
 * validation rules (range, enum literals, references, required, max
 * length, schema-unknown). The legacy 46-entry `ECUC_SUBSET_SCHEMA`
 * hard-coded fixture fallback has been retired; the unit tests now
 * wire an equivalent layer via `_testSchemaLayer.ts#buildSubsetLikeLayer`.
 *
 * Returns `null` when no layer is supplied or the layer does not
 * catalogue the requested path.
 */
export function lookupSchema(paramPath: string, layer?: SchemaLayer): EcucSchemaEntry | null {
  if (layer === undefined) return null;
  return layer.params.get(paramPath) ?? null;
}

/**
 * ECUC container multiplicity schema for 5 fixtures.
 *
 * Each entry constrains the number of *direct child* containers of the
 * matching type. `upper: 'unbounded'` corresponds to the AUTOSAR `*`
 * (any number) representation.
 *
 * Direct child count is computed by filtering `el.children` for
 * kind === 'container' && shortName === <last path segment>. Nested
 * grandchildren are NOT counted at this level.
 *
 * 5-fixture counts observed (must match exactly to keep baseline 5/5 0-violation):
 *   - Det/DetGeneral                       = 1
 *   - WdgIf/WdgIfGeneral                   = 1
 *   - WdgIf/WdgIfDevice                    = 1
 *   - EcuC/EcucGeneral                     = 1
 *   - EcuC/EcucPduCollection               = 1
 *   - EcuC/EcucPduCollection/Pdu           = 125  (unbounded)
 *   - PduR/PduRGeneral                     = 1
 *   - PduR/PduRBswModules                  = 1
 *   - PduR/PduRRoutingTables               = 1
 *   - PduR/PduRRoutingTables/PduRRoutingTable = N (unbounded; see fixture)
 *   - Com/ComGeneral                       = 1
 *   - Com/ComConfig                        = 1
 *   - Com/ComConfig/ComIPdu                = 67   (unbounded)
 */
export const ECUC_CONTAINER_SCHEMA: readonly EcucContainerSchemaEntry[] = [
  { path: '/EcucDefs/Det/DetGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/WdgIf/WdgIfGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/WdgIf/WdgIfDevice', lower: 0, upper: 1 },
  { path: '/EcucDefs/EcuC/EcucGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/EcuC/EcucPduCollection', lower: 0, upper: 1 },
  { path: '/EcucDefs/EcuC/EcucPduCollection/Pdu', lower: 0, upper: 'unbounded' },
  { path: '/EcucDefs/PduR/PduRGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/PduR/PduRBswModules', lower: 0, upper: 1 },
  { path: '/EcucDefs/PduR/PduRRoutingTables', lower: 0, upper: 1 },
  { path: '/EcucDefs/PduR/PduRRoutingTables/PduRRoutingTable', lower: 0, upper: 'unbounded' },
  { path: '/EcucDefs/Com/ComGeneral', lower: 0, upper: 1 },
  { path: '/EcucDefs/Com/ComConfig', lower: 0, upper: 1 },
  { path: '/EcucDefs/Com/ComConfig/ComIPdu', lower: 0, upper: 'unbounded' },
] as const;

/**
 * Linear-scan lookup for container multiplicity.
 *
 * Layer wins when supplied; on a layer miss the function falls through
 * to the static `ECUC_CONTAINER_SCHEMA` table (used as a no-layer
 * fallback by the 5-fixture baseline).
 *
 * Sprint 17d follow-up — `moduleRoots` (3rd arg, optional): when
 * supplied AND the direct layer lookup misses, the helper runs
 * `lookupContainerSchemaAcrossModuleRoots` to bridge vendor-CDD
 * namespace mismatches (e.g. value-side `/JWQ3399/...` queries
 * against a BSWMD that publishes under `/JWQ_CDD_PACK/JWQ_Packet/
 * JWQ3399/...`). The renderer's `validate.ts#checkContainerMultiplicity`
 * passes `layer.moduleRoots` so the validator's multiplicity check
 * benefits from the same fix as `EnumEditor`'s enum resolution.
 */
export function lookupContainerSchema(
  containerPath: string,
  layer?: SchemaLayer,
  moduleRoots: readonly string[] = [],
): EcucContainerSchemaEntry | null {
  if (layer !== undefined) {
    const fromLayer = layer.containers.get(containerPath);
    if (fromLayer !== undefined) return fromLayer;
    if (moduleRoots.length > 0) {
      const fromCrossRoot = lookupContainerSchemaAcrossModuleRoots(
        containerPath,
        layer,
        moduleRoots,
      );
      if (fromCrossRoot !== null) return fromCrossRoot;
    }
  }
  for (const entry of ECUC_CONTAINER_SCHEMA) {
    if (entry.path === containerPath) return entry;
  }
  return null;
}
