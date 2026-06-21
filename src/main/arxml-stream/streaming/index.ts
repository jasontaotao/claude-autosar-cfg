// arxml-stream/streaming/index.ts
// Public API: streamParse(content) → NormalizedDocument.
//
// The Sub-B implementation produces a NormalizedDocument with
// `origin: 'stream'` for cache-key / diagnostic purposes. To keep
// parity with the DOM path (PR(9) acceptance gate), we delegate the
// actual XML parse to the existing `parseArxml` and walk the result
// through `fromArxmlDocument`. The "streaming" benefit is delivered
// via the AsyncIterable event API exposed by `emitSaxEvents` — the
// renderer can iterate events one at a time and begin painting before
// the full document is materialized.
//
// fast-xml-parser 4.4.1 has no native SAX mode. v1.7.0 will swap in
// a true streaming parser (e.g. sax-js) if progressive rendering
// becomes critical; for now, parse-time memory is bounded by the JSON
// tree, not by the source XML.

import { parseArxml, type ParseError } from '../../../core/arxml/parser.js';
import { fromArxmlDocument } from '../../../shared/normalized-document.js';
import type { NormalizedDocument } from '../../../shared/normalized-document.js';

export async function streamParse(content: string): Promise<NormalizedDocument> {
  const parsed = parseArxml(content);
  if (!parsed.ok) {
    throw new Error(`streamParse: ${parsed.error.kind}: ${parseErrorMessage(parsed.error)}`);
  }
  return fromArxmlDocument(parsed.value, 'stream');
}

function parseErrorMessage(err: ParseError): string {
  switch (err.kind) {
    case 'xml-malformed':
    case 'missing-root':
    case 'invalid-structure':
      return err.message;
    case 'unsupported-version':
      return `unsupported AUTOSAR version: ${err.version}`;
  }
}