// renderer/components/editor/modes/EnumEditor.tsx
// Sprint 17d — schema-aware enum editor.
//
// Reads `enumLiterals` from the BSWMD `SchemaLayer` produced by the
// store's `bswmdSchemas`. The path is normalised through
// `resolveTargetPath` (folds vendor / release-namespace prefixes such
// as `/EAS` and `/AUTOSAR_R<NN>` to value-side `/EcucDefs`, strips
// schema-side type segments like `Pdu` / `ComIPdu`) and the combined-
// mode `<basename>/` prefix is stripped so the layer's value-side key
// matches.
//
// Vendor-CDD fallback (Sprint 17d follow-up): when the BSWMD is
// published under a vendor package prefix (e.g. `/JWQ_CDD_PACK/
// JWQ_Packet/JWQ3399/...`) but the value-side container path uses
// the value namespace (e.g. `/JWQ3399/JWQ3399/...`), the direct layer
// lookup misses. `lookupSchemaAcrossModuleRoots` iterates the
// store-derived `bswmdModulePaths` list and rebuilds the candidate
// as `<moduleRoot>/<suffix>` so the schema-side key matches.
//
// When the layer has no entry for the param path (i.e. the BSWMD
// didn't declare a literal list — or no BSWMD is loaded at all) the
// component falls back to a free-form text input. This preserves the
// long-standing "always let the user type something" behaviour for
// enum params that the project does not yet have a schema for.

import { useMemo, type JSX } from 'react';

import type { ParamValue } from '@core/arxml/types';
import {
  buildSchemaLayer,
  lookupSchemaAcrossModuleRoots,
  resolveTargetPath,
} from '@core/validation';

import { useArxmlStore } from '../../../store/useArxmlStore';

import './EnumEditor.css';

interface Props {
  readonly paramKey: string;
  readonly value: ParamValue;
  readonly containerPath: string;
}

/**
 * Combined-mode path resolution: the `containerPath` may carry a
 * `<basename>/` prefix (or `[doc:N]/` for the cross-doc alias). Strip
 * it so we can match the layer's value-side key, which is always the
 * inner absolute path (`/EcucDefs/...`).
 */
function stripLeadingBasename(path: string, documentPaths: readonly string[]): string {
  if (documentPaths.length <= 1) return path;
  const m = path.match(/^\/([^/]+)\//);
  if (!m || m[1] === undefined) return path;
  const head = m[1];
  const lastSeg = (p: string): string => {
    const parts = p.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? '';
  };
  const matches = documentPaths.some((p) => lastSeg(p) === head || /^\[doc:\d+\]$/.test(head));
  if (!matches) return path;
  return path.replace(/^\/[^/]+/, '');
}

export function EnumEditor({ paramKey, value, containerPath }: Props): JSX.Element {
  const updateParam = useArxmlStore((s) => s.updateParam);
  const bswmdSchemas = useArxmlStore((s) => s.bswmdSchemas);
  const bswmdModulePaths = useArxmlStore((s) => s.bswmdModulePaths());
  const documentPaths = useArxmlStore((s) => s.documentPaths);

  const layer = useMemo(() => buildSchemaLayer(bswmdSchemas), [bswmdSchemas]);

  const literals = useMemo<readonly string[] | null>(() => {
    const raw = `${containerPath}/${paramKey}`;
    const stripped = stripLeadingBasename(raw, documentPaths);
    const normalised = resolveTargetPath(stripped);
    // Sprint 17d — pass bswmdModulePaths so the helper can bridge the
    // vendor-CDD namespace gap (e.g. value-side /JWQ3399/... vs
    // BSWMD-side /JWQ_CDD_PACK/JWQ_Packet/JWQ3399/...).
    const entry = lookupSchemaAcrossModuleRoots(normalised, layer, bswmdModulePaths);
    return entry?.enumLiterals ?? null;
  }, [containerPath, paramKey, layer, documentPaths, bswmdModulePaths]);

  if (value.type !== 'enum') return <span className="text-red-500">type mismatch</span>;

  if (literals !== null && literals.length > 0) {
    return (
      <select
        className="enum-editor"
        value={value.value}
        aria-label={`${paramKey} value (enum)`}
        onChange={(e) =>
          updateParam(containerPath, paramKey, {
            type: 'enum',
            value: e.target.value,
          })
        }
        data-testid={`enum-editor-${paramKey}`}
      >
        {literals.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="enum-editor"
      type="text"
      value={value.value}
      aria-label={`${paramKey} value (enum)`}
      title="No schema entry for this param — free-form text input."
      onChange={(e) =>
        updateParam(containerPath, paramKey, {
          type: 'enum',
          value: e.target.value,
        })
      }
      data-testid={`enum-editor-text-${paramKey}`}
    />
  );
}