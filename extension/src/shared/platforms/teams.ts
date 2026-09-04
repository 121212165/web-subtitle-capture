import type { PlatformConfig } from "../types.js";

export const teamsPlatform: PlatformConfig = {
  id: "teams",
  hostPatterns: ["teams.microsoft.com", "web.microsoftteams.com"],
  selectors: [
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[class*="Caption"]',
    '[class*="Subtitle"]',
    '[data-tid="live-captions"]',
    '[class*="transcript"]',
    '[aria-live="polite"]',
  ],
};
