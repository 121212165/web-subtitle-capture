import type { PlatformConfig } from "../types.js";

export const msstreamPlatform: PlatformConfig = {
  id: "msstream",
  hostPatterns: ["microsoftstream.com"],
  selectors: [
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[class*="Caption"]',
    '[class*="Subtitle"]',
    ".vjs-text-track-display",
    '[data-testid*="subtitle"]',
    '[aria-live="polite"]',
  ],
};
