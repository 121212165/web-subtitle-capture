import type { STTService } from "./types.js";

/**
 * Free STT provider using a configurable endpoint.
 *
 * Supported free backends (set FREE_STT_URL to the endpoint):
 *
 * 1. FunASR (Alibaba open-source, best free Chinese STT)
 *    - Local: docker run -p 10095:10095 registry.cn-hangzhou.aliyuncs.com/funasr_repo/funasr:funasr-runtime-sdk-online-cpu-0.1.10
 *    - Set: FREE_STT_URL=http://localhost:10095
 *
 * 2. DashScope Paraformer (Alibaba Cloud free tier, 2h/month)
 *    - Set: FREE_STT_URL=https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription
 *    - Also set: DASHSCOPE_API_KEY=sk-xxx
 *
 * 3. Any OpenAI-compatible Whisper endpoint
 *    - Set: FREE_STT_URL=http://localhost:9000/v1/audio/transcriptions
 */
export class FreeSTTService implements STTService {
  private url: string;

  constructor() {
    this.url = process.env.FREE_STT_URL || "http://localhost:9000/v1/audio/transcriptions";
    console.log(`[free-stt] Backend URL: ${this.url}`);
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const baseMime = mimeType.split(";")[0].trim().toLowerCase();
    const ext = baseMime.includes("webm") ? "webm" : baseMime.includes("ogg") ? "ogg" : "wav";

    if (this.url.includes("/v1/audio") || this.url.includes("whisper") || this.url.includes("9000")) {
      return this.callWhisperCompatible(audioBuffer, ext);
    }

    if (this.url.includes("10095") || this.url.includes("funasr")) {
      return this.callFunASR(audioBuffer, mimeType);
    }

    return this.callWhisperCompatible(audioBuffer, ext);
  }

  private async callWhisperCompatible(audioBuffer: Buffer, ext: string): Promise<string> {
    try {
      const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
      const parts: Buffer[] = [];

      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`
      ));
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nzh\r\n`
      ));

      const fileHeader = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: audio/${ext}\r\n\r\n`
      );
      const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
      parts.push(Buffer.concat([fileHeader, audioBuffer, fileFooter]));

      const body = Buffer.concat(parts);
      const headers: Record<string, string> = {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      };

      const dashscopeKey = process.env.DASHSCOPE_API_KEY;
      if (dashscopeKey) {
        headers["Authorization"] = `Bearer ${dashscopeKey}`;
      }

      const resp = await fetch(this.url, { method: "POST", headers, body });
      const data = (await resp.json()) as { text?: string };
      return data.text?.trim() ?? "";
    } catch (e) {
      console.error("[free-stt] Error:", e);
      return "";
    }
  }

  private async callFunASR(audioBuffer: Buffer, _mimeType: string): Promise<string> {
    try {
      const resp = await fetch(`${this.url}/`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: audioBuffer,
      });
      const text = await resp.text();
      return text.trim();
    } catch (e) {
      console.error("[free-stt] FunASR error:", e);
      return "";
    }
  }
}
