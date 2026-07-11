// core/project/bswmd/parse-ecuc-dialect.ts
// AUTOSAR-standard ECUC-MODULE-DEF dialect builders + container /
// choice / parameter / reference sub-builders.
//
// Split from `src/core/project/bswmd/parse.ts` as part of v1.46.0
// MINOR T5 (file-size backlog closure round-2). The block below is
// moved verbatim from the pre-T5 parse.ts; only the helper imports
// are updated to point at the split sub-files (parse-primitives.js,
// parse-eb-dialect.js, plus local `asArrayLocal`). The internal
// recursion + edge-case comments are kept intact so future readers
// can trace the dialect-specific logic without cross-file hopping.

import { readDesc, readMultiplicityConfigClasses } from './parse-eb-dialect.js';
import {
  readBoolean,
  readLowerMultiplicity,
  readNumber,
  readShortName,
  readUpperMultiplicity,
} from './parse-primitives.js';
import type {
  BswModuleDef,
  ContainerDef,
  DepthGuard,
  ParamDef,
  ParamKind,
  ReferenceDef,
} from './types.js';

// ---------------------------------------------------------------------------
// v1.46.0 MINOR T5 — block extracted verbatim from pre-T5 parse.ts
// (commit 5002e85). Internal imports updated in-place to point at
// the split sub-files; no semantic change.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// AUTOSAR standard ECUC-MODULE-DEF dialect
// ---------------------------------------------------------------------------

export function buildEcucModule(
  item: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
  guard?: DepthGuard,
): BswModuleDef | null {
  const shortName = readShortName(item);
  if (shortName === undefined) return null;
  const path = `${parentPath}/${shortName}`;
  const containersRaw = item['CONTAINERS'];
  const containers: ContainerDef[] = [];
  if (typeof containersRaw === 'object' && containersRaw !== null) {
    containers.push(
      ...buildContainerList(containersRaw as Record<string, unknown>, path, warnings, guard),
    );
  }
  // v1.37.1 PATCH T1 — populate the module-level `<PARAMETERS>` block
  // (sibling of `<CONTAINERS>` inside `<ECUC-MODULE-DEF>`) into
  // `BswModuleDef.parameters`. v1.37.0 MINOR T3 (H2) added the field +
  // the bounded `addParameter` validation gate
  // (`moduleDef.parameters ?? []` at `src/core/arxml/mutation.ts:590`)
  // but `buildEcucModule` never populated it — the gate was a no-op
  // in production because the parser silently dropped module-level
  // `<PARAMETERS>`. This branch reuses the existing `buildParamList`
  // helper (which already dispatches across all 5 supported
  // `ECUC-XXX-PARAM-DEF` tags via `paramKindFromTag`) so a module-level
  // parameter and a child-container parameter produce equivalent
  // `ParamDef` shapes.
  //
  // Back-compat: when the BSWMD omits `<PARAMETERS>`, the array is
  // initialised to `[]` so the field is ALWAYS defined on the returned
  // `BswModuleDef`. Consumers must treat `undefined` and `[]`
  // equivalently (use `?? []`); the v1.37.0 mutation.ts H2 gate
  // already does this at `mutation.ts:590`. Real fixtures in
  // `samples/arxml/AUTOSAR_MOD_ECUConfigurationParameters.arxml` (100
  // modules scanned) declare module-level `<PARAMETERS>` on 0
  // modules — so no existing test or fixture is perturbed; the
  // `length > 0` guard in `addParameter` remains a no-op for
  // pre-v1.37.1 fixtures and un-binds cleanly in a follow-up T3
  // dispatch when paired with this change.
  const parameters: ParamDef[] = [];
  const paramsRaw = item['PARAMETERS'];
  if (typeof paramsRaw === 'object' && paramsRaw !== null) {
    parameters.push(...buildParamList(paramsRaw as Record<string, unknown>, path, warnings));
  }
  // v1.37.1 PATCH T2 — populate the module-level `<REFERENCES>` block
  // (sibling of `<PARAMETERS>` and `<CONTAINERS>` inside
  // `<ECUC-MODULE-DEF>`) into `BswModuleDef.references`. v1.37.0 MINOR
  // T3 (H2) added the field + the bounded `addReference` validation
  // gate (`moduleDef.references ?? []` at
  // `src/core/arxml/mutation.ts:752`) but `buildEcucModule` never
  // populated it — the gate was a no-op in production because the
  // parser silently dropped module-level `<REFERENCES>`. This branch
  // reuses the existing `buildRefList` helper (which already
  // dispatches across all 3 supported `ECUC-XXX-REFERENCE-DEF` tags
  // — `ECUC-REFERENCE-DEF` / `ECUC-FOREIGN-REFERENCE-DEF` /
  // `ECUC-CHOICE-REFERENCE-DEF`) so a module-level reference and a
  // child-container reference produce equivalent `ReferenceDef`
  // shapes — the precondition `mutation.ts:753`
  // (`moduleRefs.some((r) => r.shortName === refDef.shortName)`)
  // requires for the gate to fire.
  //
  // Back-compat: when the BSWMD omits `<REFERENCES>`, the array is
  // initialised to `[]` so the field is ALWAYS defined on the
  // returned `BswModuleDef`. Consumers must treat `undefined` and
  // `[]` equivalently (use `?? []`); the v1.37.0 mutation.ts H2 gate
  // already does this at `mutation.ts:752`. Real fixtures in
  // `samples/arxml/AUTOSAR_MOD_ECUConfigurationParameters.arxml`
  // declare module-level `<REFERENCES>` on 0 modules — so no
  // existing test or fixture is perturbed; the `length > 0` guard
  // in `addReference` remains a no-op for pre-v1.37.1 fixtures and
  // un-binds cleanly in a follow-up T3 dispatch when paired with this
  // change. Mirrors the T1 `<PARAMETERS>` extraction contract
  // for symmetry.
  const references: ReferenceDef[] = [];
  const refsRaw = item['REFERENCES'];
  if (typeof refsRaw === 'object' && refsRaw !== null) {
    references.push(...buildRefList(refsRaw as Record<string, unknown>, path));
  }
  // v1.14.1 PATCH-G (G1) — extract <HEADER><SHORT-NAME> and
  // <STD-INCLUDES>/<STD-INCLUDE>/<SHORT-NAME>. fast-xml-parser
  // collapses single child to a string and multiple children to
  // an array; `asArrayLocal` normalizes both.
  const headerRaw = asArrayLocal<Record<string, unknown>>(item['HEADER'])[0];
  const moduleHeader = headerRaw ? readShortName(headerRaw) : undefined;
  const stdIncludesEl = asArrayLocal<Record<string, unknown>>(item['STD-INCLUDES'])[0];
  // v1.14.2 PATCH-H (H1) — empty `<STD-INCLUDE><SHORT-NAME>` is kept
  // as `''` in `includes[]` so the SEC3 validator
  // (`validateModuleHeaderPaths` in `core/generator/modules/_shared.ts`)
  // can push `BSW-SEC-003` for it. The v1.14.1 PATCH-G string warning
  // is removed — the validator owns the channel now and exposes the
  // strict-mode upgrade path the v1.14.1 spec promised (line 168:
  // "`strict: true` (CLI flag) promotes `BSW-SEC-003` from WARN →
  // ERROR"). The shape change is additive for callers that filter
  // falsy entries (the H2 `buildSelfIncludes` helper does so
  // explicitly) and a 1-line `inc === ''` branch in the validator.
  const includes: string[] = stdIncludesEl
    ? asArrayLocal<Record<string, unknown>>(stdIncludesEl['STD-INCLUDE']).flatMap((si) => {
        const name = readShortName(si);
        return name === undefined ? [''] : [name];
      })
    : [];
  return {
    shortName,
    path,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    parameters,
    references,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
    multiplicityConfigClasses: readMultiplicityConfigClasses(item),
    moduleHeader,
    includes,
  };
}

export function buildContainerList(
  node: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
  guard?: DepthGuard,
): ContainerDef[] {
  const out: ContainerDef[] = [];
  // Sprint 13+ Q6 — per-parent duplicate container detection. A
  // module / container with two `<ECUC-PARAM-CONF-CONTAINER-DEF>`
  // sharing the same `<SHORT-NAME>` is a schema conflict; the second
  // copy gets retained (existing behaviour) but flagged.
  const seenContainerShortNames = new Set<string>();
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    for (const item of asArrayLocal<Record<string, unknown>>(raw)) {
      if (tagName === 'ECUC-PARAM-CONF-CONTAINER-DEF') {
        const c = buildContainer(item, parentPath, warnings, guard);
        if (seenContainerShortNames.has(c.shortName) && warnings !== undefined) {
          warnings.push(
            `Duplicate container definition "${c.shortName}" at ${c.path} — first-wins, later copy retained but shadowed by the first lookup`,
          );
        }
        seenContainerShortNames.add(c.shortName);
        out.push(c);
        continue;
      }
      if (tagName === 'ECUC-CHOICE-ORIENTED-STRUCTURE-DEF') {
        out.push(buildChoiceContainer(item, parentPath, warnings, guard));
        continue;
      }
      // Bug — Vector/EB tresos dialect BSWMDs use the shorter
      // `ECUC-CHOICE-CONTAINER-DEF` tag for choice containers instead
      // of the AUTOSAR-standard `ECUC-CHOICE-ORIENTED-STRUCTURE-DEF`.
      // Both have an identical `<CHOICES>` block of nested
      // `ECUC-PARAM-CONF-CONTAINER-DEF` branches, so the same builder
      // handles either tag. Before this branch was added the parser
      // fell through to the "Unknown container kind" warning and the
      // choice subtree was silently dropped — user-reported as
      // "JWQ3399SpiConfig comes back empty even though BSWMD
      // declares CommonContainer and ChoiceContainer".
      if (tagName === 'ECUC-CHOICE-CONTAINER-DEF') {
        out.push(buildChoiceContainer(item, parentPath, warnings, guard));
        continue;
      }
      // Unknown inner container kind — surface as a non-fatal warning so
      // the project panel can flag the file without aborting the whole parse.
      if (warnings !== undefined) {
        warnings.push(`Unknown container kind '${tagName}' at ${parentPath}`);
      }
    }
  }
  return out;
}

/**
 * Maximum allowed container-nesting depth. Generous enough to cover any
 * real AUTOSAR schema (typically < 20 levels even for deeply-nested
 * modules like EcuC) but small enough to short-circuit pathological
 * BSWMDs that would otherwise blow the V8 call stack.
 *
 * Sprint 13 Stage 5.D — defensive limit. Tripping the limit produces
 * an `invalid-structure` `BswmdError` so the renderer can show a clean
 * message ("Container nesting depth exceeds 64") instead of crashing
 * the main process.
 */
export const MAX_CONTAINER_DEPTH = 64;

export function buildContainer(
  item: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
  guard?: DepthGuard,
): ContainerDef {
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  // Increment depth at the start of each container build. If we've
  // crossed the cap, set the guard's error and return a stub so the
  // recursion can unwind without further work. The parseBswmd caller
  // will see the error and surface it as a fatal Result.
  if (guard !== undefined) {
    guard.depth += 1;
    if (guard.depth > MAX_CONTAINER_DEPTH) {
      if (guard.error === null) {
        guard.error = {
          kind: 'invalid-structure',
          path,
          message: `Container nesting depth exceeds ${MAX_CONTAINER_DEPTH} (path: ${path})`,
        };
      }
      return {
        shortName,
        path,
        lowerMultiplicity: readLowerMultiplicity(item),
        upperMultiplicity: readUpperMultiplicity(item),
        subContainers: [],
        parameters: [],
        references: [],
        choices: [],
        desc: readDesc(item),
        multiplicityConfigClasses: readMultiplicityConfigClasses(item),
      };
    }
  }
  const subContainers: ContainerDef[] = [];
  // v1.23.0 T3 fix — read BOTH `<CONTAINERS>` and `<SUB-CONTAINERS>`
  // so BSWMD sub-container children wrapped in either form surface as
  // siblings of the parent. Mirrors the v1.23.0 T2 fix in
  // `src/core/arxml/parser.ts:418-433` (which solved the same bug for
  // value-side ARXMLs). Real OEM demo-ecu BSWMDs (Vector-style
  // `<CONTAINERS>` shorthand) wrap children directly inside
  // `<CONTAINERS>` rather than the longer-form `<SUB-CONTAINERS>`;
  // the prior code only read `<SUB-CONTAINERS>`, leaving
  // `parent.subContainers` empty and silently breaking
  // `findParentContainerDef` in `applyPatchSteps.ts:703-714` (the
  // bridge's BSWMD-driven child-def lookup).
  const containersRaw = item['CONTAINERS'];
  if (typeof containersRaw === 'object' && containersRaw !== null) {
    subContainers.push(
      ...buildContainerList(containersRaw as Record<string, unknown>, path, warnings, guard),
    );
  }
  const subRaw = item['SUB-CONTAINERS'];
  if (typeof subRaw === 'object' && subRaw !== null) {
    subContainers.push(
      ...buildContainerList(subRaw as Record<string, unknown>, path, warnings, guard),
    );
  }
  const parameters: ParamDef[] = [];
  const paramsRaw = item['PARAMETERS'];
  if (typeof paramsRaw === 'object' && paramsRaw !== null) {
    parameters.push(...buildParamList(paramsRaw as Record<string, unknown>, path, warnings));
  }
  const references: ReferenceDef[] = [];
  const refsRaw = item['REFERENCES'];
  if (typeof refsRaw === 'object' && refsRaw !== null) {
    references.push(...buildRefList(refsRaw as Record<string, unknown>, path));
  }
  const result: ContainerDef = {
    shortName,
    path,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
    subContainers,
    parameters,
    references,
    choices: [],
    desc: readDesc(item),
    multiplicityConfigClasses: readMultiplicityConfigClasses(item),
  };
  if (guard !== undefined) {
    guard.depth -= 1;
  }
  return result;
}

export function buildChoiceContainer(
  item: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
  guard?: DepthGuard,
): ContainerDef {
  // ECUC-CHOICE-ORIENTED-STRUCTURE-DEF is structurally a container with
  // a `<CHOICES>` block of nested ECUC-PARAM-CONF-CONTAINER-DEF. We surface
  // the choices as a separate `choices` field on the same ContainerDef so
  // the lookup helpers can find them; `subContainers` stays empty because
  // choice branches are not nested sub-containers in the ECUC sense.
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  // Choice containers count toward the depth limit too: a deeply-nested
  // CHOICES tree is the same SOF risk as a deeply-nested SUB-CONTAINERS.
  if (guard !== undefined) {
    guard.depth += 1;
    if (guard.depth > MAX_CONTAINER_DEPTH) {
      if (guard.error === null) {
        guard.error = {
          kind: 'invalid-structure',
          path,
          message: `Container nesting depth exceeds ${MAX_CONTAINER_DEPTH} (path: ${path})`,
        };
      }
      return {
        shortName,
        path,
        lowerMultiplicity: readLowerMultiplicity(item),
        upperMultiplicity: readUpperMultiplicity(item),
        subContainers: [],
        parameters: [],
        references: [],
        choices: [],
        desc: readDesc(item),
        multiplicityConfigClasses: readMultiplicityConfigClasses(item),
      };
    }
  }
  const choicesRaw = item['CHOICES'];
  const choices: ContainerDef[] = [];
  if (typeof choicesRaw === 'object' && choicesRaw !== null) {
    choices.push(
      ...buildContainerList(choicesRaw as Record<string, unknown>, path, warnings, guard),
    );
  }
  const result: ContainerDef = {
    shortName,
    path,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
    subContainers: [],
    parameters: [],
    references: [],
    choices,
    desc: readDesc(item),
    multiplicityConfigClasses: readMultiplicityConfigClasses(item),
  };
  if (guard !== undefined) {
    guard.depth -= 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export function buildParamList(
  node: Record<string, unknown>,
  parentPath: string,
  warnings?: string[],
): ParamDef[] {
  const out: ParamDef[] = [];
  // Sprint 13+ Q6 — per-container duplicate parameter detection.
  const seenParamShortNames = new Set<string>();
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    const kind = paramKindFromTag(tagName);
    if (kind === null) continue;
    for (const item of asArrayLocal<Record<string, unknown>>(raw)) {
      const p = buildParam(item, parentPath, kind);
      if (seenParamShortNames.has(p.shortName) && warnings !== undefined) {
        warnings.push(
          `Duplicate parameter "${p.shortName}" at ${parentPath}/${p.shortName} — first-wins, later copy retained but shadowed by the first lookup`,
        );
      }
      seenParamShortNames.add(p.shortName);
      out.push(p);
    }
  }
  return out;
}

export function paramKindFromTag(tag: string): ParamKind | null {
  switch (tag) {
    case 'ECUC-INTEGER-PARAM-DEF':
      return 'integer';
    case 'ECUC-BOOLEAN-PARAM-DEF':
      return 'boolean';
    case 'ECUC-ENUMERATION-PARAM-DEF':
      return 'enumeration';
    case 'ECUC-FLOAT-PARAM-DEF':
      return 'float';
    case 'ECUC-STRING-PARAM-DEF':
      return 'string';
    case 'ECUC-FUNCTION-NAME-DEF':
      return 'function-name';
    default:
      return null;
  }
}

export function buildParam(
  item: Record<string, unknown>,
  parentPath: string,
  kind: ParamKind,
): ParamDef {
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  const minValue = kind === 'integer' || kind === 'float' ? readNumber(item['MIN']) : null;
  const maxValue = kind === 'integer' || kind === 'float' ? readNumber(item['MAX']) : null;
  // `function-name` shares `string`'s length constraints per AUTOSAR TPS —
  // symbol names are bounded strings — so apply the same MIN/MAX-LENGTH.
  const minLength =
    kind === 'string' || kind === 'function-name' ? readNumber(item['MIN-LENGTH']) : null;
  const maxLength =
    kind === 'string' || kind === 'function-name' ? readNumber(item['MAX-LENGTH']) : null;
  const enumerationLiterals = kind === 'enumeration' ? readEnumerationLiterals(item) : [];
  const defaultValue = readDefaultValue(item, kind);
  return {
    shortName,
    path,
    kind,
    defaultValue,
    minValue,
    maxValue,
    minLength,
    maxLength,
    enumerationLiterals,
    desc: readDesc(item),
  };
}

export function readEnumerationLiterals(item: Record<string, unknown>): readonly string[] {
  const literals = item['LITERALS'];
  if (typeof literals !== 'object' || literals === null) return [];
  const out: string[] = [];
  for (const lit of asArrayLocal<Record<string, unknown>>(
    (literals as Record<string, unknown>)['ECUC-ENUMERATION-LITERAL-DEF'],
  )) {
    const name = readShortName(lit);
    if (name !== undefined) out.push(name);
  }
  return out;
}

export function readDefaultValue(
  item: Record<string, unknown>,
  kind: ParamKind,
): string | number | boolean | null {
  const raw = item['DEFAULT-VALUE'];
  switch (kind) {
    case 'integer': {
      const n = readNumber(raw);
      return n === null ? null : Math.trunc(n);
    }
    case 'float': {
      const n = readNumber(raw);
      return n;
    }
    case 'boolean': {
      const b = readBoolean(raw);
      return b;
    }
    case 'enumeration':
    case 'string':
    case 'function-name':
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
      return null;
  }
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function buildRefList(node: Record<string, unknown>, parentPath: string): ReferenceDef[] {
  const out: ReferenceDef[] = [];
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    // Bug — `ECUC-CHOICE-REFERENCE-DEF` is the standard AUTOSAR way
    // to declare a reference whose target can be any of several
    // alternative container kinds (e.g. CanIf / Arti / Com picking
    // between different `DESTINATION-REF`s). Vector / EB tresos
    // BSWMDs use it ~80 times across the canonical ECUConfiguration
    // fixture (see samples/arxml/AUTOSAR_MOD_ECUConfigurationParameters.arxml
    // — CanIf/Arti/Com all carry these). Before this branch was
    // added the parser silently skipped the entire `<REFERENCES>`
    // block on any container that mixed choice references with plain
    // ones — the user could not add the reference via the picker
    // and the validator's DEST_KIND_MAP had no entry.
    //
    // The destKind field falls back to the tagName itself when
    // `<DESTINATION-REF>` is absent, mirroring the plain-reference
    // default. A future task may parse the multi-target
    // `<DESTINATION-REFS>` block for round-trip fidelity — see
    // validate.ts:DEST_KIND_MAP for the downstream consumer.
    if (
      tagName !== 'ECUC-REFERENCE-DEF' &&
      tagName !== 'ECUC-FOREIGN-REFERENCE-DEF' &&
      tagName !== 'ECUC-CHOICE-REFERENCE-DEF'
    ) {
      continue;
    }
    for (const item of asArrayLocal<Record<string, unknown>>(raw)) {
      out.push(buildRef(item, parentPath, tagName));
    }
  }
  return out;
}

export function buildRef(
  item: Record<string, unknown>,
  parentPath: string,
  tagName: string,
): ReferenceDef {
  const shortName = readShortName(item) ?? '<unnamed>';
  const path = `${parentPath}/${shortName}`;
  const dest = item['DESTINATION-REF'];
  let destKind = tagName;
  if (typeof dest === 'object' && dest !== null) {
    const d = (dest as Record<string, unknown>)['@_DEST'];
    if (typeof d === 'string') destKind = d;
  }
  return {
    shortName,
    path,
    destKind,
    lowerMultiplicity: readLowerMultiplicity(item),
    upperMultiplicity: readUpperMultiplicity(item),
  };
}

// ---------------------------------------------------------------------------
// Default-value validation (called by parseBswmd after walkPackagesForModules)

// ---------------------------------------------------------------------------
// Internal helpers (scoped to this file; not re-exported via index.ts)
// ---------------------------------------------------------------------------

/**
 * Local copy of `asArray` — same approach as `parse-eb-dialect.ts`.
 * Once the file-split lands fully, a shared `helpers/array.ts` utility
 * can host this; until then, duplication is cheaper than the import
 * cycle.
 */
function asArrayLocal<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null) return [];
  return [v as T];
}
