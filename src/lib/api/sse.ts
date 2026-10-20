export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Parse a Server-Sent Events byte stream into { event, data } pairs.
 * Pure — no chrome APIs. Handles events split across chunk boundaries
 * (mid-line and mid-event), multiple events per chunk, and CRLF line endings.
 */
export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);

        if (line === '') {
          // Blank line terminates the event.
          if (dataLines.length > 0) {
            yield { event: eventName || 'message', data: dataLines.join('\n') };
          }
          eventName = '';
          dataLines = [];
        } else if (line.startsWith('event:')) {
          eventName = stripLeadingSpace(line.slice('event:'.length));
        } else if (line.startsWith('data:')) {
          dataLines.push(stripLeadingSpace(line.slice('data:'.length)));
        }
        // Comment lines (":...") and unknown fields are ignored per the SSE spec.
      }
    }
    // An event not terminated by a blank line at EOF is discarded per the SSE spec.
  } finally {
    reader.releaseLock();
  }
}

// SSE allows a single optional space after the field colon.
function stripLeadingSpace(value: string): string {
  return value.startsWith(' ') ? value.slice(1) : value;
}
