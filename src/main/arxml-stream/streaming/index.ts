// arxml-stream/streaming/index.ts
// Public API: streamParse(content) → NormalizedDocument.
//
// Sub-A STUB. Sub-B replaces the body with a real event-stream walker
// that produces NormalizedDocument element-by-element.

import { XMLParser } from 'fast-xml-parser';

import type { ArxmlVersion } from '../../../core/arxml/types.js';
import type { NormalizedDocument } from '../../../shared/normalized-document.js';
import { normalizeFromFastXmlTree } from '../normalize/output.js';

export async function streamParse(content: string): Promise<NormalizedDocument> {
  // Sub-B will replace this with an event-stream walker.
  // For Sub-A, delegate to the normalize adapter with a default version.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
    processEntities: true,
    removeNSPrefix: false,
  });
  const tree = parser.parse(content) as unknown;
  return normalizeFromFastXmlTree(tree, '6.x' as ArxmlVersion);
}