import { describe, it, expect } from "vitest";
import { detectPlatform, getAllPlatforms } from "../shared/platform-detector.js";

describe("detectPlatform", () => {
  it("detects feishu by hostname", () => {
    const platform = detectPlatform("feishu.cn");
    expect(platform.id).toBe("feishu");
  });

  it("detects larksuite as feishu", () => {
    const platform = detectPlatform("open.larksuite.com");
    expect(platform.id).toBe("feishu");
  });

  it("detects xiaoe-tech", () => {
    const platform = detectPlatform("www.xiaoe-tech.com");
    expect(platform.id).toBe("xiaoe");
  });

  it("detects xege as xiaoe", () => {
    const platform = detectPlatform("xege.org");
    expect(platform.id).toBe("xiaoe");
  });

  it("detects youtube", () => {
    const platform = detectPlatform("www.youtube.com");
    expect(platform.id).toBe("youtube");
  });

  it("detects youtu.be as youtube", () => {
    const platform = detectPlatform("youtu.be");
    expect(platform.id).toBe("youtube");
  });

  it("detects bilibili", () => {
    const platform = detectPlatform("www.bilibili.com");
    expect(platform.id).toBe("bilibili");
  });

  it("detects b23.tv as bilibili", () => {
    const platform = detectPlatform("b23.tv");
    expect(platform.id).toBe("bilibili");
  });

  it("falls back to generic for unknown hosts", () => {
    const platform = detectPlatform("example.com");
    expect(platform.id).toBe("generic");
  });

  it("falls back to generic for empty string", () => {
    const platform = detectPlatform("");
    expect(platform.id).toBe("generic");
  });

  it("detects xiaomi by mi.com", () => {
    const platform = detectPlatform("www.mi.com");
    expect(platform.id).toBe("xiaomi");
  });

  it("detects xiaomi by xiaomi.com", () => {
    const platform = detectPlatform("api.xiaomi.com");
    expect(platform.id).toBe("xiaomi");
  });

  it("detects xiaomi by duokan.com", () => {
    const platform = detectPlatform("www.duokan.com");
    expect(platform.id).toBe("xiaomi");
  });

  it("detects msstream by microsoftstream.com", () => {
    const platform = detectPlatform("web.microsoftstream.com");
    expect(platform.id).toBe("msstream");
  });

  it("detects teams by teams.microsoft.com", () => {
    const platform = detectPlatform("teams.microsoft.com");
    expect(platform.id).toBe("teams");
  });

  it("detects teams by web.microsoftteams.com", () => {
    const platform = detectPlatform("web.microsoftteams.com");
    expect(platform.id).toBe("teams");
  });

  it("each platform has at least one selector", () => {
    const platforms = getAllPlatforms();
    for (const p of platforms) {
      expect(p.selectors.length).toBeGreaterThan(0);
    }
  });

  it("generic platform has empty hostPatterns", () => {
    const platforms = getAllPlatforms();
    const generic = platforms.find((p) => p.id === "generic");
    expect(generic?.hostPatterns).toEqual([]);
  });
});
