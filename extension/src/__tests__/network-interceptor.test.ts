import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// Browser globals mock
//
// createNetworkInterceptor() monkey-patches window.fetch, XMLHttpRequest,
// WebSocket, and EventSource at call time. We set up minimal mocks of these
// globals *before* the module is imported so the patching does not crash.
// ---------------------------------------------------------------------------

interface MockEventListener {
  type: string;
  handler: (event: unknown) => void;
}

class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  private listeners: MockEventListener[] = [];

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners.push({ type, handler });
  }
}

class MockWebSocketInstance {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  private listeners: MockEventListener[] = [];

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners.push({ type, handler });
  }
}

// We need a constructor reference that WebSocket can be assigned to
const MockWebSocket = MockWebSocketInstance as unknown as typeof WebSocket;
(MockWebSocket as unknown as Record<string, unknown>).CONNECTING = 0;
(MockWebSocket as unknown as Record<string, unknown>).OPEN = 1;
(MockWebSocket as unknown as Record<string, unknown>).CLOSING = 2;
(MockWebSocket as unknown as Record<string, unknown>).CLOSED = 3;

class MockXMLHttpRequest {
  static _originalOpen: typeof XMLHttpRequest.prototype.open;
  static _originalSend: typeof XMLHttpRequest.prototype.send;

  responseText = "";
  private _listeners: MockEventListener[] = [];
  // Custom properties the interceptor may attach
  [key: string]: unknown;

  open(
    _method: string,
    _url: string,
    _async?: boolean,
    _username?: string | null,
    _password?: string | null,
  ): void {
    // Default no-op; will be replaced by interceptor
  }

  send(_body?: unknown): void {
    // Default no-op; will be replaced by interceptor
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this._listeners.push({ type, handler });
  }

  getResponseHeader(_name: string): string | null {
    return null;
  }
}

// Store originals for reference
MockXMLHttpRequest._originalOpen = MockXMLHttpRequest.prototype.open;
MockXMLHttpRequest._originalSend = MockXMLHttpRequest.prototype.send;

// Install globals
const g = globalThis as unknown as Record<string, unknown>;
const _originalWindow = g.window;
const _originalFetch = g.fetch;
const _originalXMLHttpRequest = g.XMLHttpRequest;
const _originalWebSocket = g.WebSocket;
const _originalEventSource = g.EventSource;

// Keep a reference to the vi.fn() mock so tests can configure it.
// createNetworkInterceptor replaces window.fetch with a wrapper, so
// globalThis.fetch is no longer the vi.fn() after construction.
let mockFetchFn: ReturnType<typeof vi.fn>;

beforeAll(() => {
  // The interceptor references `window.fetch`, so window must exist.
  if (!g.window) {
    g.window = g;
  }
  mockFetchFn = vi.fn();
  g.fetch = mockFetchFn;
  g.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  g.WebSocket = MockWebSocket;
  g.EventSource = MockEventSource as unknown as typeof EventSource;
});

afterAll(() => {
  // Restore original globals
  if (_originalWindow === undefined) {
    delete g.window;
  } else {
    g.window = _originalWindow;
  }
  if (_originalFetch === undefined) {
    delete g.fetch;
  } else {
    g.fetch = _originalFetch;
  }
  if (_originalXMLHttpRequest === undefined) {
    delete g.XMLHttpRequest;
  } else {
    g.XMLHttpRequest = _originalXMLHttpRequest;
  }
  if (_originalWebSocket === undefined) {
    delete g.WebSocket;
  } else {
    g.WebSocket = _originalWebSocket;
  }
  if (_originalEventSource === undefined) {
    delete g.EventSource;
  } else {
    g.EventSource = _originalEventSource;
  }
});

// Import AFTER globals are installed so the module sees them
import { createNetworkInterceptor } from "../content/network-interceptor.js";
import type { InterceptedPayload } from "../content/network-interceptor.js";

// ---------------------------------------------------------------------------
// Helper: configure the underlying fetch mock to return a given body.
// createNetworkInterceptor captures the original window.fetch (our vi.fn())
// and wraps it. We configure the vi.fn() directly; the interceptor calls
// it and passes the response through.
// ---------------------------------------------------------------------------
function setupFetchMock(body: string, contentType = "application/json"): void {
  mockFetchFn.mockResolvedValue({
    headers: { get: () => contentType },
    clone: () => ({
      text: () => Promise.resolve(body),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createNetworkInterceptor", () => {
  it("returns an object with destroy and getBuffer methods", () => {
    const interceptor = createNetworkInterceptor({
      urlPatterns: [],
      onSubtitle: vi.fn(),
    });

    expect(typeof interceptor.destroy).toBe("function");
    expect(typeof interceptor.getBuffer).toBe("function");

    interceptor.destroy();
  });

  it("buffer starts empty", () => {
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["test"],
      onSubtitle: vi.fn(),
    });

    expect(interceptor.getBuffer()).toEqual([]);

    interceptor.destroy();
  });

  it("destroy() is idempotent — can be called twice without error", () => {
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["test"],
      onSubtitle: vi.fn(),
    });

    expect(() => {
      interceptor.destroy();
      interceptor.destroy();
    }).not.toThrow();
  });

  it("destroy() is idempotent — can be called three times without error", () => {
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["test"],
      onSubtitle: vi.fn(),
    });

    interceptor.destroy();
    interceptor.destroy();
    interceptor.destroy();

    // Should still return an empty buffer
    expect(interceptor.getBuffer()).toEqual([]);
  });

  it("does not crash when constructed with empty patterns", () => {
    expect(() => {
      const interceptor = createNetworkInterceptor({
        urlPatterns: [],
        onSubtitle: vi.fn(),
      });
      interceptor.destroy();
    }).not.toThrow();
  });

  it("does not crash when constructed with RegExp patterns", () => {
    expect(() => {
      const interceptor = createNetworkInterceptor({
        urlPatterns: [/timedtext/, /subtitle\.json/],
        onSubtitle: vi.fn(),
      });
      interceptor.destroy();
    }).not.toThrow();
  });

  it("does not crash with mixed string and RegExp patterns", () => {
    expect(() => {
      const interceptor = createNetworkInterceptor({
        urlPatterns: ["timedtext", /subtitle/, "caption"],
        onSubtitle: vi.fn(),
      });
      interceptor.destroy();
    }).not.toThrow();
  });
});

describe("URL pattern matching (string patterns)", () => {
  it("captures fetch responses when URL matches a string pattern", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["timedtext"],
      onSubtitle,
    });

    setupFetchMock(JSON.stringify({ text: "Captured subtitle" }));

    // Trigger the intercepted fetch (window.fetch is now the wrapper)
    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://example.com/api/timedtext");

    // Wait for async body processing (clone().text().then(...))
    await new Promise((r) => setTimeout(r, 50));

    expect(onSubtitle).toHaveBeenCalledTimes(1);
    const payload: InterceptedPayload = onSubtitle.mock.calls[0][0];
    expect(payload.url).toBe("https://example.com/api/timedtext");
    expect(payload.method).toBe("fetch");
    expect(payload.text).toBe("Captured subtitle");
    expect(typeof payload.timestamp).toBe("number");

    interceptor.destroy();
  });

  it("does NOT capture when URL does not match any pattern", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["timedtext"],
      onSubtitle,
    });

    setupFetchMock(JSON.stringify({ text: "Should not capture" }));

    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://example.com/api/other");

    await new Promise((r) => setTimeout(r, 50));

    expect(onSubtitle).not.toHaveBeenCalled();

    interceptor.destroy();
  });

  it("string pattern uses includes() semantics", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["subtitle"],
      onSubtitle,
    });

    setupFetchMock("Matched subtitle content", "text/plain");

    // URL contains "subtitle" somewhere in the middle
    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://cdn.example.com/subtitle/v1/captions");

    await new Promise((r) => setTimeout(r, 50));

    expect(onSubtitle).toHaveBeenCalledTimes(1);

    interceptor.destroy();
  });
});

describe("URL pattern matching (RegExp patterns)", () => {
  it("captures when URL matches a RegExp pattern", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: [/\/api\/timedtext\?/],
      onSubtitle,
    });

    setupFetchMock(JSON.stringify({ text: "Regex matched" }));

    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://youtube.com/api/timedtext?v=abc123");

    await new Promise((r) => setTimeout(r, 50));

    expect(onSubtitle).toHaveBeenCalledTimes(1);

    interceptor.destroy();
  });

  it("does NOT capture when URL does not match RegExp", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: [/^https:\/\/youtube\.com\/timedtext/],
      onSubtitle,
    });

    setupFetchMock(JSON.stringify({ text: "No match" }));

    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://bilibili.com/timedtext");

    await new Promise((r) => setTimeout(r, 50));

    expect(onSubtitle).not.toHaveBeenCalled();

    interceptor.destroy();
  });
});

describe("buffer behavior", () => {
  it("populates buffer after successful fetch capture", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["timedtext"],
      onSubtitle,
    });

    setupFetchMock(
      "WEBVTT\n\n00:00:01 --> 00:00:05\nBuffer test",
      "text/vtt",
    );

    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://example.com/timedtext");

    await new Promise((r) => setTimeout(r, 50));

    const buffer = interceptor.getBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0].text).toContain("Buffer test");

    interceptor.destroy();
  });

  it("getBuffer returns a copy, not a reference", () => {
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["test"],
      onSubtitle: vi.fn(),
    });

    const buffer1 = interceptor.getBuffer();
    const buffer2 = interceptor.getBuffer();

    // They should be equal but not the same reference
    expect(buffer1).toEqual(buffer2);
    expect(buffer1).not.toBe(buffer2);

    interceptor.destroy();
  });

  it("buffer is empty after destroy()", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["timedtext"],
      onSubtitle,
    });

    setupFetchMock(JSON.stringify({ text: "To be cleared" }));

    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://example.com/timedtext");

    await new Promise((r) => setTimeout(r, 50));

    expect(interceptor.getBuffer()).toHaveLength(1);

    interceptor.destroy();
    expect(interceptor.getBuffer()).toEqual([]);
  });
});

describe("multiple patterns", () => {
  it("matches when URL matches any one of several patterns", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: ["timedtext", "aisubtitle", "caption"],
      onSubtitle,
    });

    setupFetchMock("Bilibili subtitle", "text/plain");

    // URL matches "aisubtitle" pattern
    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://aisubtitle.hdslb.com/bfs/subtitle/abc.json");

    await new Promise((r) => setTimeout(r, 50));

    expect(onSubtitle).toHaveBeenCalledTimes(1);

    interceptor.destroy();
  });

  it("accepts empty pattern list without side effects", async () => {
    const onSubtitle = vi.fn();
    const interceptor = createNetworkInterceptor({
      urlPatterns: [],
      onSubtitle,
    });

    setupFetchMock("Should not match anything", "text/plain");

    await (
      globalThis as unknown as { window: { fetch: typeof fetch } }
    ).window.fetch("https://example.com/timedtext");

    await new Promise((r) => setTimeout(r, 50));

    expect(onSubtitle).not.toHaveBeenCalled();
    expect(interceptor.getBuffer()).toEqual([]);

    interceptor.destroy();
  });
});
