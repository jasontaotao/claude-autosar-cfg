/**
 * DBC mapper shared types + BSWMD-backed value factories.
 *
 * The three factories (`makeParam` / `makeReference` / `makeContainer`) are the
 * only sanctioned way for mappers to create ECUC values: every generated
 * ParamValue must carry its BSWMD `definitionRef` (spec §4.3, "Never create a
 * ParamValue without its BSWMD definitionRef"). Validation failures emit a
 * warning from the §11 closed set, record a field diff with source
 * `Unmapped` / `Error`, and return `undefined` so the caller writes nothing.
 *
 * Design source: docs/superpowers/specs/2026-09-03-dbc-full-import-design.md
 * §4.3 (validation rules) + §7.1 (source markers) + §8.1 (field diff model).
 */

import type { ArxmlContainer, ParamValue } from '../../arxml/types.js';
import type { ParamDef } from '../../project/bswmd/types.js';
import type { DbcImportModule, ModuleBswmdDefIndex, DbcBswmdDefIndex } from '../bswmdDefIndex.js';
import type { Dbm, DbmWarning, DbcWarningCode } from '../dbm.js';
import type { DbcImportProfile } from '../profile.js';

/** 字段级 diff。与 shared `DbcImportFieldDiff` 结构兼容（§8.1）。 */
export interface MapperFieldDiff {
  readonly moduleName: DbcImportModule;
  readonly containerPath: string;
  /** BSWMD definition spine key（§4.2），不是实例路径；UI 显示取最后一段。 */
  readonly paramKey: string;
  readonly local?: string | number | boolean;
  readonly incoming?: string | number | boolean;
  readonly source: 'Auto' | 'Derived' | 'Profile-default' | 'Unmapped' | 'Error';
  readonly warningCodes?: readonly DbcWarningCode[];
}

/** Mapper 的统一返回：生成值 + warning + 字段级 diff。 */
export interface MapperResult<T> {
  readonly value: T;
  readonly warnings: readonly DbmWarning[];
  readonly fieldDiffs: readonly MapperFieldDiff[];
}

/**
 * Mapper 运行上下文。`warnings` / `fieldDiffs` 是可变累积数组：
 * makeParam / makeReference / makeContainer 直接 push，mapper 结束时
 * 打包成 `MapperResult`。
 */
export interface DbcMapperContext {
  readonly dbm: Dbm;
  readonly targetNode: string;
  readonly index: DbcBswmdDefIndex;
  readonly profile: DbcImportProfile;
  readonly warnings: DbmWarning[];
  readonly fieldDiffs: MapperFieldDiff[];
}

/** definitionKey 的容器部分：`ComConfig/ComIPdu/ComIPduDirection` → `ComConfig/ComIPdu`。 */
function containerPart(definitionKey: string): string {
  const slash = definitionKey.lastIndexOf('/');
  return slash === -1 ? definitionKey : definitionKey.slice(0, slash);
}

function recordFieldDiff(
  context: DbcMapperContext,
  moduleName: DbcImportModule,
  definitionKey: string,
  incoming: string | number | boolean | undefined,
  source: MapperFieldDiff['source'],
  warningCode?: DbcWarningCode,
): void {
  context.fieldDiffs.push({
    moduleName,
    containerPath: containerPart(definitionKey),
    paramKey: definitionKey,
    ...(incoming !== undefined && { incoming }),
    source,
    ...(warningCode !== undefined && { warningCodes: [warningCode] }),
  });
}

function emitWarning(
  context: DbcMapperContext,
  code: DbcWarningCode,
  elementRef: string,
  message: string,
): void {
  context.warnings.push({ code, elementRef, message });
}

function moduleIndex(
  context: DbcMapperContext,
  moduleShortName: DbcImportModule,
): ModuleBswmdDefIndex {
  return context.index[moduleShortName];
}

type CoerceResult =
  | { readonly ok: true; readonly value: ParamValue }
  | { readonly ok: false; readonly reason: 'type-mismatch' | 'enum-miss' };

/**
 * 按 BSWMD ParamDef.kind 把 DBC/Profile 值强制为 ParamValue。
 * integer→integer、float→float、boolean→boolean、enumeration→enum、
 * string/function-name→string（§4.3 第 3 条）。
 */
function coerceParamValue(definition: ParamDef, value: string | number | boolean): CoerceResult {
  const definitionRef = definition.path;
  switch (definition.kind) {
    case 'integer':
    case 'float': {
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) return { ok: false, reason: 'type-mismatch' };
      return { ok: true, value: { type: definition.kind, value: num, definitionRef } };
    }
    case 'boolean': {
      if (typeof value === 'boolean') {
        return { ok: true, value: { type: 'boolean', value, definitionRef } };
      }
      if (value === 'true' || value === 'false') {
        return { ok: true, value: { type: 'boolean', value: value === 'true', definitionRef } };
      }
      return { ok: false, reason: 'type-mismatch' };
    }
    case 'enumeration': {
      const literal = String(value);
      if (!definition.enumerationLiterals.includes(literal)) {
        return { ok: false, reason: 'enum-miss' };
      }
      return { ok: true, value: { type: 'enum', value: literal, definitionRef } };
    }
    case 'string':
    case 'function-name':
      return { ok: true, value: { type: 'string', value: String(value), definitionRef } };
  }
}

/**
 * 生成一个带 BSWMD definitionRef 的参数值。校验失败（definition 缺失 /
 * 枚举不命中 / 类型不匹配）时返回 `undefined` 并记录 warning + field diff。
 */
export function makeParam(
  context: DbcMapperContext,
  moduleShortName: DbcImportModule,
  definitionKey: string,
  value: string | number | boolean,
  source: MapperFieldDiff['source'],
): ParamValue | undefined {
  const index = moduleIndex(context, moduleShortName);
  const definition = index.paramDef.get(definitionKey);
  if (!definition) {
    emitWarning(
      context,
      'dbc-bswmd-def-missing',
      definitionKey,
      `BSWMD parameter definition is missing: ${definitionKey}`,
    );
    recordFieldDiff(
      context,
      moduleShortName,
      definitionKey,
      value,
      'Unmapped',
      'dbc-bswmd-def-missing',
    );
    return undefined;
  }
  const coerced = coerceParamValue(definition, value);
  if (!coerced.ok) {
    if (coerced.reason === 'enum-miss') {
      emitWarning(
        context,
        'dbc-enum-unmapped',
        definitionKey,
        `Enumeration literal ${String(value)} is not declared in ${definitionKey}`,
      );
      recordFieldDiff(context, moduleShortName, definitionKey, value, 'Error', 'dbc-enum-unmapped');
    } else {
      emitWarning(
        context,
        'dbc-param-type-mismatch',
        definitionKey,
        `Parameter ${definitionKey} expects ${definition.kind}`,
      );
      recordFieldDiff(
        context,
        moduleShortName,
        definitionKey,
        value,
        'Error',
        'dbc-param-type-mismatch',
      );
    }
    return undefined;
  }
  recordFieldDiff(context, moduleShortName, definitionKey, value, source);
  return coerced.value;
}

/**
 * 生成一个带 BSWMD definitionRef 的 reference 值。definition 缺失时
 * 返回 `undefined` 并记录 warning + field diff。
 */
export function makeReference(
  context: DbcMapperContext,
  moduleShortName: DbcImportModule,
  definitionKey: string,
  value: string,
  source: MapperFieldDiff['source'],
): ParamValue | undefined {
  const index = moduleIndex(context, moduleShortName);
  const definition = index.referenceDef.get(definitionKey);
  if (!definition) {
    emitWarning(
      context,
      'dbc-bswmd-def-missing',
      definitionKey,
      `BSWMD reference definition is missing: ${definitionKey}`,
    );
    recordFieldDiff(
      context,
      moduleShortName,
      definitionKey,
      value,
      'Unmapped',
      'dbc-bswmd-def-missing',
    );
    return undefined;
  }
  recordFieldDiff(context, moduleShortName, definitionKey, value, source);
  // dest 取自 ReferenceDef.destKind：序列化时写 <VALUE-REF DEST="...">（serializer.ts）。
  return { type: 'reference', value, dest: definition.destKind, definitionRef: definition.path };
}

/**
 * 生成一个带 BSWMD definitionRef 的容器。definition 缺失时返回 `undefined`
 * 并记录 warning + field diff；调用方不得部分生成容器。
 */
export function makeContainer(
  context: DbcMapperContext,
  moduleShortName: DbcImportModule,
  containerKey: string,
  shortName: string,
): ArxmlContainer | undefined {
  const index = moduleIndex(context, moduleShortName);
  const definitionRef = index.containerPath.get(containerKey);
  if (!definitionRef) {
    emitWarning(
      context,
      'dbc-bswmd-def-missing',
      containerKey,
      `BSWMD container definition is missing: ${containerKey}`,
    );
    recordFieldDiff(
      context,
      moduleShortName,
      containerKey,
      shortName,
      'Unmapped',
      'dbc-bswmd-def-missing',
    );
    return undefined;
  }
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {},
    children: [],
    definitionRef,
  };
}
