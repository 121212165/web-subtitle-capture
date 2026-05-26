import type { STTService } from "./types.js";

export class MockSTTService implements STTService {
  async transcribe(_audioBuffer: Buffer, _mimeType: string): Promise<string> {
    return `[音频转录] 模拟识别文本 — ${new Date().toLocaleTimeString()}`;
  }
}
