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

  // Platform detection
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("feishu") || host.includes("larksuite")) return "feishu";
    if (host.includes("xiaoe-tech") || host.includes("xege")) return "xiaoe";
    return "generic";
  }

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
      } catch {}
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
          platform: detectPlatform(),
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
      console.log("[SubtitleCapture] Server not running. Start the local server first.");
      return;
    }

    sessionId = generateSessionId();
    const platform = detectPlatform();
    console.log(`[SubtitleCapture] Started (${platform}) session: ${sessionId}`);

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
    } catch {}

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
      fetch(`${SERVER}/api/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
      sessionId = null;
    }

    lastText = "";
    console.log("[SubtitleCapture] Stopped");
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
        platform: detectPlatform(),
        url: window.location.href,
        title: document.title,
      });
      return;
    }
  });

  // Auto-start: try to detect subtitles on page load
  setTimeout(async () => {
    const elements = findSubtitleElements(detectPlatform());
    if (elements.length > 0) {
      console.log("[SubtitleCapture] Subtitles detected, auto-starting capture...");
      await startCapture();
    }
  }, 2000);
})();
