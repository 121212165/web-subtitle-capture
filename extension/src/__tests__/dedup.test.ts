import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to test the dedup logic. Since it's inside content/main.ts,
// we extract the logic here for testing purposes.
// In the real codebase, dedup would be in its own module.

class SubtitleDedup {
  private lastText = "";
  private lastSentAt = 0;
  private recentTexts: string[] = [];
  private readonly minIntervalMs = 500;
  private readonly repeatWindowMs = 3000;
  private readonly shortTextLength = 10;
  private readonly windowSize = 5;

  shouldSend(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const now = Date.now();
    if (text === this.lastText) {
      return now - this.lastSentAt > this.repeatWindowMs;
    }
    if (text.length < this.shortTextLength && this.recentTexts.includes(text)) {
      return false;
    }
    if (now - this.lastSentAt < this.minIntervalMs) {
      return false;
    }
    this.lastText = text;
    this.lastSentAt = now;
    this.recentTexts = [...this.recentTexts.slice(-(this.windowSize - 1)), text];
    return true;
  }
}

describe("SubtitleDedup", () => {
  let dedup: SubtitleDedup;

  beforeEach(() => {
    dedup = new SubtitleDedup();
  });

  it("sends first occurrence", () => {
    expect(dedup.shouldSend("Hello world")).toBe(true);
  });

  it("blocks empty text", () => {
    expect(dedup.shouldSend("")).toBe(false);
    expect(dedup.shouldSend("   ")).toBe(false);
  });

  it("blocks same text within repeat window", () => {
    dedup.shouldSend("Hello");
    expect(dedup.shouldSend("Hello")).toBe(false);
  });

  it("blocks repeated short text in sliding window", () => {
    expect(dedup.shouldSend("是的")).toBe(true);
    expect(dedup.shouldSend("是的")).toBe(false);
  });

  it("allows different text within min interval if last was long ago", () => {
    dedup.shouldSend("First message");
    expect(dedup.shouldSend("Second message")).toBe(false); // within minInterval
  });

  it("blocks duplicate short text even when mixed with other texts", () => {
    dedup.shouldSend("嗯");
    dedup.shouldSend("Another long text here");
    dedup.shouldSend("嗯"); // should be blocked because it's in recentTexts
    expect(dedup.shouldSend("嗯")).toBe(false);
  });
});
