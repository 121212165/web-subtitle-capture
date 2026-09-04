import type { ApiAdapter } from "./types.js";

/**
 * Microsoft Teams caption/transcript API adapter.
 *
 * Teams live captions are delivered via internal WebSocket connections
 * (wss://*.trouter.skype.com or similar). The messages contain JSON with:
 *   { text: "...", language: "en", ... }
 *
 * Teams meeting transcripts use:
 *   /communications/calls/{id}/transcripts
 *   /me/onlineMeetings/{id}/transcripts
 *
 * This adapter handles both live caption WebSocket payloads and transcript JSON.
 */
export const teamsAdapter: ApiAdapter = {
  id: "teams",
  urlPatterns: [
    "teams.microsoft.com/api",
    "trouter.skype.com",
    "/transcripts",
    "/live-captions",
    "teams.live-captions",
  ],
  supportsStreaming: true,
  parseResponse(url: string, body: unknown): string[] {
    try {
      const data = typeof body === "string" ? JSON.parse(body) : body;
      if (!data || typeof data !== "object") return [];

      // Live caption message: { text: "...", ... }
      if (typeof (data as { text?: string }).text === "string") {
        const text = (data as { text: string }).text;
        return text.trim().length > 0 ? [text.trim()] : [];
      }

      // Transcript response: { entries: [{ text, speakerDisplayName }] }
      if (Array.isArray((data as { entries?: unknown[] }).entries)) {
        return (data as { entries: Array<{ text?: string; speakerDisplayName?: string }> })
          .entries
          .map((e) => {
            const speaker = e.speakerDisplayName ? `[${e.speakerDisplayName}] ` : "";
            return speaker + (e.text ?? "");
          })
          .filter((t) => t.length > 0);
      }

      // Content wrapper: { content: "..." }
      if (typeof (data as { content?: string }).content === "string") {
        const text = (data as { content: string }).content;
        return text.trim().length > 0 ? [text.trim()] : [];
      }

      // Array of caption objects
      if (Array.isArray(data)) {
        return (data as Array<{ text?: string; content?: string }>)
          .map((item) => item.text ?? item.content ?? "")
          .filter((t) => t.length > 0);
      }

      return [];
    } catch {
      return [];
    }
  },
};
