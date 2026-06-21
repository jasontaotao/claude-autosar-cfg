// src/renderer/onboarding/DemoEcuManifest.ts
// v1.6.0 W — Demo ECU manifest schema + parser.
//
// 设计要点 (locked W spec §3.4.1):
//   - 4 required fields: manifestVersion, bswmds, valueArxmls, intentionalViolations
//   - manifestVersion MUST be '1' (no silent default — reject unknown versions)
//   - 全部路径都是相对路径 (relative to manifest's containing directory)
//   - 拒绝绝对路径 / parent traversal (..) / parent escape
//   - bswmds / valueArxmls 内部去重 (preserve insertion order)
//   - intentionalViolations[].path 与 G 校验器 path 字面匹配
//   - Performance: ≤ 50 ms 解析 ~1 KB 清单
//
// This module is the canonical SoT shared with A+C CLI per W spec §3.4.1
// + H2 lock: A+C imports `parseDemoEcuManifest` verbatim from this path
// when reading the bundled Demo ECU via `autosarcfg read --project ...`.
//
// 业务注释中文, 技术 API 注释英文

/**
 * Canonical relative path to the bundled Demo ECU manifest. Lives in
 * the package `extraResources` so the production binary ships it next
 * to the app; in dev / tests the same path is resolved relative to
 * the repo root.
 */
export const DEMO_ECU_MANIFEST_RELATIVE_PATH =
  'samples/arxml/demo-ecu/demo.autosarcfg.json';

/**
 * Canonical Demo ECU manifest shape. Schema version `1` is locked for
 * v1.6.0; future schema bumps land as `manifestVersion: '2'` with a
 * migration path (no silent default).
 */
export interface DemoEcuManifestFile {
  readonly manifestVersion: '1';
  readonly bswmds: ReadonlyArray<string>;
  readonly valueArxmls: ReadonlyArray<string>;
  readonly intentionalViolations: ReadonlyArray<{
    readonly ruleId: string;
    readonly path: string;
  }>;
}

/**
 * Parse + validate a Demo ECU manifest from a JSON string.
 *
 * @throws Error when:
 *   - JSON is malformed
 *   - `manifestVersion` is missing or not `'1'`
 *   - `bswmds` / `valueArxmls` / `intentionalViolations` are missing
 *   - Any path is absolute (starts with `/` or `<drive>:\`)
 *   - Any path traverses the parent directory (`..` segment)
 */
export function parseDemoEcuManifest(raw: string): DemoEcuManifestFile {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('manifest: top-level must be an object');
  }

  const manifestVersion = parsed['manifestVersion'];
  if (manifestVersion !== '1') {
    throw new Error(
      `manifest: manifestVersion must be '1' (received ${JSON.stringify(manifestVersion)})`,
    );
  }

  const bswmdsRaw = parsed['bswmds'];
  if (!Array.isArray(bswmdsRaw)) {
    throw new Error('manifest: bswmds must be an array');
  }
  const bswmds = dedupePaths(bswmdsRaw.map(String).map(validateRelativePath));

  const valueArxmlsRaw = parsed['valueArxmls'];
  if (!Array.isArray(valueArxmlsRaw)) {
    throw new Error('manifest: valueArxmls must be an array');
  }
  const valueArxmls = dedupePaths(
    valueArxmlsRaw.map(String).map(validateRelativePath),
  );

  const ivRaw = parsed['intentionalViolations'];
  if (!Array.isArray(ivRaw)) {
    throw new Error('manifest: intentionalViolations must be an array');
  }
  const intentionalViolations = ivRaw.map((entry, i) => {
    if (!isRecord(entry)) {
      throw new Error(`manifest: intentionalViolations[${i}] must be an object`);
    }
    const ruleId = entry['ruleId'];
    const path = entry['path'];
    if (typeof ruleId !== 'string' || ruleId.length === 0) {
      throw new Error(`manifest: intentionalViolations[${i}].ruleId must be a non-empty string`);
    }
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(`manifest: intentionalViolations[${i}].path must be a non-empty string`);
    }
    return { ruleId, path };
  });

  return {
    manifestVersion: '1',
    bswmds,
    valueArxmls,
    intentionalViolations,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRelativePath(p: string): string {
  // Reject absolute paths (POSIX `/...` and Windows `<drive>:\...`).
  if (p.startsWith('/')) {
    throw new Error(`manifest: absolute paths rejected (got ${JSON.stringify(p)})`);
  }
  if (/^[a-zA-Z]:[\\/]/.test(p)) {
    throw new Error(`manifest: absolute Windows paths rejected (got ${JSON.stringify(p)})`);
  }
  // Reject parent-directory traversal.
  const segments = p.split(/[\\/]/);
  if (segments.includes('..')) {
    throw new Error(`manifest: parent-traversal rejected (got ${JSON.stringify(p)})`);
  }
  return p;
}

function dedupePaths(paths: readonly string[]): ReadonlyArray<string> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}