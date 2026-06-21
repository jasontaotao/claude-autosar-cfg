// arxml-stream/streaming/chunk-builder.ts
// Buffers SAX events into chunks and yields control to the event loop
// between chunks. Used by the renderer in v1.6.0+ for progressive
// rendering of large ECUC files.

import type { SaxEvent } from './sax-reader.js';

export interface Chunk {
  readonly events: ReadonlyArray<SaxEvent>;
}

export interface ChunkBuilderOptions {
  readonly eventsPerChunk?: number;
  readonly yieldBetweenChunks?: boolean;
}

const DEFAULT_EVENTS_PER_CHUNK = 500;

/**
 * Buffer SAX events into chunks of N events. Optionally yield to the
 * event loop between chunks to let UI work interleave.
 */
export async function* chunkify(
  source: AsyncIterable<SaxEvent>,
  options: ChunkBuilderOptions = {},
): AsyncGenerator<Chunk, void, undefined> {
  const eventsPerChunk = options.eventsPerChunk ?? DEFAULT_EVENTS_PER_CHUNK;
  const yieldBetween = options.yieldBetweenChunks ?? true;
  let buffer: SaxEvent[] = [];
  for await (const event of source) {
    buffer.push(event);
    if (buffer.length >= eventsPerChunk) {
      yield { events: buffer };
      buffer = [];
      if (yieldBetween) {
        await yieldToLoop();
      }
    }
  }
  if (buffer.length > 0) {
    yield { events: buffer };
  }
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setImmediate === 'function') {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}
