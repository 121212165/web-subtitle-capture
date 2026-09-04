import {
  SERVER_URL,
  POLL_INTERVAL_ACTIVE,
  POLL_INTERVAL_IDLE,
  IDLE_THRESHOLD,
  DEBOUNCE_MS,
  DEDUP_MIN_INTERVAL_MS,
  DEDUP_REPEAT_WINDOW_MS,
  DEDUP_SHORT_TEXT_LENGTH,
  DEDUP_SLIDING_WINDOW_SIZE,
} from "../shared/constants.js";
import { detectPlatform } from "../shared/platform-detector.js";
import { createNetworkInterceptor } from "./network-interceptor.js";
import { createAudioCapture } from "./audio-capture.js";
import { getUrlPatterns, adapters } from "../shared/api-adapters/index.js";
import { parseSubtitles } from "../shared/subtitle-parser.js";
import { ENABLE_API_CAPTURE, API_INTERCEPT_MAX_BUFFER } from "../shared/constants.js";
import type { PlatformConfig, SubtitlePayload, CaptureStatus, InterceptedPayload } from "../shared/types.js";

let sessionId: string | null = null;
let observer: MutationObserver | null = null;
let networkInterceptor: { destroy(): void } | null = null;
let audioCapture: { start(): Promise<boolean>; stop(): void } | null = null;
let audioCaptureActive = false;
let lastText = "";
let pollInterval: ReturnType<typeof setInterval> | null = null;
let pollIntervalMs = POLL_INTERVAL_ACTIVE;
let idleCount = 0;

// --- SubtitleDedup ---
class SubtitleDedup {
  private lastText = "";
  private lastSentAt = 0;
  private recentTexts: string[] = [];

  shouldSend(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const now = Date.now();

    if (text === this.lastText) {
      return now - this.lastSentAt > DEDUP_REPEAT_WINDOW_MS;
    }

    if (text.length < DEDUP_SHORT_TEXT_LENGTH && this.recentTexts.includes(text)) {
      return false;
    }

    if (now - this.lastSentAt < DEDUP_MIN_INTERVAL_MS) {
      return false;
    }

    this.lastText = text;
    this.lastSentAt = now;
    this.recentTexts = [...this.recentTexts.slice(-(DEDUP_SLIDING_WINDOW_SIZE - 1)), text];
    return true;
  }
}

const dedup = new SubtitleDedup();

// --- Subtitle extraction ---
function findSubtitleElements(platform: PlatformConfig): Element[] {
  const selectors = platform.selectors;
  const genericSelectors = detectPlatform("generic").selectors;
  const allSelectors = platform.id === "generic" ? selectors : [...selectors, ...genericSelectors];

  for (const selector of allSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        return Array.from(elements).filter((el) => {
          const text = el.textContent?.trim();
          return text && text.length > 0 && text.length < 2000;
        });
      }
    } catch {
      // selector error, try next
    }
  }
  return [];
}

function extractText(elements: Element[]): string {
  return elements
    .map((el) => el.textContent?.trim())
    .filter((t): t is string => !!t && t.length > 0)
    .join("\n");
}

function getWebVTTText(): string {
  const tracks = document.querySelectorAll("track[kind='subtitles'], track[kind='captions']");
  if (tracks.length === 0) return "";
  const video = document.querySelector("video");
  if (!video || !video.textTracks) return "";

  let text = "";
  for (let i = 0; i < video.textTracks.length; i++) {
    const track = video.textTracks[i];
    if (track.mode === "showing") {
      for (let j = 0; j < track.cues!.length; j++) {
        const cue = track.cues![j] as VTTCue;
        if (video.currentTime >= cue.startTime && video.currentTime <= cue.endTime) {
          text += cue.text + "\n";
        }
      }
    }
  }
  return text.trim();
}

// --- Network ---
async function sendSubtitle(text: string): Promise<void> {
  if (!dedup.shouldSend(text)) return;
  lastText = text;

  try {
    await fetch(`${SERVER_URL}/api/subtitle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        text,
        tabTitle: document.title,
        platform: detectPlatform(window.location.hostname).id,
        timestamp: Date.now(),
      } as SubtitlePayload),
    });
  } catch (err) {
    console.warn("[SubtitleCapture] Server not reachable:", (err as Error).message);
  }
}

async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// --- Capture lifecycle ---
async function startCapture(): Promise<void> {
  if (observer) return;

  const serverOk = await checkServer();
  if (!serverOk) {
    console.log("[SubtitleCapture] Server not running. Start the local server first.");
    return;
  }

  const platform = detectPlatform(window.location.hostname);

  // Request session from server (server generates sessionId)
  try {
    const res = await fetch(`${SERVER_URL}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tabTitle: document.title,
        platform: platform.id,
      }),
    });
    const data = await res.json();
    sessionId = data.sessionId;
  } catch {
    sessionId = crypto.randomUUID();
  }

  console.log(`[SubtitleCapture] Started (${platform.id}) session: ${sessionId}`);

  // MutationObserver with debounce
  let debounceTimer: ReturnType<typeof setTimeout>;
  observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const elements = findSubtitleElements(platform);
      const text = extractText(elements);
      if (text) sendSubtitle(text);
    }, DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Network API capture (parallel to DOM capture)
  if (ENABLE_API_CAPTURE) {
    try {
      const platformId = detectPlatform(window.location.hostname).id;
      networkInterceptor = createNetworkInterceptor({
        urlPatterns: getUrlPatterns(),
        maxBuffer: API_INTERCEPT_MAX_BUFFER,
        onSubtitle: (data: InterceptedPayload) => {
          try {
            const adapter = adapters.find(a => a.id === platformId) ?? adapters[adapters.length - 1];
            const lines = adapter.parseResponse(data.url, data.raw ?? data.text);
            if (lines.length > 0) {
              sendSubtitle(lines.join("\n"));
            }
          } catch {
            // fallback: try sending raw text
            if (data.text && data.text.trim().length > 0) {
              sendSubtitle(data.text);
            }
          }
        },
      });
      console.log(`[SubtitleCapture] Network interceptor installed (${platformId})`);
    } catch (err) {
      console.warn("[SubtitleCapture] Failed to install network interceptor:", err);
      // DOM capture continues unaffected
    }
  }

  // WebVTT polling with dynamic interval
  pollInterval = setInterval(() => {
    const vttText = getWebVTTText();
    if (vttText) {
      sendSubtitle(vttText);
      idleCount = 0;
      pollIntervalMs = POLL_INTERVAL_ACTIVE;
    } else {
      idleCount++;
      if (idleCount > IDLE_THRESHOLD) {
        pollIntervalMs = POLL_INTERVAL_IDLE;
      }
    }
  }, pollIntervalMs);

  // Initial scan
  const elements = findSubtitleElements(platform);
  const text = extractText(elements);
  if (text) sendSubtitle(text);

  // Audio ASR fallback — use Chrome tabCapture via background + offscreen
  if (elements.length === 0) {
    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log("[SubtitleCapture] Current tab:", currentTab?.id, currentTab?.title);
      if (currentTab?.id) {
        console.log("[SubtitleCapture] Requesting tabCapture for tab", currentTab.id);
        const resp = (await chrome.runtime.sendMessage({
          action: "startTabCapture",
          tabId: currentTab.id,
          sessionId: sessionId!,
        })) as { ok: boolean; error?: string };
        console.log("[SubtitleCapture] tabCapture response:", resp);
        if (resp?.ok) {
          audioCaptureActive = true;
          console.log("[SubtitleCapture] Tab audio capture active (ASR via tabCapture)");
        } else {
          console.warn("[SubtitleCapture] tabCapture failed:", resp?.error);
        }
      } else {
        console.warn("[SubtitleCapture] Could not get current tab ID");
      }
    } catch (err) {
      console.warn("[SubtitleCapture] Tab capture error:", err);
    }
  }
}

function stopCapture(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (networkInterceptor) {
    networkInterceptor.destroy();
    networkInterceptor = null;
  }
  if (audioCapture) {
    audioCapture.stop();
    audioCapture = null;
  }
  if (audioCaptureActive) {
    chrome.runtime.sendMessage({ action: "stopTabCapture" }).catch(() => {});
    audioCaptureActive = false;
  }
  if (sessionId) {
    fetch(`${SERVER_URL}/api/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
    sessionId = null;
  }
  lastText = "";
  idleCount = 0;
  pollIntervalMs = POLL_INTERVAL_ACTIVE;
  console.log("[SubtitleCapture] Stopped");
}

// --- Message handling ---
chrome.runtime.onMessage.addListener(
  (
    msg: { action: string; text?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (msg.action === "start") {
      startCapture().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.action === "stop") {
      stopCapture();
      sendResponse({ ok: true });
      return false;
    }
    if (msg.action === "status") {
      sendResponse({
        running: !!observer || audioCaptureActive,
        sessionId,
        platform: detectPlatform(window.location.hostname).id,
        url: window.location.href,
        title: document.title,
      } as CaptureStatus);
      return false;
    }
    // Receive ASR transcript from background (relayed from offscreen)
    if (msg.action === "asrResult" && msg.text) {
      sendSubtitle(msg.text);
      return false;
    }
    return false;
  },
);

// --- Auto-start ---
setTimeout(async () => {
  const platform = detectPlatform(window.location.hostname);
  const elements = findSubtitleElements(platform);
  if (elements.length > 0) {
    console.log("[SubtitleCapture] Subtitles detected, auto-starting capture...");
    await startCapture();
  }
}, 2000);
