import type { PlatformConfig } from "../types.js";

export const feishuPlatform: PlatformConfig = {
  id: "feishu",
  hostPatterns: ["feishu", "larksuite"],
  selectors: [
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[class*="live-caption"]',
    '[data-testid*="subtitle"]',
    '[class*="Subtitle"]',
    '[class*="Caption"]',
  ],
};
