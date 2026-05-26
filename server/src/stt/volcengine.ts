import type { STTService } from "./types.js";

/**
 * Volcengine (ByteDance) Speech-to-Text service.
 *
 * API endpoint: POST https://openspeech.bytedance.com/api/v1/asr
 * Required headers:
 *   - Content-Type: application/json
 *   - Authorization: Bearer;{access_token}
 *
 * Request body fields:
 *   - app: { appid, cluster }
 *   - user: { uid }
 *   - audio: { format, codec, sample_rate, bits, channel }
 *   - request: { reqid, sequence, nbest, text, show_utterances }
 *
 * Auth: HMAC-SHA256 signature with access key + secret key
 *   See: https://www.volcengine.com/docs/6561/79817
 */
export class VolcengineSTTService implements STTService {
  private accessKey: string;
  private secretKey: string;

  constructor() {
    const accessKey = process.env.VOLCENGINE_ACCESS_KEY;
    const secretKey = process.env.VOLCENGINE_SECRET_KEY;
    if (!accessKey || !secretKey) {
      throw new Error(
        "VOLCENGINE_ACCESS_KEY and VOLCENGINE_SECRET_KEY are required. Export them before starting the server."
      );
    }
    this.accessKey = accessKey;
    this.secretKey = secretKey;
  }

  async transcribe(_audioBuffer: Buffer, _mimeType: string): Promise<string> {
    throw new Error("火山引擎 STT 未实现，请先实现 transcribe 方法");
  }
}
