import type { STTService } from "./types.js";

/**
 * Alibaba Cloud NLS (Natural Language Service) STT.
 *
 * API endpoint: POST https://nls-gateway.cn-shanghai.aliyuncs.com
 * Required headers:
 *   - Content-Type: application/json
 *   - X-NLS-Token: <access token from CreateToken>
 *
 * Workflow:
 *   1. Call CreateToken to get a temporary token
 *   2. Open a WebSocket to the realtime transcription endpoint, or
 *      use the REST SentenceRecognition API for short audio
 *
 * Auth: AccessKey ID + AccessKey Secret signed with HMAC-SHA1
 *   See: https://help.aliyun.com/document_detail/324263.html
 */
export class AliyunSTTService implements STTService {
  private accessKeyId: string;
  private accessKeySecret: string;

  constructor() {
    const id = process.env.ALIYUN_ACCESS_KEY_ID;
    const secret = process.env.ALIYUN_ACCESS_KEY_SECRET;
    if (!id || !secret) {
      throw new Error(
        "ALIYUN_ACCESS_KEY_ID and ALIYUN_ACCESS_KEY_SECRET are required. Export them before starting the server."
      );
    }
    this.accessKeyId = id;
    this.accessKeySecret = secret;
  }

  async transcribe(_audioBuffer: Buffer, _mimeType: string): Promise<string> {
    throw new Error("阿里云 STT 未实现，请先实现 transcribe 方法");
  }
}
