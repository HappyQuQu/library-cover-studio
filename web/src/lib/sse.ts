import { CodedError } from './codedError';

/** Decode complete SSE frames; UTF-8 and JSON may both be split across network chunks. */
export async function* readSSE<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const parse = (frame: string): T | undefined => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return undefined;
    try { return JSON.parse(data) as T; }
    catch { throw new CodedError('SSE_INVALID_EVENT'); }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const event = parse(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
        if (event !== undefined) yield event;
      }
      if (done) {
        if (buffer.trim()) { const event = parse(buffer); if (event !== undefined) yield event; }
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
