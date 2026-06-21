// arxml-stream/normalize/output.ts
// Adapter: fast-xml-parser JSON tree → NormalizedDocument.
//
// Used by `streaming/sax-reader.ts` (Sub-B). Produces the same
// NormalizedDocument shape that `fromArxmlDocument(ArxmlDocument, 'dom')`
// emits from the DOM path. The two paths are kept structurally
// equivalent by sharing the same `NormalizedElement` shape and source-
// order semantics — both record every container path as it is emitted.
//
// We deliberately do NOT reconstruct an ArxmlDocument in between. The
// streaming value prop is event-by-event emission; the consumer (router)
// then folds events into a NormalizedDocument.

import type { ArxmlVersion } from '../../../core/arxml/types.js';
import type {
  NormalizedDocument,
  NormalizedElement,
  NormalizedModule,
  NormalizedPackage,
  NormalizedReference,
} from '../../../shared/normalized-document.js';

interface FastXmlNode {
  readonly [key: string]: unknown;
}

const ROOT_TAG = 'AUTOSAR';
const AR_PACKAGES_TAG = 'AR-PACKAGES';
const AR_PACKAGE_TAG = 'AR-PACKAGE';
const SHORT_NAME_TAG = 'SHORT-NAME';
const ELEMENTS_TAG = 'ELEMENTS';
const DEFINITION_REF_TAG = 'DEFINITION-REF';
const REFERENCE_TAG = 'REFERENCE';
const ECUC_MODULE_DEF_VALUES = 'ECUC-MODULE-DEF-VALUES';
const ECUC_MODULE_CONFIGURATION_VALUES = 'ECUC-MODULE-CONFIGURATION-VALUES';

/**
 * Build a NormalizedDocument directly from a fast-xml-parser tree.
 *
 * `tree` is the parsed JSON object. Returns a NormalizedDocument with
 * `origin: 'stream'`. Source order is recorded for every container /
 * module / reference element as it is visited.
 */
export function normalizeFromFastXmlTree(
  tree: unknown,
  version: ArxmlVersion,
): NormalizedDocument {
  const packages: NormalizedPackage[] = [];
  const modules: NormalizedModule[] = [];
  const references: NormalizedReference[] = [];
  const sourceOrder: string[] = [];

  const root = tree as FastXmlNode | null | undefined;
  const autosar = root && typeof root === 'object' ? (root[ROOT_TAG] as FastXmlNode | undefined) : undefined;
  if (autosar === undefined) {
    return { version, packages, modules, references, sourceOrder, origin: 'stream' };
  }

  // Detect version from the tree if not provided.
  const resolvedVersion: ArxmlVersion = version;

  const arPackages = autosar[AR_PACKAGES_TAG] as FastXmlNode | undefined;
  if (arPackages === undefined) {
    return { version: resolvedVersion, packages, modules, references, sourceOrder, origin: 'stream' };
  }

  const packageList = asArray(arPackages[AR_PACKAGE_TAG]);
  for (const pkg of packageList) {
    const pkgNode = pkg as FastXmlNode;
    const pkgShortName = readShortName(pkgNode);
    const pkgPath = `/${pkgShortName}`;
    sourceOrder.push(pkgPath);
    const pkgElements = asArray(pkgNode[ELEMENTS_TAG]);
    const elements: NormalizedElement[] = [];
    for (const child of pkgElements) {
      elements.push(walkElement(child as FastXmlNode, pkgPath, modules, references, sourceOrder));
    }
    packages.push({ shortName: pkgShortName, path: pkgPath, elements });
  }

  return { version: resolvedVersion, packages, modules, references, sourceOrder, origin: 'stream' };
}

function walkElement(
  node: FastXmlNode | string | undefined,
  parentPath: string,
  modules: NormalizedModule[],
  references: NormalizedReference[],
  sourceOrder: string[],
): NormalizedElement {
  if (typeof node === 'string' || node === undefined) {
    return { kind: 'unknown', shortName: String(node ?? ''), path: parentPath };
  }
  const entries = Object.entries(node).filter(([k]) => !k.startsWith('@_') && k !== '#text');
  // Take the first non-attribute, non-text child key as the element's tag.
  const tagEntry = entries[0];
  if (tagEntry === undefined) {
    return { kind: 'unknown', shortName: '', path: parentPath };
  }
  const [tagName, rawValue] = tagEntry;
  const shortName = readShortName(node);
  const path = `${parentPath}/${shortName}`;
  const defRef = readAttribute(node, DEFINITION_REF_TAG);
  const destRef = readAttribute(node, 'DEST');

  if (tagName === ECUC_MODULE_DEF_VALUES || tagName === ECUC_MODULE_CONFIGURATION_VALUES) {
    sourceOrder.push(path);
    modules.push({ shortName, path, definitionRef: defRef });
    const children = collectChildren(rawValue, path, modules, references, sourceOrder);
    return { kind: 'module', shortName, path, children };
  }
  if (tagName === REFERENCE_TAG) {
    sourceOrder.push(path);
    const target = destRef || readAttribute(asNode(rawValue), 'DEST');
    references.push({ source: path, target });
    return { kind: 'reference', shortName, path, target };
  }
  // Generic container / unknown element.
  sourceOrder.push(path);
  const children = collectChildren(rawValue, path, modules, references, sourceOrder);
  return { kind: 'container', shortName, path, children };
}

function collectChildren(
  rawValue: unknown,
  parentPath: string,
  modules: NormalizedModule[],
  references: NormalizedReference[],
  sourceOrder: string[],
): NormalizedElement[] {
  if (Array.isArray(rawValue)) {
    const out: NormalizedElement[] = [];
    for (const child of rawValue) {
      out.push(walkElement(child as FastXmlNode, parentPath, modules, references, sourceOrder));
    }
    return out;
  }
  if (rawValue !== null && typeof rawValue === 'object') {
    return [walkElement(rawValue as FastXmlNode, parentPath, modules, references, sourceOrder)];
  }
  return [];
}

function readShortName(node: FastXmlNode | undefined): string {
  if (node === undefined) return '';
  const sn = node[SHORT_NAME_TAG];
  if (typeof sn === 'string') return sn;
  if (sn !== null && typeof sn === 'object') {
    const text = (sn as FastXmlNode)['#text'];
    if (typeof text === 'string') return text;
  }
  return '';
}

function readAttribute(node: FastXmlNode | undefined, key: string): string {
  if (node === undefined) return '';
  const attr = node[`@_${key}`];
  return typeof attr === 'string' ? attr : '';
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function asNode(value: unknown): FastXmlNode {
  if (value !== null && typeof value === 'object') return value as FastXmlNode;
  return {};
}