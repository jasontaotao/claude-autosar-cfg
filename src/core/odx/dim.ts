import type { OdxVariantInfo } from './odxDocument.js';

export interface Dim {
  readonly meta: DimMeta;
  readonly services: readonly DimService[];
  readonly dataObjects: readonly DimDataObject[];
  readonly dtcs: readonly DimDtc[];
  readonly sessions: readonly DimSession[];
  readonly securityLevels: readonly DimSecurityLevel[];
  readonly warnings: readonly DimWarning[];
}

export interface DimMeta {
  readonly sourcePath: string;
  readonly modelVersion: string;
  readonly variant: OdxVariantInfo;
  readonly adminRevision?: string;
}

export type DimServiceClass =
  | 'DiagnosticSessionControl'
  | 'ECUReset'
  | 'ClearDiagnosticInformation'
  | 'ReadDTCInformation'
  | 'ReadDataByIdentifier'
  | 'SecurityAccess'
  | 'CommunicationControl'
  | 'WriteDataByIdentifier'
  | 'InputOutputControlByIdentifier'
  | 'RoutineControl'
  | 'RequestDownload'
  | 'RequestUpload'
  | 'TransferData'
  | 'RequestTransferExit'
  | 'TesterPresent'
  | 'ControlDTCSetting'
  | 'Unknown';

export interface DimService {
  readonly odxId: string;
  readonly shortName: string;
  readonly longName?: string;
  readonly semantic?: string;
  readonly serviceClass: DimServiceClass;
  readonly sid: number;
  readonly subFunction?: number;
  readonly request: readonly DimParam[];
  readonly posResponses: readonly (readonly DimParam[])[];
  readonly negResponseCodes: readonly string[];
  readonly sdgAnnotations: Readonly<Record<string, string>>;
  readonly sessionRefs: readonly number[];
  readonly securityRefs: readonly number[];
}

export interface DimParam {
  readonly name: string;
  readonly semantic?: string;
  readonly codedValue?: string;
  readonly bytePosition: number;
  readonly bitPosition?: number;
  readonly dataObjectRef?: string;
}

export interface DimDataObject {
  readonly odxId: string;
  readonly shortName: string;
  readonly codedType: DimCodedType;
  readonly baseDataType: string;
  readonly encoding: string;
  readonly compuMethod?: DimCompuMethod;
  readonly unit?: DimUnit;
}

export type DimCodedType =
  | { readonly kind: 'standard'; readonly bitLength: number }
  | {
      readonly kind: 'minmax';
      readonly minBytes: number;
      readonly maxBytes: number;
      readonly termination?: string;
    }
  | { readonly kind: 'opaque' };

export type DimCompuMethod =
  | { readonly kind: 'identical' }
  | { readonly kind: 'linear'; readonly factor: number; readonly offset: number }
  | { readonly kind: 'texttable'; readonly entries: readonly DimTextTableEntry[] }
  | {
      readonly kind: 'scale-linear';
      readonly segments: readonly DimLinearSegment[];
    };

export interface DimTextTableEntry {
  readonly lower: number;
  readonly upper: number;
  readonly text: string;
}

export interface DimLinearSegment {
  readonly lower: number;
  readonly upper: number;
  readonly factor: number;
  readonly offset: number;
}

export interface DimUnit {
  readonly name: string;
  readonly displayName?: string;
  readonly factor?: number;
  readonly offset?: number;
}

export interface DimDtc {
  readonly odxId: string;
  readonly shortName: string;
  readonly troubleCode: number;
  readonly displayCode?: string;
  readonly text?: string;
  readonly severity?: string;
  readonly functionalUnit?: number;
}

export interface DimSession {
  readonly name: string;
  readonly value: number;
}

export interface DimSecurityLevel {
  readonly name: string;
  readonly level: number;
  readonly seedBytes?: number;
  readonly keyBytes?: number;
}

export interface DimWarning {
  readonly code: string;
  readonly elementRef: string;
  readonly message: string;
}
