import type { PlatformConfig } from "../types.js";

export const youtubePlatform: PlatformConfig = {
  id: "youtube",
  hostPatterns: ["youtube.com", "youtu.be"],
  selectors: [".ytp-caption-segment", ".caption-visual-line"],
};
