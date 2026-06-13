// Background service worker
// Manages tab sessions and coordinates with local server

const SERVER = "http://localhost:3210";

// Clean up session when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
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
});
