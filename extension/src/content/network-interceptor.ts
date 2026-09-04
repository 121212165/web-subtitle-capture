/**
 * Network interceptor for subtitle data.
 *
 * Monkey-patches fetch, XHR, WebSocket, and EventSource in the content script
 * context to capture network responses that contain subtitle data. Runs
 * alongside the existing DOM-based capture pipeline.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InterceptedPayload {
  text: string;
  url: string;
  method: "fetch" | "xhr" | "ws" | "es";
  contentType?: string;
  timestamp: number;
  raw?: unknown;
}

export interface InterceptorConfig {
  urlPatterns: Array<string | RegExp>;
  onSubtitle: (data: InterceptedPayload) => void;
  maxBuffer?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BUFFER = 200;

function matchesAnyPattern(url: string, patterns: Array<string | RegExp>): boolean {
  for (const pattern of patterns) {
    try {
      if (typeof pattern === "string") {
        if (url.includes(pattern)) return true;
      } else if (pattern.test(url)) {
        return true;
      }
    } catch {
      // Malformed pattern -- skip silently
    }
  }
  return false;
}

function tryParseSubtitleText(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;

  // Try JSON first -- many APIs return subtitle data wrapped in JSON.
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;

    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      // Common subtitle JSON shapes
      const candidates = ["text", "content", "subtitle", "captions", "data", "body"];
      for (const key of candidates) {
        if (typeof obj[key] === "string" && (obj[key] as string).length > 0) {
          return obj[key] as string;
        }
      }
      // Nested: { data: { text: "..." } } or { events: [...] }
      if (Array.isArray(obj.events)) {
        const lines: string[] = [];
        for (const evt of obj.events) {
          if (evt && typeof evt === "object" && typeof (evt as Record<string, unknown>).segs === "object") {
            const segs = (evt as Record<string, unknown>).segs as Array<Record<string, unknown>>;
            for (const seg of segs) {
              if (typeof seg.utf8 === "string") lines.push(seg.utf8);
            }
          }
        }
        if (lines.length > 0) return lines.join("");
      }
    }
  } catch {
    // Not JSON -- fall through to treat raw text as subtitle candidate
  }

  // WebVTT / SRT detection
  if (/^WEBVTT/m.test(trimmed) || /^\d+\s*\n\d{2}:\d{2}/m.test(trimmed)) {
    return trimmed;
  }

  // XML / TTML detection
  if (/<tt[\s>]/i.test(trimmed) || /<transcript/i.test(trimmed)) {
    return trimmed;
  }

  // Plain text fallback: accept if it looks like short subtitle lines
  // (no extremely long payloads that are clearly not subtitles).
  if (trimmed.length < 50000 && trimmed.split("\n").length > 0) {
    return trimmed;
  }

  return null;
}

// ---------------------------------------------------------------------------
// NetworkInterceptor
// ---------------------------------------------------------------------------

export function createNetworkInterceptor(
  config: InterceptorConfig,
): { destroy(): void; getBuffer(): InterceptedPayload[] } {
  const { urlPatterns, onSubtitle, maxBuffer = DEFAULT_MAX_BUFFER } = config;
  const buffer: InterceptedPayload[] = [];

  let destroyed = false;

  function pushAndNotify(payload: InterceptedPayload): void {
    if (destroyed) return;

    buffer.push(payload);
    if (buffer.length > maxBuffer) {
      buffer.splice(0, buffer.length - maxBuffer);
    }

    try {
      onSubtitle(payload);
    } catch {
      // Callback errors must never break interception
    }
  }

  function handleResponseBody(
    url: string,
    method: InterceptedPayload["method"],
    body: string,
    contentType?: string,
    raw?: unknown,
  ): void {
    if (!matchesAnyPattern(url, urlPatterns)) return;

    try {
      const text = tryParseSubtitleText(body);
      if (text !== null) {
        pushAndNotify({
          text,
          url,
          method,
          contentType,
          timestamp: Date.now(),
          raw,
        });
      }
    } catch {
      // Parsing failure -- silently ignore
    }
  }

  // -----------------------------------------------------------------------
  // 1. Fetch interception
  // -----------------------------------------------------------------------

  const originalFetch = window.fetch;

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

    try {
      const response = await originalFetch.call(window, input, init);

      // Only inspect responses that match subtitle URL patterns
      if (!matchesAnyPattern(url, urlPatterns)) {
        return response;
      }

      try {
        const clone = response.clone();
        clone.text().then((body) => {
          try {
            const ct = response.headers.get("content-type") ?? undefined;
            handleResponseBody(url, "fetch", body, ct);
          } catch {
            // Ignore body processing errors
          }
        }).catch(() => {
          // clone.text() can fail on opaque or consumed responses
        });
      } catch {
        // clone() can throw on already-consumed responses
      }

      return response;
    } catch (err) {
      // Original fetch threw -- rethrow so page behaviour is unchanged
      throw err;
    }
  };

  // -----------------------------------------------------------------------
  // 2. XHR interception
  // -----------------------------------------------------------------------

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function interceptedOpen(
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ): void {
    // Store the resolved URL on the instance for use in send/load
    (this as unknown as Record<string, unknown>).__interceptUrl =
      typeof url === "string" ? url : url.href;

    return originalXhrOpen.call(
      this,
      method,
      url,
      async,
      username ?? null,
      password ?? null,
    );
  };

  XMLHttpRequest.prototype.send = function interceptedSend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const self = this;
    const requestUrl =
      (self as unknown as Record<string, unknown>).__interceptUrl as string | undefined;

    if (requestUrl && matchesAnyPattern(requestUrl, urlPatterns)) {
      const originalOnLoad = self.onload;

      self.addEventListener(
        "load",
        function onLoadInterceptor() {
          try {
            const responseText = self.responseText;
            if (typeof responseText === "string" && responseText.length > 0) {
              const ct = self.getResponseHeader("content-type") ?? undefined;
              handleResponseBody(requestUrl, "xhr", responseText, ct);
            }
          } catch {
            // Response text may be unavailable for certain response types
          }
        },
        { once: true },
      );

      // Also respect any existing onload assignment
      if (typeof originalOnLoad === "function") {
        self.addEventListener("load", originalOnLoad, { once: true });
      }
    }

    return originalXhrSend.call(this, body);
  };

  // -----------------------------------------------------------------------
  // 3. WebSocket interception
  // -----------------------------------------------------------------------

  const OriginalWebSocket = window.WebSocket;

  const InterceptedWebSocket = function InterceptedWebSocketConstructor(
    url: string | URL,
    protocols?: string | string[],
  ) {
    const wsUrl = typeof url === "string" ? url : url.href;
    const instance = protocols !== undefined
      ? new OriginalWebSocket(url, protocols)
      : new OriginalWebSocket(url);

    if (matchesAnyPattern(wsUrl, urlPatterns)) {
      const originalOnMessage = Object.getOwnPropertyDescriptor(
        instance,
        "onmessage",
      );

      // We intercept via addEventListener so the original onmessage setter still works
      instance.addEventListener("message", (event: MessageEvent) => {
        try {
          const data = typeof event.data === "string" ? event.data : String(event.data);
          handleResponseBody(wsUrl, "ws", data, undefined, event.data);
        } catch {
          // Silently ignore
        }
      });
    }

    return instance;
  } as unknown as typeof WebSocket;

  // Preserve prototype chain and static properties
  InterceptedWebSocket.prototype = OriginalWebSocket.prototype;
  Object.defineProperty(InterceptedWebSocket, "name", {
    value: "WebSocket",
    configurable: true,
  });
  Object.defineProperty(InterceptedWebSocket, "CONNECTING", {
    value: OriginalWebSocket.CONNECTING,
  });
  Object.defineProperty(InterceptedWebSocket, "OPEN", {
    value: OriginalWebSocket.OPEN,
  });
  Object.defineProperty(InterceptedWebSocket, "CLOSING", {
    value: OriginalWebSocket.CLOSING,
  });
  Object.defineProperty(InterceptedWebSocket, "CLOSED", {
    value: OriginalWebSocket.CLOSED,
  });

  (window as unknown as Record<string, unknown>).WebSocket = InterceptedWebSocket;

  // -----------------------------------------------------------------------
  // 4. EventSource interception
  // -----------------------------------------------------------------------

  const OriginalEventSource = window.EventSource;

  const InterceptedEventSource = function InterceptedEventSourceConstructor(
    url: string | URL,
    eventSourceInitDict?: EventSourceInit,
  ) {
    const esUrl = typeof url === "string" ? url : url.href;
    const instance = eventSourceInitDict !== undefined
      ? new OriginalEventSource(url, eventSourceInitDict)
      : new OriginalEventSource(url);

    if (matchesAnyPattern(esUrl, urlPatterns)) {
      instance.addEventListener("message", (event: MessageEvent) => {
        try {
          const data = typeof event.data === "string" ? event.data : String(event.data);
          handleResponseBody(esUrl, "es", data, undefined, event.data);
        } catch {
          // Silently ignore
        }
      });
    }

    return instance;
  } as unknown as typeof EventSource;

  InterceptedEventSource.prototype = OriginalEventSource.prototype;
  Object.defineProperty(InterceptedEventSource, "name", {
    value: "EventSource",
    configurable: true,
  });
  Object.defineProperty(InterceptedEventSource, "CONNECTING", {
    value: OriginalEventSource.CONNECTING,
  });
  Object.defineProperty(InterceptedEventSource, "OPEN", {
    value: OriginalEventSource.OPEN,
  });
  Object.defineProperty(InterceptedEventSource, "CLOSED", {
    value: OriginalEventSource.CLOSED,
  });

  (window as unknown as Record<string, unknown>).EventSource = InterceptedEventSource;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    try {
      window.fetch = originalFetch;
    } catch {
      // Window may be in an unexpected state
    }

    try {
      XMLHttpRequest.prototype.open = originalXhrOpen;
      XMLHttpRequest.prototype.send = originalXhrSend;
    } catch {
      // Ignore
    }

    try {
      (window as unknown as Record<string, unknown>).WebSocket = OriginalWebSocket;
    } catch {
      // Ignore
    }

    try {
      (window as unknown as Record<string, unknown>).EventSource = OriginalEventSource;
    } catch {
      // Ignore
    }

    buffer.length = 0;
  }

  function getBuffer(): InterceptedPayload[] {
    return [...buffer];
  }

  return { destroy, getBuffer };
}
