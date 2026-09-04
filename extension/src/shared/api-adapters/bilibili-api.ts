import type { ApiAdapter } from './types.js';

// ---------------------------------------------------------------------------
// Bilibili subtitle format shapes
// ---------------------------------------------------------------------------

/** A single subtitle entry inside `body[]`. */
interface BilibiliSubtitleEntry {
  content?: string;
  from?: number;
  to?: number;
  // other fields ignored
}

/** Subtitle list response — the endpoint that returns available subtitle URLs. */
interface BilibiliSubtitleListItem {
  subtitle_url?: string;
  lan?: string;
  // other fields ignored
}

/** Shape of `data.subtitle` in the player endpoint. */
interface BilibiliSubtitleData {
  subtitles?: BilibiliSubtitleListItem[];
}

/** Shape of the player info response. */
interface BilibiliPlayerResponse {
  data?: {
    subtitle?: BilibiliSubtitleData;
  };
}

/** Shape of the direct subtitle JSON (fetched from subtitle_url). */
interface BilibiliSubtitleBody {
  body?: BilibiliSubtitleEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Extract lines from the subtitle body array. */
function parseSubtitleBody(body: unknown): string[] {
  const resp = body as BilibiliSubtitleBody | undefined;
  if (!resp || !Array.isArray(resp.body)) return [];

  const lines: string[] = [];
  for (const entry of resp.body) {
    const text = (entry.content ?? '').trim();
    if (text) lines.push(text);
  }
  return lines;
}

/** Check if a URL looks like a direct subtitle file URL. */
function isSubtitleFileUrl(url: string): boolean {
  return (
    url.includes('aisubtitle') ||
    url.includes('subtitle') ||
    url.endsWith('.json')
  ) && !url.includes('/x/player');
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const bilibiliAdapter: ApiAdapter = {
  id: 'bilibili',

  urlPatterns: [
    'aisubtitle',
    'subtitle',
    'x/player/wbi/v2',
    'bilibili.com/x/player',
  ],

  parseResponse(url: string, body: unknown): string[] {
    try {
      const parsed = typeof body === 'string' ? tryParseJson(body) : body;
      if (!parsed || typeof parsed !== 'object') return [];

      // Case 1: Direct subtitle JSON — has `body[]` with `content` fields
      if ('body' in (parsed as object) && Array.isArray((parsed as BilibiliSubtitleBody).body)) {
        return parseSubtitleBody(parsed);
      }

      // Case 2: Player info response — has `data.subtitle.subtitles[]`
      //         This is a list of available subtitles, not the actual content.
      //         We return an empty array here; the network interceptor should
      //         follow subtitle_url values to fetch actual content.
      //         However, if someone passes the fetched subtitle result here,
      //         it would be handled by Case 1.

      // Case 3: Wrapped in data field (some Bilibili APIs nest under `data`)
      const data = (parsed as BilibiliPlayerResponse).data;
      if (data?.subtitle?.subtitles) {
        // Return the subtitle URLs as marker lines so callers know subtitles exist
        // Actual content fetching is handled externally
        return [];
      }

      return [];
    } catch {
      return [];
    }
  },
};

/**
 * Helper: extract subtitle file URLs from a Bilibili player info response.
 * Callers can use this to know which subtitle files to fetch.
 */
export function extractBilibiliSubtitleUrls(body: unknown): string[] {
  try {
    const parsed = typeof body === 'string' ? tryParseJson(body) : body;
    if (!parsed || typeof parsed !== 'object') return [];

    const data = (parsed as BilibiliPlayerResponse).data;
    const subtitles = data?.subtitle?.subtitles;
    if (!Array.isArray(subtitles)) return [];

    return subtitles
      .map((s) => s.subtitle_url ?? '')
      .filter((u) => u.length > 0);
  } catch {
    return [];
  }
}
