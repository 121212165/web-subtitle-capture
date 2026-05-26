// Background service worker
// Manages tab sessions and coordinates with local server

const SERVER = "http://localhost:3210";

// Clean up session when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // The content script handles its own cleanup via beforeunload
  console.log(`[background] Tab ${tabId} closed`);
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getSessions") {
    fetch(`${SERVER}/api/sessions`)
      .then((res) => res.json())
      .then((data) => sendResponse(data))
      .catch(() => sendResponse({ sessions: [] }));
    return true;
  }

  if (msg.action === "health") {
    fetch(`${SERVER}/api/health`)
      .then((res) => res.json())
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.action === "captureAll") {
    // Send start to all tabs
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith("chrome://")) {
          chrome.tabs.sendMessage(tab.id, { action: "start" }).catch(() => {});
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
          chrome.tabs.sendMessage(tab.id, { action: "stop" }).catch(() => {});
        }
      }
    });
    sendResponse({ ok: true });
    return;
  }
});
