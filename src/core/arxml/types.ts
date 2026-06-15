// AUTOSAR ARXML primitive types. All exported types are immutable data.
// Reference: AUTOSAR TPS_StandardizationTemplate (4.x).
//   https://www.autosar.org/fileadmin/standards/foundation/22-11/AUTOSAR_TPS_StandardizationTemplate.pdf

export type ArxmlVersion = '4.2' | '4.4' | '4.6' | '4.7' | '5.0' | '00005' | '00006';

export interface ArxmlDocument {
  /** Root file path or logical name */
  readonly path: string;
  /** Detected AUTOSAR major version */
  readonly version: ArxmlVersion;
  /** Top-level <AR-PACKAGES> children */
  readonly packages: readonly ArxmlPackage[];
}

export interface ArxmlPackage {
  readonly shortName: string;
  readonly longName?: string;
  readonly path: string;
  readonly elements: readonly ArxmlElement[];
  /**
   * Nested AR-PACKAGES — recursive package hierarchy. Present only when the
   * package contains `<AR-PACKAGES>` children (e.g. R21/R22 BSWMD + EcucValues
   * with `AUTOSAR_R2x > EcucDefs > <module>` shape). Omitted for the flat
   * single-level shape so existing 5-fixture round-trip signatures stay
   * field-equal.
   */
  readonly packages?: readonly ArxmlPackage[];
}

export type ArxmlElement = ArxmlModule | ArxmlContainer | ArxmlReference;

export interface ArxmlModule {
  readonly kind: 'module';
  readonly tagName: string;
  readonly shortName: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly children: readonly ArxmlElement[];
  readonly references: readonly string[];
}

export interface ArxmlContainer {
  readonly kind: 'container';
  readonly tagName: string;
  readonly shortName: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly children: readonly ArxmlElement[];
}

export interface ArxmlReference {
  readonly kind: 'reference';
  readonly tagName: string;
  readonly shortName?: string;
  readonly value: string;
  /** AUTOSAR DEST attribute from <VALUE-REF DEST="..."> (e.g. "PDU", "COM-SIGNAL") */
  readonly dest?: string;
}

export type ParamValue =
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'integer'; readonly value: number }
  | { readonly type: 'float'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'enum'; readonly value: string }
  | { readonly type: 'reference'; readonly value: string; readonly dest?: string };

/** Editor mode identifier (7 modes per F2). */
export type ParamEditMode =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'enum'
  | 'reference'
  | 'multiline';

export const SUPPORTED_ARXML_VERSIONS: readonly ArxmlVersion[] = [
  '4.2',
  '4.4',
  '4.6',
  '4.7',
  '5.0',
] as const;

/**
 * Result envelope used by all core API surfaces (parser, serializer, future validators).
 * Defined here (not in shared/) so that core/ stays self-contained and the
 * core → shared layer direction stays one-way. shared/types.ts re-exports this.
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
