import { SERVER_URL } from "../shared/constants.js";

/**
 * Captures audio from the page's video/audio elements and sends
 * chunks to the local server for MiMo ASR transcription.
 *
 * Used when no DOM subtitles or API subtitles are found —
 * falls back to speech recognition from the audio stream.
 */

interface AudioCaptureConfig {
  sessionId: string;
  tabTitle: string;
  platform: string;
  intervalMs?: number;     // send audio chunk every N ms (default 5000)
  chunkDurationMs?: number; // duration of each audio chunk (default 5000)
  onTranscript?: (text: string) => void;
}

export function createAudioCapture(config: AudioCaptureConfig) {
  const {
    sessionId,
    tabTitle,
    platform,
    intervalMs = 5000,
    chunkDurationMs = 5000,
    onTranscript,
  } = config;

  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let audioContext: AudioContext | null = null;
  let destroyed = false;

  async function start(): Promise<boolean> {
    if (destroyed) return false;

    // Find a video or audio element on the page
    const videoEl = document.querySelector<HTMLVideoElement>("video");
    const audioEl = document.querySelector<HTMLAudioElement>("audio");
    const mediaEl = videoEl ?? audioEl;

    if (!mediaEl) {
      console.log("[AudioCapture] No video/audio element found on page");
      return false;
    }

    try {
      // Capture stream from the media element
      // @ts-expect-error captureStream is not in all type defs
      const captureStream: MediaStream | null = mediaEl.captureStream?.() ?? null;
      if (!captureStream || captureStream.getAudioTracks().length === 0) {
        console.log("[AudioCapture] No audio tracks available");
        return false;
      }

      stream = captureStream;

      // Check for supported MIME types
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/wav";

      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 16000,
      });

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (chunks.length === 0 || destroyed) return;
        const blob = new Blob(chunks, { type: mimeType });
        chunks.length = 0;

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          if (!base64) return;

          const format = mimeType.includes("webm") ? "webm" : "wav";

          try {
            const res = await fetch(`${SERVER_URL}/api/asr`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audio: base64,
                format,
                sessionId,
                tabTitle,
                platform,
              }),
            });
            const data = await res.json() as { success: boolean; text?: string };
            if (data.success && data.text && data.text.trim()) {
              onTranscript?.(data.text.trim());
            }
          } catch (err) {
            console.warn("[AudioCapture] ASR request failed:", (err as Error).message);
          }
        };
        reader.readAsDataURL(blob);
      };

      // Start recording, stop after chunkDurationMs to trigger onstop
      mediaRecorder.start();

      interval = setInterval(() => {
        if (mediaRecorder?.state === "recording") {
          mediaRecorder.stop();
          mediaRecorder.start();
        }
      }, intervalMs);

      console.log("[AudioCapture] Started audio capture for ASR");
      return true;
    } catch (err) {
      console.warn("[AudioCapture] Failed to start:", (err as Error).message);
      return false;
    }
  }

  function stop(): void {
    destroyed = true;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    console.log("[AudioCapture] Stopped");
  }

  return { start, stop };
}
