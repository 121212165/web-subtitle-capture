import type { STTService } from "./types.js";
import { MockSTTService } from "./mock.js";
import { WhisperSTTService } from "./whisper.js";
import { TencentSTTService } from "./tencent.js";
import { AliyunSTTService } from "./aliyun.js";
import { VolcengineSTTService } from "./volcengine.js";

const VALID_PROVIDERS = ["mock", "whisper", "tencent", "aliyun", "volcengine"] as const;

export type STTProvider = (typeof VALID_PROVIDERS)[number];

export function createSTTService(): STTService {
  const provider = (process.env.STT_PROVIDER ?? "mock").toLowerCase() as STTProvider;

  switch (provider) {
    case "mock":
      return new MockSTTService();
    case "whisper":
      return new WhisperSTTService();
    case "tencent":
      return new TencentSTTService();
    case "aliyun":
      return new AliyunSTTService();
    case "volcengine":
      return new VolcengineSTTService();
    default:
      throw new Error(
        `Unknown STT_PROVIDER "${provider}". Valid options: ${VALID_PROVIDERS.join(", ")}`
      );
  }
}

export type { STTService } from "./types.js";
