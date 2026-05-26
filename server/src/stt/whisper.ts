import type { STTService } from "./types.js";

export class WhisperSTTService implements STTService {
  private apiKey: string;

  constructor() {
    const key = process.env.WHISPER_API_KEY;
    if (!key) {
      throw new Error(
        "WHISPER_API_KEY is not set. Export it before starting the server."
      );
    }
    this.apiKey = key;
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const boundary = `----FormBoundary${Date.now().toString(36)}`;

    // Map mime type to file extension for the form field
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/mp3": "mp3",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
    };
    const ext = extMap[mimeType] ?? "webm";

    // Manually construct multipart/form-data body
    const parts: Buffer[] = [];

    // model field
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`
      )
    );

    // language field
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nzh\r\n`
      )
    );

    // file field header
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      )
    );

    // file binary content
    parts.push(audioBuffer);

    // closing boundary
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Whisper API returned ${response.status}: ${errorText}`
      );
    }

    const json = (await response.json()) as { text?: string };
    return json.text ?? "";
  }
}
