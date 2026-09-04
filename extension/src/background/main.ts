import { SERVER_URL } from "../shared/constants.js";
import type { SessionsResponse, HealthResponse } from "../shared/types.js";

const tabSessions = new Map<number, string>();

// --- Offscreen document management ---

async function ensureOffscreen(): Promise<void> {
  try {
    const exists = await chrome.offscreen.hasDocument();
    console.log("[background] offscreen exists:", exists);
    if (!exists) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["AUDIO_PLAYBACK" as chrome.offscreen.Reason],
        justification: "Record tab audio for ASR transcription",
      });
      console.log("[background] offscreen document created");
    }
  } catch (err) {
    console.warn("[background] offscreen error:", err);
  }
}

async function startTabAudioCapture(tabId: number, sessionId: string): Promise<boolean> {
  console.log("[background] startTabAudioCapture", { tabId, sessionId });

  try {
    // Get a stream ID that the offscreen document can use
    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      });
    });
    console.log("[background] Got streamId:", streamId ? "ok" : "empty");

    await ensureOffscreen();
    console.log("[background] Offscreen document ready");

    const response = (await chrome.runtime.sendMessage({
      action: "offscreen-start",
      streamId,
      sessionId,
    })) as { ok: boolean; error?: string };

    console.log("[background] Offscreen response:", response);
    return response?.ok ?? false;
  } catch (err) {
    console.error("[background] tabCapture failed:", err);
    return false;
  }
}

async function stopTabAudioCapture(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ action: "offscreen-stop" });
  } catch {
    // offscreen might not exist
  }
}

// --- Tab lifecycle ---

chrome.tabs.onRemoved.addListener((tabId) => {
  const sessionId = tabSessions.get(tabId);
  if (sessionId) {
    fetch(`${SERVER_URL}/api/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
    tabSessions.delete(tabId);
    stopTabAudioCapture();
  }
});

// --- ASR result relay ---

chrome.runtime.onMessage.addListener(
  (
    msg: { action: string; text?: string; sessionId?: string; tabId?: number },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    // Relay ASR results from offscreen to content script
    if (msg.action === "asrResult" && msg.text && msg.sessionId) {
      // Send to all tabs that match this session
      for (const [tabId, sid] of tabSessions) {
        if (sid === msg.sessionId) {
          chrome.tabs.sendMessage(tabId, { action: "asrResult", text: msg.text }).catch(() => {});
        }
      }
      sendResponse({ ok: true });
      return false;
    }

    // Start tab audio capture for a specific tab
    if (msg.action === "startTabCapture" && msg.tabId && msg.sessionId) {
      console.log("[background] startTabCapture requested", { tabId: msg.tabId, sessionId: msg.sessionId });
      startTabAudioCapture(msg.tabId, msg.sessionId).then((ok) => {
        console.log("[background] startTabCapture result:", ok);
        if (ok) tabSessions.set(msg.tabId!, msg.sessionId!);
        sendResponse({ ok });
      }).catch((err) => {
        console.error("[background] startTabCapture error:", err);
        sendResponse({ ok: false, error: String(err) });
      });
      return true;
    }

    // Stop tab audio capture
    if (msg.action === "stopTabCapture") {
      stopTabAudioCapture().then(() => sendResponse({ ok: true }));
      return true;
    }

    // --- Original handlers ---

    if (msg.action === "getSessions") {
      fetch(`${SERVER_URL}/api/sessions`)
        .then((res) => res.json() as Promise<SessionsResponse>)
        .then((data) => sendResponse(data))
        .catch(() => sendResponse({ success: false, sessions: [] }));
      return true;
    }

    if (msg.action === "health") {
      fetch(`${SERVER_URL}/api/health`)
        .then((res) => res.json() as Promise<HealthResponse>)
        .then((data) => sendResponse({ ok: true, ...data }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (msg.action === "captureAll") {
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          if (tab.id && tab.url && !tab.url.startsWith("chrome://")) {
            chrome.tabs.sendMessage(tab.id, { action: "start" }).catch(() => {});
          }
        }
      });
      sendResponse({ ok: true });
      return false;
    }

    if (msg.action === "stopAll") {
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          if (tab.id && tab.url && !tab.url.startsWith("chrome://")) {
            chrome.tabs.sendMessage(tab.id, { action: "stop" }).catch(() => {});
          }
        }
      });
      stopTabAudioCapture().then(() => sendResponse({ ok: true }));
      return true;
    }

    return false;
  },
);
