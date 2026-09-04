import type { PlatformConfig } from "../types.js";

export const genericPlatform: PlatformConfig = {
  id: "generic",
  hostPatterns: [],
  selectors: [
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[class*="Subtitle"]',
    '[class*="Caption"]',
    ".vjs-text-track-display",
    ".vjs-text-track-cue",
    '[class*="text-track"]',
    '[class*="TextTrack"]',
  ],
};
