/**
 * Platform-specific API adapter interface.
 *
 * Each adapter describes which network responses carry subtitle data
 * for a given platform, and how to parse them into plain text lines.
 */
export interface ApiAdapter {
  id: string;

  /**
   * URL patterns to intercept.
   * Strings are matched via `String.prototype.includes`.
   * RegExps are tested against the full URL.
   */
  urlPatterns: Array<string | RegExp>;

  /** Optional Content-Type values to intercept (case-insensitive). */
  contentTypes?: string[];

  /**
   * Given a URL and the parsed response body, extract subtitle lines.
   * Must never throw — return an empty array on any failure.
   */
  parseResponse(url: string, body: unknown): string[];

  /** Whether this adapter handles live/streaming subtitles (e.g. WebSocket). */
  supportsStreaming?: boolean;
}
