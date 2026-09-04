import type { ApiAdapter } from "./types.js";

/**
 * Xiaomi (小米) voice recognition & subtitle API adapter.
 *
 * Covers:
 * - 小米AI开放平台 speech-to-text API responses
 * - 多看阅读 / 小米视频 subtitle endpoints
 * - 小爱同学 voice recognition result streams
 * - 通用小米视频字幕 JSON
 *
 * Typical response shapes:
 * - Speech API: { result: { text: "..." } }
 *   or { data: { text: "..." } }
 *   or { text: "..." }
 * - Subtitle API: { subtitles: [{ start, end, text }] }
 *   or { captions: [{ startTime, endTime, content }] }
 * - Streaming chunks: { partial: "..." } or { text: "...", is_final: true/false }
 */
export const xiaomiAdapter: ApiAdapter = {
  id: "xiaomi",
  urlPatterns: [
    "mi.com/api",
    "xiaomi.com/api",
    "miui.com/api",
    "duokan.com",
    "speech-api",
    "voice-recognition",
    "/subtitle",
    "/caption",
    "/speech",
    "/asr",
    "aispeech",
    "nlp.mi.com",
  ],
  supportsStreaming: true,
  parseResponse(url: string, body: unknown): string[] {
    try {
      const data = typeof body === "string" ? JSON.parse(body) : body;
      if (!data || typeof data !== "object") return [];

      const obj = data as Record<string, unknown>;
      const lines: string[] = [];

      // Shape 1: { result: { text: "..." } } — speech-to-text response
      if (typeof obj.result === "object" && obj.result !== null) {
        const result = obj.result as Record<string, unknown>;
        if (typeof result.text === "string" && result.text.trim()) {
          lines.push(result.text.trim());
        }
        // Array of results
        if (Array.isArray(result.items)) {
          for (const item of result.items) {
            if (typeof item === "object" && item !== null) {
              const t = (item as Record<string, unknown>).text;
              if (typeof t === "string" && t.trim()) lines.push(t.trim());
            }
          }
        }
      }

      // Shape 2: { data: { text: "..." } }
      if (lines.length === 0 && typeof obj.data === "object" && obj.data !== null) {
        const d = obj.data as Record<string, unknown>;
        if (typeof d.text === "string" && d.text.trim()) {
          lines.push(d.text.trim());
        }
      }

      // Shape 3: { text: "..." } — flat speech result
      if (lines.length === 0 && typeof obj.text === "string" && obj.text.trim()) {
        lines.push(obj.text.trim());
      }

      // Shape 4: { partial: "..." } — streaming partial result
      if (lines.length === 0 && typeof obj.partial === "string" && obj.partial.trim()) {
        lines.push(obj.partial.trim());
      }

      // Shape 5: { subtitles: [{ start, end, text }] } — subtitle list
      if (lines.length === 0 && Array.isArray(obj.subtitles)) {
        for (const sub of obj.subtitles) {
          if (typeof sub === "object" && sub !== null) {
            const t = (sub as Record<string, unknown>).text;
            if (typeof t === "string" && t.trim()) lines.push(t.trim());
          }
        }
      }

      // Shape 6: { captions: [{ startTime, endTime, content }] }
      if (lines.length === 0 && Array.isArray(obj.captions)) {
        for (const cap of obj.captions) {
          if (typeof cap === "object" && cap !== null) {
            const t = (cap as Record<string, unknown>).content ?? (cap as Record<string, unknown>).text;
            if (typeof t === "string" && t.trim()) lines.push(t.trim());
          }
        }
      }

      // Shape 7: { nbest: [{ sentence: "..." }] } — NLU result
      if (lines.length === 0 && Array.isArray(obj.nbest)) {
        const best = obj.nbest[0];
        if (typeof best === "object" && best !== null) {
          const t = (best as Record<string, unknown>).sentence ?? (best as Record<string, unknown>).text;
          if (typeof t === "string" && t.trim()) lines.push(t.trim());
        }
      }

      return lines;
    } catch {
      return [];
    }
  },
};
