import type { PlatformConfig } from "../types.js";

export const xiaomiPlatform: PlatformConfig = {
  id: "xiaomi",
  hostPatterns: ["mi.com", "xiaomi.com", "miui.com", "duokan.com"],
  selectors: [
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[class*="Subtitle"]',
    '[class*="Caption"]',
    '[class*="danmaku"]',
    '[class*="caption-text"]',
    '[data-testid*="subtitle"]',
    ".vjs-text-track-display",
    '[aria-live="polite"]',
  ],
};
