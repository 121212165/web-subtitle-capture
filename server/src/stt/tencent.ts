import type { STTService } from "./types.js";

/**
 * Tencent Cloud STT (Speech-to-Text) service.
 *
 * API endpoint: POST https://asr.tencentcloudapi.com
 * Required headers:
 *   - Content-Type: application/json
 *   - X-TC-Action: SentenceRecognition
 *   - X-TC-Version: 2019-06-14
 *   - X-TC-Region: ap-guangzhou
 *
 * Auth: TC3-HMAC-SHA256 signature
 *   See: https://cloud.tencent.com/document/api/1093/37000
 */
export class TencentSTTService implements STTService {
  private secretId: string;
  private secretKey: string;

  constructor() {
    const id = process.env.TENCENT_SECRET_ID;
    const key = process.env.TENCENT_SECRET_KEY;
    if (!id || !key) {
      throw new Error(
        "TENCENT_SECRET_ID and TENCENT_SECRET_KEY are required. Export them before starting the server."
      );
    }
    this.secretId = id;
    this.secretKey = key;
  }

  async transcribe(_audioBuffer: Buffer, _mimeType: string): Promise<string> {
    throw new Error("腾讯云 STT 未实现，请先实现 transcribe 方法");
  }
}
