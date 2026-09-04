/**
 * Offscreen document for tab audio capture.
 *
 * Chrome MV3 service workers can't use MediaRecorder, so audio recording
 * happens here. The background script sends us a streamId from tabCapture,
 * we record chunks, send them to the ASR server, and relay transcripts back.
 */

const SERVER_URL = "http://localhost:3210";
const CHUNK_INTERVAL_MS = 5000;

let mediaRecorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let sessionId: string | null = null;
let destroyed = false;

async function startRecording(streamId: string, sid: string): Promise<boolean> {
  if (destroyed) return false;
  stopRecording();

  sessionId = sid;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as unknown as MediaTrackConstraints,
      video: false,
    });
  } catch (err) {
    console.error("[offscreen] getUserMedia failed:", err);
    return false;
  }

  if (!stream || stream.getAudioTracks().length === 0) {
    console.error("[offscreen] No audio tracks in stream");
    return false;
  }

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";

  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 })
      : new MediaRecorder(stream, { audioBitsPerSecond: 16000 });
  } catch (err) {
    console.error("[offscreen] MediaRecorder creation failed:", err);
    return false;
  }

  const chunks: Blob[] = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    if (chunks.length === 0 || destroyed) return;
    const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || "audio/webm" });
    chunks.length = 0;

    try {
      const base64 = await blobToBase64(blob);
      const format = (mediaRecorder?.mimeType || "").includes("webm") ? "webm" : "wav";

      const res = await fetch(`${SERVER_URL}/api/asr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64,
          format,
          sessionId,
          tabTitle: "audio-capture",
          platform: "tabCapture",
        }),
      });

      const data = (await res.json()) as { success: boolean; text?: string };
      if (data.success && data.text?.trim()) {
        chrome.runtime.sendMessage({
          action: "asrResult",
          text: data.text.trim(),
          sessionId,
        });
      }
    } catch (err) {
      console.warn("[offscreen] ASR request failed:", (err as Error).message);
    }
  };

  mediaRecorder.start();
  intervalId = setInterval(() => {
    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
      mediaRecorder.start();
    }
  }, CHUNK_INTERVAL_MS);

  console.log("[offscreen] Recording started for session:", sessionId);
  return true;
}

function stopRecording(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  sessionId = null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener(
  (
    msg: { action: string; streamId?: string; sessionId?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (msg.action === "offscreen-start") {
      if (!msg.streamId || !msg.sessionId) {
        sendResponse({ ok: false, error: "streamId and sessionId required" });
        return false;
      }
      startRecording(msg.streamId, msg.sessionId).then((ok) => {
        sendResponse({ ok });
      });
      return true;
    }

    if (msg.action === "offscreen-stop") {
      stopRecording();
      sendResponse({ ok: true });
      return false;
    }

    return false;
  },
);
