// arxml-stream/streaming/sax-reader.ts
// SAX-style event API over a fast-xml-parser tree.
//
// fast-xml-parser 4.4.1 has no native SAX/streaming mode. This module
// provides a post-parse event iterator so consumers (renderers, the
// headless CLI in v1.6.0) can begin processing the first element
// before the full document has been walked.
//
// v1.7.0 will swap in a true streaming parser (e.g. sax-js). When that
// happens, this file becomes a thin adapter from the new parser's
// native event API.

import { XMLParser } from 'fast-xml-parser';

export type SaxEvent =
  | { readonly kind: 'open'; readonly tagName: string; readonly attributes: Readonly<Record<string, string>> }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'close'; readonly tagName: string };

export interface SaxReaderOptions {
  /** When set, chunkBuilder yields to the event loop between chunks.
   *  Defaults to 500 events per chunk. */
  readonly eventsPerChunk?: number;
}

const DEFAULT_EVENTS_PER_CHUNK = 500;

/**
 * Walk the fast-xml-parser JSON tree and emit SAX-style events one at
 * a time. The iterator yields to the event loop between chunks so
 * other async work (UI repaints, IPC) can interleave.
 */
export async function* emitSaxEvents(
  content: string,
  options: SaxReaderOptions = {},
): AsyncGenerator<SaxEvent, void, undefined> {
  const eventsPerChunk = options.eventsPerChunk ?? DEFAULT_EVENTS_PER_CHUNK;
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
  let yielded = 0;
  for (const event of walkTree(tree)) {
    yield event;
    yielded++;
    if (yielded >= eventsPerChunk) {
      yielded = 0;
      await yieldToLoop();
    }
  }
}

function* walkTree(node: unknown): Generator<SaxEvent, void, undefined> {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') {
    yield { kind: 'text', value: String(node) };
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) yield* walkTree(child);
    return;
  }
  const record = node as Record<string, unknown>;
  for (const [tagName, value] of Object.entries(record)) {
    if (tagName.startsWith('@_')) continue;
    if (tagName === '#text') {
      if (typeof value === 'string') yield { kind: 'text', value };
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      const attrs: Record<string, string> = {};
      const childRecord = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(childRecord)) {
        if (k.startsWith('@_')) attrs[k.slice(2)] = String(v);
      }
      yield { kind: 'open', tagName, attributes: attrs };
      yield* walkTree(value);
      yield { kind: 'close', tagName };
    } else {
      yield { kind: 'text', value: String(value) };
    }
  }
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setImmediate === 'function') {
      setImmediate(resolve);
    } else {
      // Fallback for environments without setImmediate (e.g. older browsers).
      setTimeout(resolve, 0);
    }
  });
}