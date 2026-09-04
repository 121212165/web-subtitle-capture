# Spec: Web API Subtitle Capture Pipeline

## Problem

Current implementation only captures subtitles visible in the DOM (MutationObserver + WebVTT). Many platforms deliver subtitle data through network APIs that never appear as DOM elements:

- **WebSocket streams** (live captioning APIs like Azure/Google STT proxy)
- **SSE / EventSource** (streaming transcript endpoints)
- **XHR/fetch responses** (REST APIs returning subtitle JSON/XML)
- **MediaSource API** (embedded subtitle tracks in HLS/DASH)

Users lose subtitles that exist in the network layer but never reach the DOM.

## Goal

Add a network-interception layer (`NetworkSubtitleInterceptor`) that runs alongside the existing DOM capture, detects API responses containing subtitle data, normalizes them, and feeds into the same `sendSubtitle()` pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Content Script                         │
│                                                          │
│  ┌──────────────────┐    ┌─────────────────────────────┐│
│  │  DOM Capture      │    │  Network Interceptor        ││
│  │  (existing)       │    │  (NEW)                      ││
│  │                   │    │                             ││
│  │  MutationObserver │    │  fetch() monkey-patch       ││
│  │  WebVTT polling   │    │  XMLHttpRequest override    ││
│  │                   │    │  WebSocket proxy            ││
│  └────────┬──────────┘    │  EventSource intercept      ││
│           │               └────────────┬────────────────┘│
│           │                            │                 │
│           ▼                            ▼                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │              SubtitleDedup (existing)               │  │
│  │              sendSubtitle() pipeline                │  │
│  └────────────────────┬───────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────┘
                        │  HTTP POST /api/subtitle
                        ▼
              ┌──────────────────┐
              │  Local Server    │
              │  (unchanged)     │
              └──────────────────┘
```

## API Detection Strategy

### Layer 1: fetch/XHR Interception (content script level)

Monkey-patch `window.fetch` and `XMLHttpRequest.prototype.open/send` in the content script to intercept responses. Filter by:

1. **URL patterns** per platform (e.g., YouTube timedtext API, Bilibili subtitle API)
2. **Content-Type** headers (`application/json`, `text/vtt`, `application/ttml+xml`)
3. **Response body heuristics** — contains subtitle-like structures (timestamps + text)

### Layer 2: WebSocket Interception

Proxy `WebSocket.prototype.send/onmessage` to detect real-time subtitle streams:

1. Track WS connections to known subtitle endpoints
2. Parse incoming messages for subtitle JSON structures
3. Buffer and deduplicate before forwarding

### Layer 3: Platform-Specific API Adapters

Each platform gets an API adapter that knows its specific subtitle endpoints:

| Platform | API Pattern | Format |
|----------|-------------|--------|
| YouTube | `/api/timedtext` | JSON3 / srv3 |
| Bilibili | `/x/player/wbi/v2` subtitle URL | JSON (ai_subtitle) |
| Feishu | `/open-apis/vc/` caption stream | WebSocket JSON |
| Xiaoe-tech | Video.js texttrack API | WebVTT |
| Generic | URL contains `subtitle`, `caption`, `transcript` | Auto-detect |

## New Files

```
extension/src/
├── content/
│   ├── main.ts                          # MODIFY: boot interceptor alongside DOM capture
│   └── network-interceptor.ts           # NEW: fetch/XHR/WS/ES proxy layer
├── shared/
│   ├── subtitle-parser.ts              # NEW: normalize API responses to text lines
│   └── api-adapters/
│       ├── index.ts                    # NEW: adapter registry
│       ├── types.ts                    # NEW: adapter interface
│       ├── youtube-api.ts             # NEW: YouTube timedtext API
│       ├── bilibili-api.ts            # NEW: Bilibili subtitle API
│       ├── feishu-api.ts              # NEW: Feishu caption stream
│       └── generic-api.ts             # NEW: heuristic detection
```

## API Response Normalization

All intercepted subtitle data flows through `SubtitleParser.normalize()`:

```typescript
interface NormalizedSubtitle {
  text: string;
  startTime?: number;  // ms, optional for streaming
  endTime?: number;    // ms, optional
  source: 'dom' | 'api-fetch' | 'api-ws' | 'api-sse';
  platform: string;
}
```

The parser handles: JSON3, srv3, WebVTT, TTML, plain text with timestamps, and raw streaming chunks.

## Deduplication Extension

The existing `SubtitleDedup` class gets extended with a `source` field to prevent cross-source duplicates. DOM-captured and API-captured text for the same subtitle line should not both be written.

## Server Changes

None. The server already accepts `{ sessionId, text, tabTitle, platform }` and doesn't care about the capture source.

## Content Script Lifecycle

```
page load
  ├─ 2s delay (existing)
  ├─ DOM scan (existing)
  │   └─ if subtitles found → start DOM capture
  ├─ Network interceptor install (NEW, runs immediately)
  │   └─ monkey-patch fetch/XHR/WS
  └─ API adapter selection (NEW, based on platform)
      └─ register URL patterns + response parsers

subtitle arrives via API
  ├─ interceptor catches response
  ├─ adapter parses to NormalizedSubtitle[]
  ├─ SubtitleDedup.shouldSend() (extended)
  └─ sendSubtitle() (existing pipeline)
```

## Testing Strategy

### Unit Tests
- `subtitle-parser.test.ts`: JSON3, WebVTT, TTML, streaming chunk normalization
- `network-interceptor.test.ts`: fetch/XHR proxy correctness, cleanup
- `api-adapters/*.test.ts`: per-platform URL matching + response parsing
- Extended `dedup.test.ts`: cross-source dedup scenarios

### Integration Tests
- Mock server receiving subtitles from both DOM + API sources
- Verify no duplicate lines when both sources capture same subtitle
- Verify cleanup on tab close (interceptor teardown)

### E2E
- Load extension on YouTube video with captions → verify API subtitles captured
- Load extension on Bilibili video → verify API subtitles captured

## Migration Safety

- Feature-gated behind `ENABLE_API_CAPTURE` constant (default: true)
- If interceptor install fails, DOM capture continues unaffected
- All new code in separate files, zero changes to existing `writer.ts`, `sessions.ts`, `index.ts`
- `content/main.ts` gets ~15 lines of new boot code

## Performance Constraints

- Interceptor overhead < 1ms per intercepted request (filter early, parse lazily)
- Max 200 intercepted requests buffered per tab (prevent memory leak)
- WebSocket messages: process async, never block the real handler
- Idle interceptor (no subtitle matches for 60s) reduces polling frequency

## Config

New constants in `shared/constants.ts`:

```typescript
export const ENABLE_API_CAPTURE = true;
export const API_INTERCEPT_MAX_BUFFER = 200;
export const API_IDLE_TIMEOUT_MS = 60_000;
```
