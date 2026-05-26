export interface STTService {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}
