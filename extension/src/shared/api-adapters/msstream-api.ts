import type { ApiAdapter } from "./types.js";

/**
 * Microsoft Stream / Teams caption API adapter.
 *
 * Stream uses REST APIs like:
 *   /api/videos/{id}/captiontracks
 *   /api/videos/{id}/captiontracks/{trackId}/cues
 *
 * Teams live captions arrive via WebSocket or DOM, not a public API.
 * This adapter handles the Stream REST format (JSON with cues array).
 */
export const msstreamAdapter: ApiAdapter = {
  id: "msstream",
  urlPatterns: [
    "microsoftstream.com/api",
    "/captiontracks",
    "/captioncues",
    "stream.microsoft.com/api",
  ],
  contentTypes: ["application/json"],
  parseResponse(url: string, body: unknown): string[] {
    try {
      const data = typeof body === "string" ? JSON.parse(body) : body;
      if (!data || typeof data !== "object") return [];

      // /captiontracks endpoint returns track metadata — skip
      // /cues endpoint or inline cues: { value: [{ content, start, end }] }
      if (Array.isArray((data as { value?: unknown[] }).value)) {
        return (data as { value: Array<{ content?: string; text?: string }> })
          .value
          .map((cue) => cue.content ?? cue.text ?? "")
          .filter((t) => t.length > 0);
      }

      // Alternative: { cues: [{ content, offset }] }
      if (Array.isArray((data as { cues?: unknown[] }).cues)) {
        return (data as { cues: Array<{ content?: string; text?: string }> })
          .cues
          .map((cue) => cue.content ?? cue.text ?? "")
          .filter((t) => t.length > 0);
      }

      // Single caption object
      if (typeof (data as { content?: string }).content === "string") {
        const text = (data as { content: string }).content;
        return text.length > 0 ? [text] : [];
      }

      return [];
    } catch {
      return [];
    }
  },
};
