// Shared platform detection used by content.js and popup.js

function detectPlatform(hostnameOrUrl) {
  if (!hostnameOrUrl) return "unknown";
  if (hostnameOrUrl.includes("feishu") || hostnameOrUrl.includes("larksuite")) return "feishu";
  if (hostnameOrUrl.includes("xiaoe-tech") || hostnameOrUrl.includes("xege")) return "xiaoe";
  return "generic";
}
