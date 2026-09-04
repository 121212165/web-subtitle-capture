import type { ApiAdapter } from './types.js';

// ---------------------------------------------------------------------------
// YouTube subtitle format shapes
// ---------------------------------------------------------------------------

/** JSON3 segment — a single text chunk inside an event. */
interface Json3Segment {
  utf8?: string;
}

/** JSON3 event — one subtitle cue. */
interface Json3Event {
  segs?: Json3Segment[];
  // other fields ignored
}

/** JSON3 top-level response. */
interface Json3Response {
  events?: Json3Event[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try to parse a string as JSON, returning `undefined` on failure. */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Extract subtitle lines from a JSON3 response. */
function parseJson3(body: unknown): string[] {
  const resp = body as Json3Response | undefined;
  if (!resp || !Array.isArray(resp.events)) return [];

  const lines: string[] = [];
  for (const event of resp.events) {
    if (!Array.isArray(event.segs)) continue;
    const text = event.segs
      .map((seg) => seg.utf8 ?? '')
      .join('')
      .trim();
    if (text) lines.push(text);
  }
  return lines;
}

/** Extract subtitle lines from an srv3 (XML / TTML) response. */
function parseSrv3(body: unknown): string[] {
  // body may be a raw XML string or already parsed
  const xmlStr = typeof body === 'string' ? body : String(body ?? '');
  if (!xmlStr.includes('<')) return [];

  try {
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    const nodes = doc.querySelectorAll('p');
    const lines: string[] = [];
    for (const node of nodes) {
      const text = (node.textContent ?? '').trim();
      if (text) lines.push(text);
    }
    return lines;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const youtubeAdapter: ApiAdapter = {
  id: 'youtube',

  urlPatterns: [
    'timedtext',
    'api/timedtext',
    'youtube.com/api/timedtext',
  ],

  parseResponse(url: string, body: unknown): string[] {
    try {
      // body might already be parsed, or might be a raw string
      const parsed = typeof body === 'string' ? tryParseJson(body) : body;

      // Try JSON3 first (primary format)
      if (parsed && typeof parsed === 'object' && 'events' in (parsed as object)) {
        const lines = parseJson3(parsed);
        if (lines.length > 0) return lines;
      }

      // Fallback: srv3 / XML
      if (typeof body === 'string' && body.includes('<')) {
        const lines = parseSrv3(body);
        if (lines.length > 0) return lines;
      }

      // Last resort: if body is a string that is not JSON/XML, try splitting
      if (typeof body === 'string' && body.trim().length > 0) {
        const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) return lines;
      }

      return [];
    } catch {
      return [];
    }
  },
};
