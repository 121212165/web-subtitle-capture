import type { ApiAdapter } from './types.js';

// ---------------------------------------------------------------------------
// Feishu / Lark caption format shapes
// ---------------------------------------------------------------------------

/**
 * Feishu caption data can arrive in several shapes depending on API version
 * and transport (HTTP vs WebSocket). We normalize across all of them.
 */

interface FeishuDataField {
  text?: string;
  content?: string;
}

interface FeishuCaptionPayload {
  text?: string;
  content?: string;
  data?: FeishuDataField | string;
  // nested variant
  result?: {
    text?: string;
    content?: string;
  };
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

/**
 * Try to extract a text string from a Feishu caption payload.
 * Handles multiple known shapes without throwing.
 */
function extractTextFromPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (!payload || typeof payload !== 'object') return '';

  const obj = payload as FeishuCaptionPayload;

  // Direct text/content fields
  if (typeof obj.text === 'string' && obj.text.trim()) return obj.text.trim();
  if (typeof obj.content === 'string' && obj.content.trim()) return obj.content.trim();

  // data.text / data.content
  if (obj.data) {
    if (typeof obj.data === 'string' && obj.data.trim()) return obj.data.trim();
    if (typeof obj.data === 'object') {
      if (typeof obj.data.text === 'string' && obj.data.text.trim()) return obj.data.text.trim();
      if (typeof obj.data.content === 'string' && obj.data.content.trim()) return obj.data.content.trim();
    }
  }

  // result.text / result.content
  if (obj.result) {
    if (typeof obj.result.text === 'string' && obj.result.text.trim()) return obj.result.text.trim();
    if (typeof obj.result.content === 'string' && obj.result.content.trim()) return obj.result.content.trim();
  }

  return '';
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const feishuAdapter: ApiAdapter = {
  id: 'feishu',

  urlPatterns: [
    'open-apis/vc',
    'caption',
    'subtitle',
    'live_caption',
  ],

  contentTypes: [
    'application/json',
    'text/plain',
  ],

  supportsStreaming: true,

  parseResponse(_url: string, body: unknown): string[] {
    try {
      // body might be a WebSocket message string or already parsed
      let payload = body;

      if (typeof body === 'string') {
        // Try JSON parse first
        const parsed = tryParseJson(body);
        if (parsed !== undefined) {
          payload = parsed;
        } else {
          // Plain text — treat as a single caption line
          const text = body.trim();
          return text ? [text] : [];
        }
      }

      // payload might be an array of caption messages
      if (Array.isArray(payload)) {
        const lines: string[] = [];
        for (const item of payload) {
          const text = extractTextFromPayload(item);
          if (text) lines.push(text);
        }
        return lines;
      }

      // Single caption message
      const text = extractTextFromPayload(payload);
      return text ? [text] : [];
    } catch {
      return [];
    }
  },
};
