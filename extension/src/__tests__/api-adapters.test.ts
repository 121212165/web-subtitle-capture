import { describe, it, expect, beforeAll } from "vitest";
import { youtubeAdapter } from "../shared/api-adapters/youtube-api.js";
import { bilibiliAdapter } from "../shared/api-adapters/bilibili-api.js";
import { feishuAdapter } from "../shared/api-adapters/feishu-api.js";
import { genericAdapter } from "../shared/api-adapters/generic-api.js";
import {
  getUrlPatterns,
  getAdapterForPlatform,
  adapters,
} from "../shared/api-adapters/index.js";

// ---------------------------------------------------------------------------
// DOMParser polyfill for Node.js (same as subtitle-parser.test.ts)
// Required because youtubeAdapter and genericAdapter use DOMParser for XML.
// ----------------------------------------------------------------interface MockNode {
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

  constructor(name: string) {
    this.nodeName = name;
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

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const parts = selector.trim().split(/\s+/);
    if (parts.length === 1) {
      this._collectMatching(parts[0], results);
    } else {
      const ancestors: MockElement[] = [];
      this._collectMatching(parts[0], ancestors);
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
  pos = skipWS(xml, pos);
  if (pos >= xml.length) return { node: null, end: pos };
  if (xml.startsWith("<?", pos)) {
    const closeIdx = xml.indexOf("?>", pos);
    return parseXMLNode(xml, closeIdx === -1 ? xml.length : closeIdx + 2);
  }
  if (xml[pos] !== "<") return { node: null, end: pos };
  const nameEnd = findTagEnd(xml, pos + 1);
  if (nameEnd === -1) return { node: null, end: xml.length };
  const rawTagContent = xml.slice(pos + 1, nameEnd);
  const nameMatch = rawTagContent.match(/^([^\s>/]+)/);
  const name = nameMatch ? nameMatch[1] : rawTagContent.trim();
  const attrs: Record<string, string> = {};
  const attrStr = xml.slice(pos + 1 + name.length, nameEnd);
  const attrRegex = /(\w[\w\-.]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  const element = new MockElement(name);
  element.attributes = attrs;
  if (nameEnd > 0 && xml[nameEnd - 1] === "/") {
    return { node: element, end: nameEnd + 1 };
  }
  let cur = nameEnd + 1;
  while (cur < xml.length) {
    const nextTag = xml.indexOf("<", cur);
    if (nextTag === -1) break;
    if (nextTag > cur) {
      const text = xml.slice(cur, nextTag).trim();
      if (text) element.appendChild(new MockTextNode(text));
    }
    if (xml[nextTag + 1] === "/") {
      const closeEnd = xml.indexOf(">", nextTag);
      cur = closeEnd === -1 ? xml.length : closeEnd + 1;
      break;
    }
    const childResult = parseXMLNode(xml, nextTag);
    if (childResult.node) element.appendChild(childResult.node);
    cur = childResult.end;
  }
  return { node: element, end: cur };
}

function skipWS(xml: string, pos: number): number {
  while (pos < xml.length && /\s/.test(xml[pos])) pos++;
  return pos;
}

function findTagEnd(xml: string, pos: number): number {
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

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).DOMParser =
    createDOMParserMock();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("adapter urlPatterns", () => {
  it("youtube adapter has non-empty urlPatterns", () => {
    expect(youtubeAdapter.urlPatterns.length).toBeGreaterThan(0);
  });

  it("bilibili adapter has non-empty urlPatterns", () => {
    expect(bilibiliAdapter.urlPatterns.length).toBeGreaterThan(0);
  });

  it("feishu adapter has non-empty urlPatterns", () => {
    expect(feishuAdapter.urlPatterns.length).toBeGreaterThan(0);
  });

  it("generic adapter has non-empty urlPatterns", () => {
    expect(genericAdapter.urlPatterns.length).toBeGreaterThan(0);
  });
});

describe("youtubeAdapter.parseResponse", () => {
  it("parses JSON3 response with events array", () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: "Hello YouTube" }] },
      ],
    });

    const result = youtubeAdapter.parseResponse(
      "https://youtube.com/api/timedtext",
      body,
    );
    expect(result).toEqual(["Hello YouTube"]);
  });

  it("parses JSON3 with already-parsed object", () => {
    const body = {
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [{ utf8: "Already " }, { utf8: "parsed" }],
        },
      ],
    };

    const result = youtubeAdapter.parseResponse("timedtext", body);
    expect(result).toEqual(["Already parsed"]);
  });

  it("falls back to srv3 XML when no events array", () => {
    const xml =
      "<timedtext><body><p t='1000' d='2000'>Srv3 text</p></body></timedtext>";
    const result = youtubeAdapter.parseResponse(
      "https://youtube.com/api/timedtext",
      xml,
    );
    expect(result).toEqual(["Srv3 text"]);
  });

  it("falls back to newline splitting for plain text body", () => {
    const body = "Line one\nLine two\nLine three";
    const result = youtubeAdapter.parseResponse("timedtext", body);
    expect(result).toEqual(["Line one", "Line two", "Line three"]);
  });

  it("returns [] for null/undefined body", () => {
    expect(youtubeAdapter.parseResponse("timedtext", null)).toEqual([]);
    expect(youtubeAdapter.parseResponse("timedtext", undefined)).toEqual([]);
  });

  it("returns [] for garbage input", () => {
    expect(youtubeAdapter.parseResponse("timedtext", { unrelated: true })).toEqual([]);
    expect(youtubeAdapter.parseResponse("timedtext", 12345)).toEqual([]);
  });

  it("returns [] for empty events array", () => {
    expect(
      youtubeAdapter.parseResponse("timedtext", { events: [] }),
    ).toEqual([]);
  });

  it("returns [] for empty string body", () => {
    expect(youtubeAdapter.parseResponse("timedtext", "")).toEqual([]);
  });
});

describe("bilibiliAdapter.parseResponse", () => {
  it("parses direct subtitle JSON with body array", () => {
    const body = {
      body: [
        { from: 0, to: 5, content: "Bilibili line 1" },
        { from: 5, to: 10, content: "Bilibili line 2" },
      ],
    };

    const result = bilibiliAdapter.parseResponse("aisubtitle", body);
    expect(result).toEqual(["Bilibili line 1", "Bilibili line 2"]);
  });

  it("parses JSON string body", () => {
    const body = JSON.stringify({
      body: [{ from: 0, to: 1, content: "Parsed from string" }],
    });

    const result = bilibiliAdapter.parseResponse("subtitle.bilibili.com", body);
    expect(result).toEqual(["Parsed from string"]);
  });

  it("returns [] for player info response (subtitle list only)", () => {
    const body = {
      data: {
        subtitle: {
          subtitles: [{ subtitle_url: "https://example.json", lan: "zh" }],
        },
      },
    };

    const result = bilibiliAdapter.parseResponse("x/player/wbi/v2", body);
    expect(result).toEqual([]);
  });

  it("returns [] for null/undefined body", () => {
    expect(bilibiliAdapter.parseResponse("aisubtitle", null)).toEqual([]);
    expect(bilibiliAdapter.parseResponse("aisubtitle", undefined)).toEqual([]);
  });

  it("returns [] for garbage input", () => {
    expect(bilibiliAdapter.parseResponse("aisubtitle", 12345)).toEqual([]);
    expect(bilibiliAdapter.parseResponse("aisubtitle", "not-json")).toEqual([]);
  });

  it("skips entries with empty content", () => {
    const body = {
      body: [
        { from: 0, to: 1, content: "" },
        { from: 1, to: 2, content: "Valid" },
      ],
    };
    const result = bilibiliAdapter.parseResponse("subtitle", body);
    expect(result).toEqual(["Valid"]);
  });
});

describe("feishuAdapter.parseResponse", () => {
  it("handles direct text field", () => {
    const result = feishuAdapter.parseResponse(
      "caption",
      { text: "Feishu caption" },
    );
    expect(result).toEqual(["Feishu caption"]);
  });

  it("handles direct content field", () => {
    const result = feishuAdapter.parseResponse(
      "caption",
      { content: "Content field" },
    );
    expect(result).toEqual(["Content field"]);
  });

  it("handles data.text nested field", () => {
    const result = feishuAdapter.parseResponse(
      "open-apis/vc",
      { data: { text: "Nested text" } },
    );
    expect(result).toEqual(["Nested text"]);
  });

  it("handles data.content nested field", () => {
    const result = feishuAdapter.parseResponse(
      "caption",
      { data: { content: "Nested content" } },
    );
    expect(result).toEqual(["Nested content"]);
  });

  it("handles data as plain string", () => {
    const result = feishuAdapter.parseResponse(
      "subtitle",
      { data: "String data" },
    );
    expect(result).toEqual(["String data"]);
  });

  it("handles result.text field", () => {
    const result = feishuAdapter.parseResponse(
      "caption",
      { result: { text: "Result text" } },
    );
    expect(result).toEqual(["Result text"]);
  });

  it("parses JSON string body", () => {
    const body = JSON.stringify({ text: "JSON string caption" });
    const result = feishuAdapter.parseResponse("caption", body);
    expect(result).toEqual(["JSON string caption"]);
  });

  it("treats non-JSON string as plain caption", () => {
    const result = feishuAdapter.parseResponse(
      "caption",
      "Plain caption text",
    );
    expect(result).toEqual(["Plain caption text"]);
  });

  it("handles array of caption messages", () => {
    const body = [
      { text: "First" },
      { content: "Second" },
      { data: { text: "Third" } },
    ];
    const result = feishuAdapter.parseResponse("caption", body);
    expect(result).toEqual(["First", "Second", "Third"]);
  });

  it("returns [] for null/undefined body", () => {
    expect(feishuAdapter.parseResponse("caption", null)).toEqual([]);
    expect(feishuAdapter.parseResponse("caption", undefined)).toEqual([]);
  });

  it("returns [] for empty object", () => {
    expect(feishuAdapter.parseResponse("caption", {})).toEqual([]);
  });

  it("returns [] for garbage input", () => {
    expect(feishuAdapter.parseResponse("caption", 12345)).toEqual([]);
  });
});

describe("genericAdapter.parseResponse", () => {
  it("parses WebVTT string", () => {
    const vtt =
      "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nVTT line";
    const result = genericAdapter.parseResponse("subtitle.vtt", vtt);
    expect(result).toEqual(["VTT line"]);
  });

  it("parses JSON with text fields", () => {
    const body = JSON.stringify([
      { text: "Line 1" },
      { text: "Line 2" },
    ]);
    const result = genericAdapter.parseResponse("caption", body);
    expect(result).toEqual(["Line 1", "Line 2"]);
  });

  it("parses JSON object with text field", () => {
    const result = genericAdapter.parseResponse(
      "transcript",
      { text: "Single line" },
    );
    expect(result).toEqual(["Single line"]);
  });

  it("parses XML (TTML) string", () => {
    const xml = `<tt><body><p>XML subtitle</p></body></tt>`;
    const result = genericAdapter.parseResponse("subtitle.ttml", xml);
    expect(result).toEqual(["XML subtitle"]);
  });

  it("handles plain text fallback", () => {
    const result = genericAdapter.parseResponse(
      "transcript",
      "Line A\nLine B\nLine C",
    );
    expect(result).toEqual(["Line A", "Line B", "Line C"]);
  });

  it("returns [] for null/undefined body", () => {
    expect(genericAdapter.parseResponse("subtitle", null)).toEqual([]);
    expect(genericAdapter.parseResponse("subtitle", undefined)).toEqual([]);
  });

  it("returns [] for empty string body", () => {
    expect(genericAdapter.parseResponse("subtitle", "")).toEqual([]);
    expect(genericAdapter.parseResponse("subtitle", "   ")).toEqual([]);
  });

  it("handles nested JSON objects", () => {
    const body = { data: { captions: [{ text: "Deep" }] } };
    const result = genericAdapter.parseResponse("caption", body);
    expect(result).toEqual(["Deep"]);
  });

  it("handles JSON string with content field", () => {
    const body = JSON.stringify({ content: "Content value" });
    const result = genericAdapter.parseResponse("subtitle", body);
    expect(result).toEqual(["Content value"]);
  });
});

describe("getUrlPatterns", () => {
  it("returns combined patterns from all adapters", () => {
    const patterns = getUrlPatterns();
    expect(patterns.length).toBeGreaterThan(0);
  });

  it("includes patterns from each adapter", () => {
    const patterns = getUrlPatterns();
    const patternStrings = patterns.filter(
      (p): p is string => typeof p === "string",
    );

    // YouTube patterns
    expect(patternStrings.some((p) => p.includes("timedtext"))).toBe(true);
    // Bilibili patterns
    expect(patternStrings.some((p) => p.includes("aisubtitle"))).toBe(true);
    // Feishu patterns
    expect(patternStrings.some((p) => p.includes("caption"))).toBe(true);
  });

  it("total count equals sum of all adapter pattern counts", () => {
    const patterns = getUrlPatterns();
    const expectedCount = adapters.reduce(
      (sum, a) => sum + a.urlPatterns.length,
      0,
    );
    expect(patterns).toHaveLength(expectedCount);
  });
});

describe("getAdapterForPlatform", () => {
  it("returns youtube adapter for 'youtube'", () => {
    const adapter = getAdapterForPlatform("youtube");
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe("youtube");
  });

  it("returns bilibili adapter for 'bilibili'", () => {
    const adapter = getAdapterForPlatform("bilibili");
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe("bilibili");
  });

  it("returns feishu adapter for 'feishu'", () => {
    const adapter = getAdapterForPlatform("feishu");
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe("feishu");
  });

  it("returns generic adapter for 'generic'", () => {
    const adapter = getAdapterForPlatform("generic");
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe("generic");
  });

  it("returns undefined for unknown platform", () => {
    expect(getAdapterForPlatform("unknown-platform")).toBeUndefined();
    expect(getAdapterForPlatform("")).toBeUndefined();
  });
});

describe("all adapters return [] for garbage input", () => {
  const garbageInputs: Array<{ label: string; value: unknown }> = [
    { label: "number", value: 42 },
    { label: "boolean", value: true },
    { label: "empty object", value: {} },
    { label: "undefined", value: undefined },
  ];

  for (const adapter of [youtubeAdapter, bilibiliAdapter, feishuAdapter, genericAdapter]) {
    for (const { label, value } of garbageInputs) {
      it(`${adapter.id} returns [] for ${label}`, () => {
        const result = adapter.parseResponse("https://example.com", value);
        expect(Array.isArray(result)).toBe(true);
        // Each result element should be a string
        for (const line of result) {
          expect(typeof line).toBe("string");
        }
      });
    }
  }
});
