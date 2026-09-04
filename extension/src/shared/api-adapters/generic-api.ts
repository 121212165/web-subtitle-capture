import type { ApiAdapter } from './types.js';

// ---------------------------------------------------------------------------
// Generic fallback adapter
// ---------------------------------------------------------------------------

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Heuristic: extract text-like values from an arbitrary JSON structure.
 * Walks arrays and objects looking for fields named `text`, `content`,
 * `caption`, `subtitle`, `line`, or `value` that contain strings.
 */
function extractTextHeuristic(obj: unknown, depth = 0): string[] {
  if (depth > 8) return []; // guard against deeply nested structures

  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(obj)) {
    const lines: string[] = [];
    for (const item of obj) {
      lines.push(...extractTextHeuristic(item, depth + 1));
    }
    return lines;
  }

  if (obj && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const lines: string[] = [];

    // Check known text-bearing fields first
    const textFields = ['text', 'content', 'caption', 'subtitle', 'line', 'value', 'utf8'];
    for (const field of textFields) {
      if (field in record) {
        const val = record[field];
        if (typeof val === 'string' && val.trim()) {
          lines.push(val.trim());
        } else if (Array.isArray(val)) {
          // e.g. segs: [{utf8: "hello"}, {utf8: "world"}]
          const joined = val
            .map((s) => {
              if (typeof s === 'string') return s;
              if (s && typeof s === 'object' && typeof (s as Record<string, unknown>).utf8 === 'string') {
                return (s as Record<string, unknown>).utf8 as string;
              }
              return '';
            })
            .join('')
            .trim();
          if (joined) lines.push(joined);
        }
      }
    }

    // If we found text fields, return them
    if (lines.length > 0) return lines;

    // Otherwise, recurse into child objects
    for (const value of Object.values(record)) {
      if (value && (typeof value === 'object' || Array.isArray(value))) {
        lines.push(...extractTextHeuristic(value, depth + 1));
      }
    }

    return lines;
  }

  return [];
}

/**
 * Try to parse a WebVTT / SRT string into subtitle lines.
 * Handles both VTT and SRT loosely.
 */
function parseVttOrSrt(text: string): string[] {
  const lines: string[] = [];
  const textLines = text.split('\n');

  for (const line of textLines) {
    const trimmed = line.trim();

    // Skip empty, timestamp lines, sequence numbers, and VTT header
    if (!trimmed) continue;
    if (/^WEBVTT/.test(trimmed)) continue;
    if (/^\d+$/.test(trimmed)) continue; // SRT sequence number
    if (/-->/.test(trimmed)) continue; // timestamp
    if (/^NOTE/.test(trimmed)) continue; // VTT comment

    // Strip VTT/SRT formatting tags like <b>, <i>, <c.classname>
    const cleaned = trimmed.replace(/<[^>]+>/g, '').trim();
    if (cleaned) lines.push(cleaned);
  }

  return lines;
}

/**
 * Check whether the content type looks like a subtitle format.
 */
function isSubtitleContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return (
    lower.includes('text/vtt') ||
    lower.includes('application/ttml+xml') ||
    lower.includes('application/x-subtitle') ||
    lower.includes('text/x-subtitle') ||
    lower.includes('application/x-srt')
  );
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const genericAdapter: ApiAdapter = {
  id: 'generic',

  urlPatterns: [
    'subtitle',
    'caption',
    'transcript',
    'timedtext',
    'srt',
    'vtt',
  ],

  contentTypes: [
    'text/vtt',
    'application/ttml+xml',
    'application/x-subtitle',
  ],

  parseResponse(_url: string, body: unknown): string[] {
    try {
      if (typeof body !== 'string') {
        // body is already parsed (e.g. JSON object)
        if (body && typeof body === 'object') {
          return extractTextHeuristic(body);
        }
        return [];
      }

      // --- body is a string ---

      const trimmed = body.trim();
      if (!trimmed) return [];

      // Try JSON first
      const json = tryParseJson(trimmed);
      if (json !== undefined) {
        return extractTextHeuristic(json);
      }

      // Try WebVTT / SRT
      if (trimmed.includes('-->') || /^WEBVTT/.test(trimmed)) {
        const lines = parseVttOrSrt(trimmed);
        if (lines.length > 0) return lines;
      }

      // Try XML (TTML)
      if (trimmed.startsWith('<')) {
        try {
          const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
          // Look for common subtitle XML elements
          const selectors = ['p', 'text', 'span', 'cue'];
          for (const sel of selectors) {
            const nodes = doc.querySelectorAll(sel);
            if (nodes.length > 0) {
              const lines: string[] = [];
              for (const node of nodes) {
                const text = (node.textContent ?? '').trim();
                if (text) lines.push(text);
              }
              if (lines.length > 0) return lines;
            }
          }
        } catch {
          // XML parse failure — fall through to plain text
        }
      }

      // Plain text fallback — split by newlines
      const lines = trimmed
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      return lines;
    } catch {
      return [];
    }
  },
};

/**
 * Helper: check if a Content-Type header suggests subtitle data.
 * Useful for network interceptors to decide whether to capture a response.
 */
export { isSubtitleContentType };
