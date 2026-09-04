// ---------------------------------------------------------------------------
// Subtitle format parser
// Normalizes various subtitle API response formats into NormalizedSubtitle[]
// ---------------------------------------------------------------------------

export interface NormalizedSubtitle {
  text: string;
  startTime?: number; // milliseconds from media start
  endTime?: number; // milliseconds
  source: "dom" | "api-fetch" | "api-ws" | "api-sse";
  platform: string;
}

export interface ParseOptions {
  source: NormalizedSubtitle["source"];
  platform: string;
  url?: string; // to hint which parser to use
  contentType?: string; // to hint format
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export function detectSubtitleFormat(
  raw: string | unknown,
  url?: string,
  contentType?: string,
): string {
  const urlLower = url?.toLowerCase() ?? "";
  const ctLower = contentType?.toLowerCase() ?? "";

  // Content-type hints take priority when unambiguous
  if (ctLower.includes("text/vtt")) return "webvtt";
  if (ctLower.includes("application/ttml+xml")) return "ttml";

  // Try to parse as JSON if it looks like it
  let parsed: unknown = undefined;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // not valid JSON, continue with string checks
      }
    }
  } else if (typeof raw === "object" && raw !== null) {
    parsed = raw;
  }

  // URL + JSON combinations
  if (parsed && urlLower.includes("timedtext")) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.events)) return "youtube-json3";
  }

  if (parsed && urlLower.includes("subtitle")) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.body)) return "bilibili";
  }

  // URL + XML combinations
  if (typeof raw === "string" && urlLower.includes("timedtext")) {
    if (raw.trimStart().startsWith("<")) return "youtube-srv3";
  }

  // JSON structure heuristics
  if (parsed) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.events)) return "youtube-json3";
    if (Array.isArray(obj.body)) {
      const body = obj.body as unknown[];
      if (body.length > 0 && isBilibiliBodyEntry(body[0])) return "bilibili";
    }
  }

  // String content heuristics
  if (typeof raw === "string") {
    const trimmed = raw.trim();

    if (trimmed.startsWith("WEBVTT")) return "webvtt";

    if (trimmed.startsWith("<?xml") || trimmed.startsWith("<tt ") || trimmed.startsWith("<timedtext")) {
      if (trimmed.includes("<timedtext")) return "youtube-srv3";
      if (trimmed.includes("<tt ") || trimmed.includes("<tt:")) return "ttml";
    }

    // Timestamped text patterns: "HH:MM:SS | text" or "[HH:MM:SS] text"
    if (/^\d{1,2}:\d{2}:\d{2}\s*[|\]]/.test(trimmed)) return "timestamped";
    if (/^\[\d{1,2}:\d{2}:\d{2}/.test(trimmed)) return "timestamped";
  }

  return "plain";
}

// ---------------------------------------------------------------------------
// Individual parsers
// ---------------------------------------------------------------------------

/**
 * YouTube JSON3 — format from timedtext API.
 * `{ events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }`
 */
export function parseYouTubeJSON3(data: unknown): NormalizedSubtitle[] {
  try {
    const obj = data as Record<string, unknown>;
    const events = obj.events;
    if (!Array.isArray(events)) return [];

    const result: NormalizedSubtitle[] = [];
    for (const event of events) {
      if (typeof event !== "object" || event === null) continue;
      const ev = event as Record<string, unknown>;

      const tStart = typeof ev.tStartMs === "number" ? ev.tStartMs : 0;
      const duration = typeof ev.dDurationMs === "number" ? ev.dDurationMs : 0;
      const segs = ev.segs;

      if (!Array.isArray(segs)) continue;

      const parts: string[] = [];
      for (const seg of segs) {
        if (typeof seg === "object" && seg !== null) {
          const utf8 = (seg as Record<string, unknown>).utf8;
          if (typeof utf8 === "string") {
            parts.push(utf8);
          }
        }
      }

      const text = parts.join("").trim();
      if (!text) continue;

      result.push({
        text,
        startTime: tStart,
        endTime: tStart + duration,
        source: "api-fetch",
        platform: "youtube",
      });
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * YouTube srv3 — TTML-like XML.
 * `<timedtext>...<p t="ms" d="ms">text</p>...</timedtext>`
 */
export function parseYouTubeSrv3(xml: string): NormalizedSubtitle[] {
  try {
    const doc = parseXML(xml);
    if (!doc) return [];

    const paragraphs = doc.querySelectorAll("p");
    const result: NormalizedSubtitle[] = [];

    for (const p of paragraphs) {
      const tAttr = p.getAttribute("t");
      const dAttr = p.getAttribute("d");
      const text = p.textContent?.trim() ?? "";

      if (!text) continue;

      const startTime = tAttr !== null ? parseMs(tAttr) : undefined;
      const duration = dAttr !== null ? parseMs(dAttr) : undefined;

      result.push({
        text,
        startTime,
        endTime: startTime !== undefined && duration !== undefined ? startTime + duration : undefined,
        source: "api-fetch",
        platform: "youtube",
      });
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * WebVTT — standard `.vtt` format.
 * Parses cue blocks with `HH:MM:SS.mmm --> HH:MM:SS.mmm` timestamps.
 */
export function parseWebVTT(vtt: string): NormalizedSubtitle[] {
  try {
    const trimmed = vtt.trim();
    if (!trimmed) return [];

    // Remove WEBVTT header and any metadata blocks
    const headerEnd = trimmed.indexOf("\n\n");
    const body = headerEnd >= 0 ? trimmed.slice(headerEnd + 2) : trimmed;

    const blocks = body.split(/\n\n+/);
    const result: NormalizedSubtitle[] = [];

    for (const block of blocks) {
      const lines = block.split("\n");
      if (lines.length < 2) continue;

      // Find the timing line (contains "-->")
      let timingLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timingLineIdx = i;
          break;
        }
      }
      if (timingLineIdx < 0) continue;

      const timingLine = lines[timingLineIdx].trim();
      const timeParts = timingLine.split("-->");
      if (timeParts.length !== 2) continue;

      const startTime = parseVTTTimestamp(timeParts[0].trim());
      const endTime = parseVTTTimestamp(timeParts[1].trim());

      // Text is everything after the timing line
      const textLines = lines.slice(timingLineIdx + 1);
      const text = textLines
        .map((l) => stripVTTTags(l))
        .join("\n")
        .trim();

      if (!text) continue;

      result.push({
        text,
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        source: "api-fetch",
        platform: "web",
      });
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * TTML — XML with `<p begin="..." end="...">text</p>` inside `<body>`.
 */
export function parseTTML(xml: string): NormalizedSubtitle[] {
  try {
    const doc = parseXML(xml);
    if (!doc) return [];

    const paragraphs = doc.querySelectorAll("body p, body span");
    // De-duplicate: only use <p> elements if they exist, otherwise fall back to <span>
    const pElements = doc.querySelectorAll("body p");
    const targets = pElements.length > 0 ? pElements : paragraphs;

    const result: NormalizedSubtitle[] = [];

    for (const el of targets) {
      const beginAttr = el.getAttribute("begin");
      const endAttr = el.getAttribute("end");
      const durAttr = el.getAttribute("dur");
      const text = el.textContent?.trim() ?? "";

      if (!text) continue;

      const startTime = beginAttr !== null ? parseTTMLTimestamp(beginAttr) : undefined;
      let endTime: number | undefined;
      if (endAttr !== null) {
        endTime = parseTTMLTimestamp(endAttr);
      } else if (startTime !== undefined && durAttr !== null) {
        const duration = parseTTMLTimestamp(durAttr);
        if (duration !== undefined) {
          endTime = startTime + duration;
        }
      }

      result.push({
        text,
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        source: "api-fetch",
        platform: "web",
      });
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Bilibili JSON — `{ body: [{ from, to, content }] }` (ai_subtitle format).
 */
export function parseBilibiliJSON(data: unknown): NormalizedSubtitle[] {
  try {
    const obj = data as Record<string, unknown>;
    const body = obj.body;
    if (!Array.isArray(body)) return [];

    const result: NormalizedSubtitle[] = [];

    for (const entry of body) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;

      const from = typeof item.from === "number" ? item.from : undefined;
      const to = typeof item.to === "number" ? item.to : undefined;
      const content = typeof item.content === "string" ? item.content.trim() : "";

      if (!content) continue;

      result.push({
        text: content,
        startTime: from !== undefined ? from * 1000 : undefined,
        endTime: to !== undefined ? to * 1000 : undefined,
        source: "api-fetch",
        platform: "bilibili",
      });
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Plain text with timestamps — lines like `14:30:06 | subtitle text`
 * or `[14:30:06] subtitle text`.
 */
export function parseTimestampedText(text: string): NormalizedSubtitle[] {
  try {
    const lines = text.split("\n");
    const result: NormalizedSubtitle[] = [];

    // Matches: HH:MM:SS separator text   or   [HH:MM:SS] text
    const pattern = /^[\[\]]?\s*(\d{1,2}):(\d{2}):(\d{2})[\]\s|>\-:]+\s*(.*)/;

    for (const line of lines) {
      const match = line.match(pattern);
      if (!match) continue;

      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      const content = match[4].trim();

      if (!content) continue;

      const ms = ((hours * 3600) + (minutes * 60) + seconds) * 1000;

      result.push({
        text: content,
        startTime: ms,
        source: "api-fetch",
        platform: "web",
      });
    }

    return result;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Auto-detect and parse
// ---------------------------------------------------------------------------

export function parseSubtitles(
  raw: string | unknown,
  options: ParseOptions,
): NormalizedSubtitle[] {
  const format = detectSubtitleFormat(raw, options.url, options.contentType);

  let subtitles: NormalizedSubtitle[];

  switch (format) {
    case "youtube-json3":
      subtitles = parseYouTubeJSON3(raw);
      break;
    case "youtube-srv3":
      subtitles = parseYouTubeSrv3(raw as string);
      break;
    case "webvtt":
      subtitles = parseWebVTT(raw as string);
      break;
    case "ttml":
      subtitles = parseTTML(raw as string);
      break;
    case "bilibili":
      subtitles = parseBilibiliJSON(raw);
      break;
    case "timestamped":
      subtitles = parseTimestampedText(raw as string);
      break;
    case "plain":
    default:
      subtitles = parsePlainText(raw as string, options);
      break;
  }

  // Apply caller-specified source and platform to every entry
  return subtitles.map((s) => ({
    ...s,
    source: options.source,
    platform: options.platform || s.platform,
  }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parsePlainText(text: string, options: ParseOptions): NormalizedSubtitle[] {
  if (typeof text !== "string") return [];

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  return [
    {
      text: lines.join("\n"),
      source: options.source,
      platform: options.platform,
    },
  ];
}

/** Parse an XML string via DOMParser. Returns null on failure. */
function parseXML(xml: string): Document | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    // DOMParser returns an error document on parse failure
    const parseError = doc.querySelector("parsererror");
    if (parseError) return null;
    return doc;
  } catch {
    return null;
  }
}

/** Parse a plain integer milliseconds string. */
function parseMs(value: string): number | undefined {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Parse a VTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) into milliseconds. */
function parseVTTTimestamp(value: string): number | undefined {
  const match = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\.(\d{3})$/);
  if (!match) return undefined;

  const hours = match[1] !== undefined ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4], 10);

  return ((hours * 3600) + (minutes * 60) + seconds) * 1000 + millis;
}

/**
 * Parse a TTML timestamp value.
 * Supports: "12345ms", "12.345s", "00:01:23.456", "00:01:23".
 */
function parseTTMLTimestamp(value: string): number | undefined {
  // Milliseconds suffix: "12345ms"
  const msMatch = value.match(/^(\d+(?:\.\d+)?)ms$/);
  if (msMatch) {
    return parseFloat(msMatch[1]);
  }

  // Seconds suffix: "12.345s"
  const sMatch = value.match(/^(\d+(?:\.\d+)?)s$/);
  if (sMatch) {
    return parseFloat(sMatch[1]) * 1000;
  }

  // Clock format: HH:MM:SS or HH:MM:SS.mmm
  const clockMatch = value.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (clockMatch) {
    const hours = parseInt(clockMatch[1], 10);
    const minutes = parseInt(clockMatch[2], 10);
    const seconds = parseInt(clockMatch[3], 10);
    const fracStr = clockMatch[4] ?? "0";
    // Normalize fractional part to milliseconds (e.g. ".1" -> 100, ".123" -> 123)
    const fracMs = parseInt(fracStr.padEnd(3, "0").slice(0, 3), 10);
    return ((hours * 3600) + (minutes * 60) + seconds) * 1000 + fracMs;
  }

  // Plain number treated as seconds
  const plain = parseFloat(value);
  if (!Number.isNaN(plain)) {
    return plain * 1000;
  }

  return undefined;
}

/** Strip basic VTT tags (e.g. <c.yellow>, </c>, <b>, <i>) from a cue text line. */
function stripVTTTags(line: string): string {
  return line.replace(/<[^>]+>/g, "");
}

/** Type guard for Bilibili body entry shape. */
function isBilibiliBodyEntry(value: unknown): value is { from: number; to: number; content: string } {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.from === "number" &&
    typeof entry.to === "number" &&
    typeof entry.content === "string"
  );
}
