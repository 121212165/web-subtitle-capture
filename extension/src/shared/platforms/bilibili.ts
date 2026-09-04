import type { PlatformConfig } from "../types.js";

export const bilibiliPlatform: PlatformConfig = {
  id: "bilibili",
  hostPatterns: ["bilibili.com", "b23.tv"],
  selectors: [".bpx-player-subtitle-wrap", ".bilibili-player-video-subtitle"],
};
