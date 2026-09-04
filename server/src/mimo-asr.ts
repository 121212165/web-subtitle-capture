import { log } from "./logger.js";

export interface MimoAsrConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AsrResult {
  text: string;
  language?: string;
  duration?: number;
}

let config: MimoAsrConfig | null = null;

export function loadMimoConfig(): MimoAsrConfig | null {
  const apiKey = process.env.MIMO_API_KEY;
  if (!apiKey) {
    log.info("[mimo-asr] MIMO_API_KEY not set, ASR disabled");
    return null;
  }

  config = {
    apiKey,
    baseUrl: process.env.MIMO_BASE_URL || "https://token-plan-cn.xiaomimimo.com",
    model: process.env.MIMO_ASR_MODEL || "mimo-v2.5-asr",
  };

  log.info("[mimo-asr] Initialized", { model: config.model, baseUrl: config.baseUrl });
  return config;
}

export function getMimoConfig(): MimoAsrConfig | null {
  return config;
}

/**
 * Send audio data to MiMo ASR for transcription.
 * Uses OpenAI-compatible chat/completions endpoint with input_audio.
 *
 * @param audioBase64 - base64-encoded audio data (wav/mp3/ogg/opus)
 * @param format - audio format: "wav", "mp3", "ogg", "opus"
 * @returns transcribed text, or empty string on failure
 */
export async function transcribeAudio(
  audioBase64: string,
  format: string = "wav",
): Promise<AsrResult> {
  if (!config) {
    throw new Error("MiMo ASR not configured");
  }

  const url = `${config.baseUrl}/v1/chat/completions`;

  const body = {
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: audioBase64,
              format,
            },
          },
          {
            type: "text",
            text: "请识别这段音频中的所有语音内容，只输出识别到的文字，不要添加任何额外说明或格式。",
          },
        ],
      },
    ],
    max_tokens: 4096,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      log.error("[mimo-asr] API error", { status: res.status, body: errText.slice(0, 500) });
      return { text: "" };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (text) {
      log.debug("[mimo-asr] Transcribed", { length: text.length });
    }

    return { text };
  } catch (err) {
    log.error("[mimo-asr] Request failed", { error: String(err) });
    return { text: "" };
  }
}

/**
 * Health check — verify API key and model are accessible.
 */
export async function checkMimoHealth(): Promise<boolean> {
  if (!config) return false;

  try {
    const res = await fetch(`${config.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
