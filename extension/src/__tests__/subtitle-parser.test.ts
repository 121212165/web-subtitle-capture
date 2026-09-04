import { describe, it, expect, beforeAll } from "vitest";
import {
  parseYouTubeJSON3,
  parseYouTubeSrv3,
  parseWebVTT,
  parseTTML,
  parseBilibiliJSON,
  parseTimestampedText,
  parseSubtitles,
  detectSubtitleFormat,
} from "../shared/subtitle-parser.js";
import type { NormalizedSubtitle } from "../shared/subtitle-parser.js";

// ---------------------------------------------------------------------------
// DOMParser polyfill for Node.js (vitest runs in Node, not a browser)
// Provides just enough DOM API for subtitle-parser's XML parsing.
// ---------------------------------------------------------------------------

interface MockNode {
  nodeType: number;
  nodeName: string;
  childNodes: MockNode[];
  appendChild(child: MockNode): MockNode;
}

function isElement(node: MockNode): node is MockElement {
  return node.nodeType === 1;
}

class MockElement implements MockElement {
  nodeType = 1;
  nodeName: string;
  attributes: Record<string, string> = {};
  childNodes: MockNode[] = [];
  parentElement: MockElement | null = null;
  private static idCounter = 0;
  private _uid: number;

  constructor(name: string) {
    this.nodeName = name;
    this._uid = ++MockElement.idCounter;
  }

  appendChild(child: MockNode): MockNode {
    this.childNodes.push(child);
    if (isElement(child)) {
      child.parentElement = this;
    }
    return child;
  }

  get textContent(): string {
    return this.childNodes
      .map((c) =>
        isElement(c)
          ? c.textContent
          : (c as unknown as { _text: string })._text ?? "",
      )
      .join("");
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  // querySelectorAll — supports simple tag selectors and "ancestor descendant"
  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const trimmed = selector.trim();

    // Split on " " to handle descendant combinators
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      this._collectMatching(trimmed, results);
    } else {
      // First part: find all matching ancestors
      const ancestors: MockElement[] = [];
      this._collectMatching(parts[0], ancestors);
      // For each ancestor, find matching descendants for the rest
      for (const ancestor of ancestors) {
        ancestor._collectMatchingDescendants(parts.slice(1), results);
      }
    }
    return results;
  }

  querySelector(selector: string): MockElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  private _collectMatching(tagName: string, results: MockElement[]): void {
    if (this.nodeName === tagName) results.push(this);
    for (const child of this.childNodes) {
      if (isElement(child)) child._collectMatching(tagName, results);
    }
  }

  private _collectMatchingDescendants(
    remaining: string[],
    results: MockElement[],
  ): void {
    if (remaining.length === 0) return;
    const [current, ...rest] = remaining;
    const matches: MockElement[] = [];
    this._collectMatching(current, matches);
    if (rest.length === 0) {
      results.push(...matches);
    } else {
      for (const match of matches) {
        match._collectMatchingDescendants(rest, results);
      }
    }
  }
}

class MockTextNode extends MockElement {
  private _text: string;
  override nodeType = 3;

  constructor(text: string) {
    super("#text");
    this._text = text;
  }

  override get textContent(): string {
    return this._text;
  }
}

class MockDocument extends MockElement {
  constructor() {
    super("#document");
  }
}

function createDOMParserMock(): typeof DOMParser {
  return class implements DOMParser {
    parseFromString(xml: string, _mimeType: string): Document {
      const doc = new MockDocument() as unknown as Document;
      const root = parseXMLNode(xml, 0);
      if (root.node) {
        (doc as unknown as MockElement).appendChild(root.node);
      }
      return doc;
    }
  } as unknown as typeof DOMParser;
}

interface ParseResult {
  node: MockNode | null;
  end: number;
}

function parseXMLNode(xml: string, pos: number): ParseResult {
  // Skip whitespace and declarations
  pos = skipWS(xml, pos);
  if (pos >= xml.length) return { node: null, end: pos };

  // Skip XML declarations and processing instructions
  if (xml.startsWith("<?", pos)) {
    const closeIdx = xml.indexOf("?>", pos);
    return parseXMLNode(xml, closeIdx === -1 ? xml.length : closeIdx + 2);
  }

  if (xml[pos] !== "<") return { node: null, end: pos };

  const nameEnd = findTagEnd(xml, pos + 1);
  if (nameEnd === -1) return { node: null, end: xml.length };

  // Extract the tag name only (stop at first whitespace or '>'/'/')
  const rawTagContent = xml.slice(pos + 1, nameEnd);
  const nameMatch = rawTagContent.match(/^([^\s>/]+)/);
  const name = nameMatch ? nameMatch[1] : rawTagContent.trim();

  // Parse attributes
  const attrs: Record<string, string> = {};
  const attrStr = xml.slice(pos + 1 + name.length, nameEnd);
  const attrRegex = /(\w[\w\-.]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }

  const element = new MockElement(name);
  element.attributes = attrs;

  // Self-closing tag?
  if (nameEnd > 0 && xml[nameEnd - 1] === "/") {
    return { node: element, end: nameEnd + 1 };
  }

  // Skip the ">"
  let cur = nameEnd + 1;

  // Parse children
  while (cur < xml.length) {
    // Find next '<'
    const nextTag = xml.indexOf("<", cur);
    if (nextTag === -1) break;

    // Text node before the tag
    if (nextTag > cur) {
      const text = xml.slice(cur, nextTag).trim();
      if (text) {
        element.appendChild(new MockTextNode(text));
      }
    }

    // Check for closing tag
    if (xml[nextTag + 1] === "/") {
      const closeEnd = xml.indexOf(">", nextTag);
      cur = closeEnd === -1 ? xml.length : closeEnd + 1;
      break;
    }

    // Child element
    const childResult = parseXMLNode(xml, nextTag);
    if (childResult.node) {
      element.appendChild(childResult.node);
    }
    cur = childResult.end;
  }

  return { node: element, end: cur };
}

function skipWS(xml: string, pos: number): number {
  while (pos < xml.length && /\s/.test(xml[pos])) pos++;
  return pos;
}

function findTagEnd(xml: string, pos: number): number {
  // Find the end of the tag name+attributes, stopping at '>'
  let inQuote = false;
  let quoteChar = "";
  while (pos < xml.length) {
    const ch = xml[pos];
    if (inQuote) {
      if (ch === quoteChar) inQuote = false;
    } else {
      if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === ">") {
        return pos;
      }
    }
    pos++;
  }
  return -1;
}

// Install the mock before any tests run
beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).DOMParser =
    createDOMParserMock();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseYouTubeJSON3", () => {
  it("parses basic JSON3 with single segment events", () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: "Hello" }] },
        { tStartMs: 5000, dDurationMs: 3000, segs: [{ utf8: "World" }] },
      ],
    };

    const result = parseYouTubeJSON3(data);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      text: "Hello",
      startTime: 0,
      endTime: 5000,
      source: "api-fetch",
      platform: "youtube",
    });
    expect(result[1]).toEqual({
      text: "World",
      startTime: 5000,
      endTime: 8000,
      source: "api-fetch",
      platform: "youtube",
    });
  });

  it("joins multiple segments within one event", () => {
    const data = {
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [{ utf8: "Hello " }, { utf8: "World" }],
        },
      ],
    };

    const result = parseYouTubeJSON3(data);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello World");
    expect(result[0].startTime).toBe(1000);
    expect(result[0].endTime).toBe(3000);
  });

  it("skips events without segs", () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 1000 },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "Good" }] },
      ],
    };

    const result = parseYouTubeJSON3(data);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Good");
  });

  it("defaults tStartMs to 0 when missing", () => {
    const data = {
      events: [{ dDurationMs: 3000, segs: [{ utf8: "No start" }] }],
    };

    const result = parseYouTubeJSON3(data);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(3000);
  });

  it("returns empty array for non-object input", () => {
    expect(parseYouTubeJSON3(null)).toEqual([]);
    expect(parseYouTubeJSON3(undefined)).toEqual([]);
    expect(parseYouTubeJSON3("string")).toEqual([]);
    expect(parseYouTubeJSON3(42)).toEqual([]);
  });

  it("returns empty array when events is not an array", () => {
    expect(parseYouTubeJSON3({ events: "not-array" })).toEqual([]);
    expect(parseYouTubeJSON3({})).toEqual([]);
  });

  it("skips events with empty trimmed text", () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "   " }] },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "Real" }] },
      ],
    };

    const result = parseYouTubeJSON3(data);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real");
  });
});

describe("parseYouTubeSrv3", () => {
  it("parses srv3 XML with t and d attributes", () => {
    const xml = `<timedtext><body><p t="1000" d="2000">World</p></body></timedtext>`;
    const result = parseYouTubeSrv3(xml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      text: "World",
      startTime: 1000,
      endTime: 3000,
      source: "api-fetch",
      platform: "youtube",
    });
  });

  it("parses multiple paragraphs", () => {
    const xml = `<timedtext><body>
      <p t="0" d="5000">First line</p>
      <p t="5000" d="3000">Second line</p>
    </body></timedtext>`;

    const result = parseYouTubeSrv3(xml);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("First line");
    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(5000);
    expect(result[1].text).toBe("Second line");
    expect(result[1].startTime).toBe(5000);
    expect(result[1].endTime).toBe(8000);
  });

  it("handles missing t and d attributes", () => {
    const xml = `<timedtext><body><p>No attrs</p></body></timedtext>`;
    const result = parseYouTubeSrv3(xml);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("No attrs");
    expect(result[0].startTime).toBeUndefined();
    expect(result[0].endTime).toBeUndefined();
  });

  it("skips empty paragraphs", () => {
    const xml = `<timedtext><body><p t="0" d="1000">   </p><p t="1000" d="1000">Real</p></body></timedtext>`;
    const result = parseYouTubeSrv3(xml);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real");
  });

  it("returns empty array for invalid XML", () => {
    expect(parseYouTubeSrv3("not xml at all")).toEqual([]);
    expect(parseYouTubeSrv3("")).toEqual([]);
  });
});

describe("parseWebVTT", () => {
  it("parses basic VTT with timestamps", () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello`;
    const result = parseWebVTT(vtt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      text: "Hello",
      startTime: 1000,
      endTime: 5000,
      source: "api-fetch",
      platform: "web",
    });
  });

  it("parses multiple cues", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:05.000",
      "First cue",
      "",
      "00:00:06.000 --> 00:00:10.500",
      "Second cue",
    ].join("\n");

    const result = parseWebVTT(vtt);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("First cue");
    expect(result[0].startTime).toBe(1000);
    expect(result[0].endTime).toBe(5000);
    expect(result[1].text).toBe("Second cue");
    expect(result[1].startTime).toBe(6000);
    expect(result[1].endTime).toBe(10500);
  });

  it("handles multi-line cue text", () => {
    const vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nLine one\nLine two`;
    const result = parseWebVTT(vtt);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Line one\nLine two");
  });

  it("strips VTT formatting tags", () => {
    const vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n<c.yellow>Colored text</c>`;
    const result = parseWebVTT(vtt);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Colored text");
  });

  it("skips blocks without timing lines", () => {
    const vtt = [
      "WEBVTT",
      "",
      "NOTE",
      "This is a comment",
      "",
      "00:00:01.000 --> 00:00:05.000",
      "Actual cue",
    ].join("\n");

    const result = parseWebVTT(vtt);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Actual cue");
  });

  it("parses timestamps without hours (MM:SS.mmm)", () => {
    const vtt = `WEBVTT\n\n00:01.000 --> 00:05.000\nShort timestamp`;
    const result = parseWebVTT(vtt);

    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(1000);
    expect(result[0].endTime).toBe(5000);
  });

  it("returns empty array for empty input", () => {
    expect(parseWebVTT("")).toEqual([]);
    expect(parseWebVTT("   ")).toEqual([]);
  });

  it("returns empty array for VTT with no cues", () => {
    expect(parseWebVTT("WEBVTT\n")).toEqual([]);
  });
});

describe("parseTTML", () => {
  it("parses TTML with begin/end attributes", () => {
    const xml = `<tt><body><p begin="00:00:01.000" end="00:00:05.000">Hello TTML</p></body></tt>`;
    const result = parseTTML(xml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      text: "Hello TTML",
      startTime: 1000,
      endTime: 5000,
      source: "api-fetch",
      platform: "web",
    });
  });

  it("parses TTML with begin and dur attributes", () => {
    const xml = `<tt><body><p begin="0s" dur="3s">Three seconds</p></body></tt>`;
    const result = parseTTML(xml);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Three seconds");
    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(3000);
  });

  it("parses TTML with milliseconds suffix", () => {
    const xml = `<tt><body><p begin="1500ms" end="3000ms">Ms format</p></body></tt>`;
    const result = parseTTML(xml);

    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(1500);
    expect(result[0].endTime).toBe(3000);
  });

  it("handles multiple paragraphs", () => {
    const xml = `<tt><body>
      <p begin="0s" end="2s">First</p>
      <p begin="2s" end="4s">Second</p>
    </body></tt>`;
    const result = parseTTML(xml);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("First");
    expect(result[1].text).toBe("Second");
  });

  it("returns empty array for empty input", () => {
    expect(parseTTML("")).toEqual([]);
  });

  it("returns empty array for invalid XML", () => {
    expect(parseTTML("not xml")).toEqual([]);
  });
});

describe("parseBilibiliJSON", () => {
  it("parses basic body format with from/to/content", () => {
    const data = {
      body: [
        { from: 0, to: 5, content: "Hi" },
        { from: 5, to: 10, content: "There" },
      ],
    };

    const result = parseBilibiliJSON(data);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      text: "Hi",
      startTime: 0,
      endTime: 5000,
      source: "api-fetch",
      platform: "bilibili",
    });
    expect(result[1]).toEqual({
      text: "There",
      startTime: 5000,
      endTime: 10000,
      source: "api-fetch",
      platform: "bilibili",
    });
  });

  it("converts seconds to milliseconds", () => {
    const data = { body: [{ from: 1.5, to: 3.5, content: "Mid" }] };
    const result = parseBilibiliJSON(data);

    expect(result[0].startTime).toBe(1500);
    expect(result[0].endTime).toBe(3500);
  });

  it("handles missing from/to fields", () => {
    const data = { body: [{ content: "No timestamps" }] };
    const result = parseBilibiliJSON(data);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("No timestamps");
    expect(result[0].startTime).toBeUndefined();
    expect(result[0].endTime).toBeUndefined();
  });

  it("skips entries with empty content", () => {
    const data = {
      body: [
        { from: 0, to: 1, content: "" },
        { from: 1, to: 2, content: "   " },
        { from: 2, to: 3, content: "Valid" },
      ],
    };

    const result = parseBilibiliJSON(data);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Valid");
  });

  it("returns empty array when body is missing", () => {
    expect(parseBilibiliJSON({})).toEqual([]);
    expect(parseBilibiliJSON({ body: "not-array" })).toEqual([]);
  });

  it("returns empty array for non-object input", () => {
    expect(parseBilibiliJSON(null)).toEqual([]);
    expect(parseBilibiliJSON(42)).toEqual([]);
  });
});

describe("parseTimestampedText", () => {
  it("parses HH:MM:SS | text format", () => {
    const text = "14:30:06 | Hello world";
    const result = parseTimestampedText(text);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      text: "Hello world",
      startTime: 52206000,
      source: "api-fetch",
      platform: "web",
    });
  });

  it("parses [HH:MM:SS] text format", () => {
    const text = "[00:01:30] Ninety seconds";
    const result = parseTimestampedText(text);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Ninety seconds");
    expect(result[0].startTime).toBe(90000);
  });

  it("parses multiple timestamped lines", () => {
    const text = "00:00:00 | Start\n00:00:05 | Middle\n00:00:10 | End";
    const result = parseTimestampedText(text);

    expect(result).toHaveLength(3);
    expect(result[0].startTime).toBe(0);
    expect(result[1].startTime).toBe(5000);
    expect(result[2].startTime).toBe(10000);
  });

  it("skips lines without timestamps", () => {
    const text = "No timestamp here\n00:00:01 | Has timestamp";
    const result = parseTimestampedText(text);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Has timestamp");
  });

  it("returns empty array for empty input", () => {
    expect(parseTimestampedText("")).toEqual([]);
  });

  it("handles single-digit hours", () => {
    const text = "1:05:30 | One hour";
    const result = parseTimestampedText(text);

    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(3930000);
  });
});

describe("detectSubtitleFormat", () => {
  it("detects youtube-json3 by URL and events array", () => {
    const data = { events: [{ segs: [{ utf8: "test" }] }] };
    expect(detectSubtitleFormat(data, "https://example.com/timedtext")).toBe(
      "youtube-json3",
    );
  });

  it("detects youtube-json3 by events array alone", () => {
    const data = { events: [] };
    expect(detectSubtitleFormat(data)).toBe("youtube-json3");
  });

  it("detects bilibili by URL and body array", () => {
    const data = { body: [{ from: 0, to: 1, content: "hi" }] };
    expect(
      detectSubtitleFormat(data, "https://subtitle.bilibili.com/api"),
    ).toBe("bilibili");
  });

  it("detects bilibili by body structure alone", () => {
    const data = { body: [{ from: 0, to: 1, content: "hi" }] };
    expect(detectSubtitleFormat(data)).toBe("bilibili");
  });

  it("detects youtube-srv3 by URL and XML string", () => {
    const xml = "<timedtext><body><p>test</p></body></timedtext>";
    expect(detectSubtitleFormat(xml, "https://example.com/timedtext")).toBe(
      "youtube-srv3",
    );
  });

  it("detects webvtt by WEBVTT header", () => {
    expect(detectSubtitleFormat("WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHi")).toBe(
      "webvtt",
    );
  });

  it("detects webvtt by content-type", () => {
    expect(detectSubtitleFormat("anything", undefined, "text/vtt")).toBe(
      "webvtt",
    );
  });

  it("detects ttml by content-type", () => {
    expect(detectSubtitleFormat("anything", undefined, "application/ttml+xml")).toBe(
      "ttml",
    );
  });

  it("detects ttml by tt tag in XML string", () => {
    const xml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><p>hi</p></body></tt>';
    expect(detectSubtitleFormat(xml)).toBe("ttml");
  });

  it("detects timestamped text format", () => {
    expect(detectSubtitleFormat("14:30:06 | Hello")).toBe("timestamped");
    expect(detectSubtitleFormat("[00:00:01] Test")).toBe("timestamped");
  });

  it("returns plain for unrecognized input", () => {
    expect(detectSubtitleFormat("Just some text")).toBe("plain");
    expect(detectSubtitleFormat("")).toBe("plain");
  });

  it("handles string JSON input", () => {
    const json = '{"events": []}';
    expect(detectSubtitleFormat(json, "timedtext")).toBe("youtube-json3");
  });

  it("handles malformed JSON gracefully", () => {
    expect(detectSubtitleFormat("{not valid json", "timedtext")).toBe("plain");
  });
});

describe("parseSubtitles (auto-detect)", () => {
  const defaultOptions = {
    source: "api-fetch" as const,
    platform: "test-platform",
  };

  it("auto-detects and parses YouTube JSON3", () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: "Hello" }] },
      ],
    };
    const result = parseSubtitles(data, {
      ...defaultOptions,
      url: "https://example.com/timedtext",
    });

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello");
    expect(result[0].source).toBe("api-fetch");
    expect(result[0].platform).toBe("test-platform");
  });

  it("auto-detects and parses WebVTT", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nTest";
    const result = parseSubtitles(vtt, defaultOptions);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Test");
    expect(result[0].source).toBe("api-fetch");
  });

  it("auto-detects and parses Bilibili JSON", () => {
    const data = { body: [{ from: 0, to: 5, content: "Bi" }] };
    const result = parseSubtitles(data, defaultOptions);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Bi");
    expect(result[0].platform).toBe("test-platform");
  });

  it("auto-detects timestamped text", () => {
    const text = "00:00:01 | Line";
    const result = parseSubtitles(text, defaultOptions);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Line");
    expect(result[0].startTime).toBe(1000);
  });

  it("applies caller source and platform overrides", () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Override" }] },
      ],
    };
    const result = parseSubtitles(data, {
      source: "api-ws",
      platform: "custom",
      url: "timedtext",
    });

    expect(result[0].source).toBe("api-ws");
    expect(result[0].platform).toBe("custom");
  });

  it("falls back to plain text parser for unrecognized format", () => {
    const result = parseSubtitles("Just plain text", {
      source: "dom",
      platform: "web",
    });

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Just plain text");
    expect(result[0].source).toBe("dom");
  });

  it("returns empty array for empty plain text", () => {
    const result = parseSubtitles("", defaultOptions);
    expect(result).toEqual([]);
  });
});

describe("edge cases across all parsers", () => {
  it("parseYouTubeJSON3 returns [] for undefined", () => {
    expect(parseYouTubeJSON3(undefined)).toEqual([]);
  });

  it("parseYouTubeSrv3 returns [] for null-like input", () => {
    // @ts-expect-error -- testing runtime edge case
    expect(parseYouTubeSrv3(null)).toEqual([]);
  });

  it("parseWebVTT returns [] for whitespace-only input", () => {
    expect(parseWebVTT("   \n\n  ")).toEqual([]);
  });

  it("parseTTML returns [] for completely broken XML", () => {
    expect(parseTTML("<<>>invalid<<")).toEqual([]);
  });

  it("parseBilibiliJSON returns [] for garbage object", () => {
    expect(parseBilibiliJSON({ unrelated: true })).toEqual([]);
  });

  it("parseTimestampedText returns [] for unstructured text", () => {
    expect(parseTimestampedText("no timestamps here at all")).toEqual([]);
  });

  it("parseYouTubeJSON3 handles deeply nested but valid data", () => {
    const data = {
      events: [
        {
          tStartMs: 0,
          dDurationMs: 100,
          segs: [{ utf8: "\n\t  Deep  \t\n" }],
        },
      ],
    };
    const result = parseYouTubeJSON3(data);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Deep");
  });
});
