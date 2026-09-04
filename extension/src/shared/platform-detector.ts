import type { PlatformConfig } from "./types.js";

const PLATFORMS: PlatformConfig[] = [
  {
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
  },
  {
    id: "xiaoe",
    hostPatterns: ["xiaoe-tech", "xege"],
    selectors: [
      ".subtitle-text",
      ".caption-text",
      '[class*="subtitle"]',
      '[class*="caption"]',
      ".vjs-text-track-display",
      ".player-subtitle",
    ],
  },
  {
    id: "youtube",
    hostPatterns: ["youtube.com", "youtu.be"],
    selectors: [".ytp-caption-segment", ".caption-visual-line"],
  },
  {
    id: "bilibili",
    hostPatterns: ["bilibili.com", "b23.tv"],
    selectors: [".bpx-player-subtitle-wrap", ".bilibili-player-video-subtitle"],
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

export function detectPlatform(hostnameOrUrl: string): PlatformConfig {
  return (
    PLATFORMS.find(
      (p) => p.id !== "generic" && p.hostPatterns.some((pat) => hostnameOrUrl.includes(pat)),
    ) ?? PLATFORMS[PLATFORMS.length - 1]
  );
}

export function getAllPlatforms(): PlatformConfig[] {
  return PLATFORMS;
}
