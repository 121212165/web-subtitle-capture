import type { ApiAdapter } from './types.js';
import { youtubeAdapter } from './youtube-api.js';
import { bilibiliAdapter } from './bilibili-api.js';
import { feishuAdapter } from './feishu-api.js';
import { msstreamAdapter } from './msstream-api.js';
import { teamsAdapter } from './teams-api.js';
import { xiaomiAdapter } from './xiaomi-api.js';
import { genericAdapter } from './generic-api.js';

/** Ordered list of all registered adapters. Generic adapter is last (fallback). */
export const adapters: ApiAdapter[] = [
  youtubeAdapter,
  bilibiliAdapter,
  feishuAdapter,
  msstreamAdapter,
  teamsAdapter,
  xiaomiAdapter,
  genericAdapter,
];

/**
 * Look up the adapter for a given platform id.
 * Returns `undefined` if no adapter matches (caller should fall back to generic).
 */
export function getAdapterForPlatform(platformId: string): ApiAdapter | undefined {
  return adapters.find((a) => a.id === platformId);
}

/** Return all registered adapters. */
export function getAllAdapters(): ApiAdapter[] {
  return adapters;
}

/**
 * Flatten all urlPatterns from every adapter into a single list.
 * The network interceptor uses this to decide which requests to observe.
 * Each entry is either a substring to match via `includes` or a RegExp.
 */
export function getUrlPatterns(): Array<string | RegExp> {
  const patterns: Array<string | RegExp> = [];
  for (const adapter of adapters) {
    patterns.push(...adapter.urlPatterns);
  }
  return patterns;
}

// Re-export individual adapters for direct import
export { youtubeAdapter } from './youtube-api.js';
export { bilibiliAdapter, extractBilibiliSubtitleUrls } from './bilibili-api.js';
export { feishuAdapter } from './feishu-api.js';
export { msstreamAdapter } from './msstream-api.js';
export { teamsAdapter } from './teams-api.js';
export { xiaomiAdapter } from './xiaomi-api.js';
export { genericAdapter, isSubtitleContentType } from './generic-api.js';

// Re-export the interface
export type { ApiAdapter } from './types.js';
