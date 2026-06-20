// core/validation/pathNormalize.ts
// Sprint 17d — extracted from `validate.ts` to break the import cycle
// with `runtimeSchema.ts`. `buildSchemaLayer` needs to apply the same
// normalisation as `resolveTargetPath` at index time so a layer keyed
// off BSWMD paths can be matched by query paths that have already
// passed through the same helper on the lookup side.

const NAMESPACE_VALUE_PREFIX = '/EcucDefs';

interface NamespaceDefinitionPrefix {
  readonly prefix: string;
  readonly re?: RegExp;
}

const NAMESPACE_DEFINITION_PREFIXES: readonly NamespaceDefinitionPrefix[] = [
  { prefix: '/EAS' },
  // The AUTOSAR release namespace wraps the value-side
  // `EcucDefs` package under a per-release prefix
  // (`/AUTOSAR_R<NN>/EcucDefs/...` or `/AUTOSAR_R<NN>-<NN>/EcucDefs/...`
  // for the newer release tokens like R24-11). The regex matches the
  // whole definition-side segment including the inner `/EcucDefs` so
  // the fold result lands on the same value-side key the path index
  // uses. Capture group 1 is the trailing boundary (`/` or
  // end-of-string).
  { prefix: '/AUTOSAR_R', re: /^\/AUTOSAR_R\d+(?:-\d+)?\/EcucDefs(\/|$)/ },
];

/**
 * Normalize an absolute AUTOSAR path so cross-ref sites and
 * path-index keys share the value-side namespace prefix. Pure /
 * side-effect-free / immutable.
 */
export function normalizePath(path: string): string {
  if (path === '' || !path.startsWith('/')) return path;
  for (const { prefix, re } of NAMESPACE_DEFINITION_PREFIXES) {
    if (re !== undefined) {
      const match = re.exec(path);
      if (match) {
        const tailSuffix = match[1] ?? '';
        return `${NAMESPACE_VALUE_PREFIX}${path.slice(match[0].length - tailSuffix.length)}`;
      }
      continue;
    }
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return `${NAMESPACE_VALUE_PREFIX}${path.slice(prefix.length)}`;
    }
  }
  return path;
}

/**
 * ECUC per-instance container *type* segments that real BSWMD + EcucValues
 * VALUE-REFs emit between the parent container and the instance shortName
 * but `buildPathIndex` does not (it keys directly off the instance shortName).
 */
const KNOWN_TYPE_SEGMENTS: ReadonlySet<string> = new Set([
  'Pdu',
  'ComIPdu',
  'ComSignal',
  'ComIPduGroup',
]);

/**
 * Strip schema-side type segments from an absolute AUTOSAR path so it
 * matches the value-side path index built by `walkPathIndex`. Pure /
 * side-effect-free / immutable.
 */
export function tryStripTypeSegment(path: string): string {
  if (path === '') return path;
  const segments = path.split('/');
  let dropped = false;
  const kept: string[] = [];
  for (const seg of segments) {
    if (KNOWN_TYPE_SEGMENTS.has(seg)) {
      dropped = true;
      continue;
    }
    kept.push(seg);
  }
  return dropped ? kept.join('/') : path;
}

/**
 * Apply the cross-ref path-resolution pipeline used by every project-level
 * reference check (cross-ref, ref-dest, ref-cycle): namespace normalisation
 * followed by schema-side type-segment stripping. Pure / side-effect-free.
 *
 * Equivalent to `tryStripTypeSegment(normalizePath(path))` but centralised
 * here so the layer index side (`runtimeSchema.ts`) and the lookup side
 * (`validate.ts` + renderer `EnumEditor`) cannot drift apart.
 */
export function resolveTargetPath(path: string): string {
  return tryStripTypeSegment(normalizePath(path));
}