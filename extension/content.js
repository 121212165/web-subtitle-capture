// Web Subtitle Capture — Content Script
// Monitors subtitle elements on video pages and sends text to local server

(() => {
  const SERVER = "http://localhost:3210";
  let sessionId = null;
  let observer = null;
  let lastText = "";
  let pollInterval = null;

  // Generate session ID from tab URL
  function generateSessionId() {
    const url = window.location.href;
    const hash = Array.from(url).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    return `tab-${Math.abs(hash).toString(36)}`;
  }

  // detectPlatform is provided by platform.js (shared with popup.js)

  // Subtitle selectors by platform
  const SELECTORS = {
    feishu: [
      '[class*="subtitle"]',
      '[class*="caption"]',
      '[class*="live-caption"]',
      '[data-testid*="subtitle"]',
      '[class*="Subtitle"]',
      '[class*="Caption"]',
    ],
    xiaoe: [
      ".subtitle-text",
      ".caption-text",
      '[class*="subtitle"]',
      '[class*="caption"]',
      ".vjs-text-track-display",
      ".player-subtitle",
    ],
    generic: [
      // Video.js subtitles
      ".vjs-text-track-display",
      ".vjs-text-track-cue",
      // Generic subtitle overlays
      '[class*="subtitle"]',
      '[class*="caption"]',
      '[class*="Subtitle"]',
      '[class*="Caption"]',
      // WebVTT rendered
      '[class*="text-track"]',
      '[class*="TextTrack"]',
      // YouTube
      ".ytp-caption-segment",
      ".caption-visual-line",
      // Bilibili
      ".bpx-player-subtitle-wrap",
      ".bilibili-player-video-subtitle",
    ],
  };

  // Find subtitle elements using selectors
  function findSubtitleElements(platform) {
    const selectors = SELECTORS[platform] || SELECTORS.generic;
    // Also try generic selectors as fallback
    const allSelectors = platform === "generic" ? selectors : [...selectors, ...SELECTORS.generic];

    for (const selector of allSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          return Array.from(elements).filter((el) => {
            const text = el.textContent?.trim();
            return text && text.length > 0 && text.length < 2000;
          });
        }
      } catch (err) {
        console.debug("[SubtitleCapture] Selector error:", selector, err);
      }
    }
    return [];
  }

  // Extract text from subtitle elements
  function extractText(elements) {
    return elements
      .map((el) => el.textContent?.trim())
      .filter((t) => t && t.length > 0)
      .join("\n");
  }

  // Check for WebVTT track elements
  function getWebVTTText() {
    const tracks = document.querySelectorAll("track[kind='subtitles'], track[kind='captions']");
    if (tracks.length === 0) return "";

    const video = document.querySelector("video");
    if (!video || !video.textTracks) return "";

    let text = "";
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (track.mode === "showing") {
        if (!track.cues) continue;
        for (let j = 0; j < track.cues.length; j++) {
          const cue = track.cues[j];
          if (video.currentTime >= cue.startTime && video.currentTime <= cue.endTime) {
            text += cue.text + "\n";
          }
        }
      }
    }
    return text.trim();
  }

  // Send subtitle to server
  async function sendSubtitle(text) {
    if (!text || text === lastText) return;
    lastText = text;

    try {
      await fetch(`${SERVER}/api/subtitle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          text,
          tabTitle: document.title,
          platform: detectPlatform(window.location.hostname),
        }),
      });
    } catch (err) {
      console.warn("[SubtitleCapture] Server not reachable:", err.message);
    }
  }

  // Check server health
  async function checkServer() {
    try {
      const res = await fetch(`${SERVER}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // Start monitoring
  async function startCapture() {
    if (observer) return; // Already running

    const serverOk = await checkServer();
    if (!serverOk) {
      console.debug("[SubtitleCapture] Server not running. Start the local server first.");
      return;
    }

    sessionId = generateSessionId();
    const platform = detectPlatform(window.location.hostname);
    console.debug(`[SubtitleCapture] Started (${platform}) session: ${sessionId}`);

    // Register session with server
    try {
      await fetch(`${SERVER}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          tabTitle: document.title,
          platform,
        }),
      });
    } catch (err) {
      console.debug("[SubtitleCapture] Session registration failed:", err);
    }

    // Clear any existing poll interval before creating a new one
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    // Method 1: MutationObserver on subtitle elements
    const targetNode = document.body;
    observer = new MutationObserver(() => {
      const elements = findSubtitleElements(platform);
      const text = extractText(elements);
      if (text) sendSubtitle(text);
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Method 2: Poll for WebVTT text every 500ms
    pollInterval = setInterval(() => {
      const vttText = getWebVTTText();
      if (vttText) sendSubtitle(vttText);
    }, 500);

    // Initial scan
    const elements = findSubtitleElements(platform);
    const text = extractText(elements);
    if (text) sendSubtitle(text);
  }

  // Stop monitoring
  function stopCapture() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    if (sessionId) {
      fetch(`${SERVER}/api/session/${sessionId}`, { method: "DELETE" }).catch(
        (err) => console.debug("[SubtitleCapture] Session cleanup failed:", err)
      );
      sessionId = null;
    }

    lastText = "";
    console.debug("[SubtitleCapture] Stopped");
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start") {
      startCapture().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.action === "stop") {
      stopCapture();
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "status") {
      sendResponse({
        running: !!observer,
        sessionId,
        platform: detectPlatform(window.location.hostname),
        url: window.location.href,
        title: document.title,
        mode: "dom",
      });
      return;
    }
  });

  // Auto-start: try to detect subtitles on page load
  setTimeout(async () => {
    const elements = findSubtitleElements(detectPlatform(window.location.hostname));
    if (elements.length > 0) {
      console.debug("[SubtitleCapture] Subtitles detected, auto-starting capture...");
      await startCapture();
    }
  }, 2000);
})();
