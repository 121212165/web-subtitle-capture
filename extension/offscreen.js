// Offscreen document for tab audio capture
// Runs in a headless page with access to Web Audio API and MediaRecorder

const captures = new Map(); // tabId -> { recorder, sessionId, serverUrl, chunks, tabId, intervalId }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startAudioCapture") {
    startCapture(msg).then(sendResponse);
    return true;
  }

  if (msg.action === "stopAudioCapture") {
    stopCapture(msg.tabId);
    sendResponse({ ok: true });
    return;
  }
});

async function startCapture({ tabId, sessionId, serverUrl, tabTitle }) {
  try {
    const stream = await chrome.tabCapture.capture({ tabId });
    if (!stream) {
      console.error("[offscreen] tabCapture returned null for tab", tabId);
      chrome.runtime.sendMessage({
        action: "audioCaptureError",
        tabId,
        error: "Cannot capture this tab (may be a chrome:// URL or restricted page)"
      });
      return { ok: false, error: "Capture failed" };
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus"
    });

    const entry = {
      recorder,
      sessionId,
      serverUrl,
      chunks: [],
      tabId,
      intervalId: null
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        entry.chunks.push(event.data);
      }
    };

    entry.intervalId = setInterval(async () => {
      if (entry.chunks.length === 0) return;

      recorder.requestData();

      // Small delay to allow ondataavailable to fire after requestData
      await new Promise((resolve) => setTimeout(resolve, 100));

      const blob = new Blob(entry.chunks, { type: recorder.mimeType });
      entry.chunks = [];

      try {
        const arrayBuffer = await blob.arrayBuffer();
        await fetch(`${serverUrl}/api/transcribe`, {
          method: "POST",
          headers: {
            "Content-Type": blob.type,
            "X-Session-Id": sessionId,
            "X-Tab-Title": encodeURIComponent(tabTitle || "")
          },
          body: arrayBuffer
        });
      } catch (err) {
        console.error("[offscreen] Failed to send audio chunk:", err);
      }
    }, 5000);

    captures.set(tabId, entry);
    recorder.start(5000);

    console.log("[offscreen] Audio capture started for tab", tabId);
    return { ok: true };
  } catch (err) {
    console.error("[offscreen] startCapture error:", err);
    return { ok: false, error: err.message };
  }
}

function stopCapture(tabId) {
  const entry = captures.get(tabId);
  if (!entry) return;

  try {
    entry.recorder.stop();
  } catch (err) {
    console.error("[offscreen] Error stopping recorder:", err);
  }

  // Stop all media stream tracks
  if (entry.recorder.stream) {
    entry.recorder.stream.getTracks().forEach((track) => track.stop());
  }

  if (entry.intervalId) {
    clearInterval(entry.intervalId);
  }

  captures.delete(tabId);
  console.log("[offscreen] Audio capture stopped for tab", tabId);
}
