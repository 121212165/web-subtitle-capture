// Background service worker
// Manages tab sessions and coordinates with local server

const SERVER = "http://localhost:3210";

// Audio capture state
const audioCaptures = new Map(); // tabId -> { sessionId, tabTitle }

async function ensureOffscreenDocument() {
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Capture tab audio for subtitle transcription"
    });
  } catch (e) {
    // Already exists — ignore
    if (!e.message?.includes("already exists")) {
      console.error("[background] Failed to create offscreen document:", e);
    }
  }
}

function generateSessionId(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return "tab-" + Math.abs(hash).toString(36);
}

// Clean up session when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const capture = audioCaptures.get(tabId);
  if (capture) {
    chrome.runtime.sendMessage({ action: "stopAudioCapture", tabId }).catch(() => {});
    try {
      await fetch(`${SERVER}/api/session/${capture.sessionId}`, { method: "DELETE" });
    } catch (err) {
      console.debug("[background] Session cleanup failed:", err);
    }
    audioCaptures.delete(tabId);
  }
  console.debug(`[background] Tab ${tabId} closed`);
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getSessions") {
    fetch(`${SERVER}/api/sessions`)
      .then((res) => res.json())
      .then((data) => sendResponse(data))
      .catch((err) => {
        console.debug("[background] getSessions failed:", err);
        sendResponse({ sessions: [] });
      });
    return true;
  }

  if (msg.action === "health") {
    fetch(`${SERVER}/api/health`)
      .then((res) => res.json())
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((err) => {
        console.debug("[background] health check failed:", err);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (msg.action === "captureAll") {
    // Send start to all tabs
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith("chrome://")) {
          chrome.tabs.sendMessage(tab.id, { action: "start" }).catch(
            (err) => console.debug("[background] captureAll: failed for tab", tab.id, err)
          );
        }
      }
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === "stopAll") {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith("chrome://")) {
          chrome.tabs.sendMessage(tab.id, { action: "stop" }).catch(
            (err) => console.debug("[background] stopAll: failed for tab", tab.id, err)
          );
        }
      }
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === "startAudioCapture") {
    (async () => {
      try {
        const tab = await chrome.tabs.get(msg.tabId);
        await ensureOffscreenDocument();
        const sessionId = generateSessionId(tab.url);
        audioCaptures.set(msg.tabId, { sessionId, tabTitle: tab.title });

        chrome.runtime.sendMessage({
          action: "startAudioCapture",
          tabId: msg.tabId,
          sessionId,
          serverUrl: SERVER,
          tabTitle: tab.title
        }).catch((err) => console.debug("[background] offscreen sendMessage failed:", err));

        fetch(`${SERVER}/api/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, tabTitle: tab.title, platform: "audio" })
        }).catch((err) => console.debug("[background] session registration failed:", err));

        sendResponse({ ok: true, sessionId });
      } catch (err) {
        console.error("[background] startAudioCapture error:", err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "stopAudioCapture") {
    (async () => {
      const capture = audioCaptures.get(msg.tabId);
      if (capture) {
        chrome.runtime.sendMessage({ action: "stopAudioCapture", tabId: msg.tabId }).catch(() => {});
        try {
          await fetch(`${SERVER}/api/session/${capture.sessionId}`, { method: "DELETE" });
        } catch (err) {
          console.debug("[background] session delete failed:", err);
        }
        audioCaptures.delete(msg.tabId);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "getAudioCaptureStatus") {
    const status = {};
    audioCaptures.forEach((val, key) => {
      status[key] = val;
    });
    sendResponse(status);
    return;
  }
});
