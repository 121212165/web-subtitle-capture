import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config before importing writer
vi.mock("../config.js", () => ({
  getConfig: () => ({
    vaultPath: "/tmp/test-vault",
    notesDir: "notes",
    port: 3210,
    maxSessions: 50,
    sessionTimeoutMs: 600000,
    maxBodySize: 1048576,
  }),
}));

// Mock fs with async methods used by the refactored writer
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  const promises = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error("not found")),
    writeFile: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
  };
  return {
    ...actual,
    default: { ...actual, promises },
    promises,
  };
});

import { sanitizeFilename, ObsidianWriter } from "../writer.js";

describe("sanitizeFilename", () => {
  it("removes invalid characters", () => {
    const result = sanitizeFilename('test<>:"/\\|?*file');
    expect(result).toBe("testfile");
  });

  it("collapses whitespace", () => {
    expect(sanitizeFilename("hello   world")).toBe("hello world");
  });

  it("truncates to 30 characters", () => {
    expect(sanitizeFilename("a".repeat(50))).toHaveLength(30);
  });

  it("returns untitled for empty result", () => {
    expect(sanitizeFilename("???")).toBe("untitled");
  });

  it("removes control characters", () => {
    expect(sanitizeFilename("test\x00\x01file")).toBe("testfile");
  });

  it("handles normal titles", () => {
    expect(sanitizeFilename("My Video Title")).toBe("My Video Title");
  });

  it("handles Chinese characters", () => {
    expect(sanitizeFilename("飞书视频会议")).toBe("飞书视频会议");
  });

  it("collapses consecutive dots to prevent traversal", () => {
    const result = sanitizeFilename("....test");
    expect(result).not.toContain("..");
  });
});

describe("ObsidianWriter", () => {
  it("getFilePath returns a path with date suffix", () => {
    const writer = new ObsidianWriter("Test Title");
    const filePath = writer.getFilePath();
    expect(filePath).toContain("Test Title");
    expect(filePath).toMatch(/\d{4}-\d{2}-\d{2}\.md$/);
  });

  it("generates safe filenames", () => {
    const writer = new ObsidianWriter('<script>alert("xss")</script>');
    const filePath = writer.getFilePath();
    expect(filePath).not.toContain("<");
    expect(filePath).not.toContain(">");
    expect(filePath).not.toContain('"');
  });

  it("beginSession calls mkdir and writeFile", async () => {
    const fs = await import("fs");
    const writer = new ObsidianWriter("Test");
    await writer.beginSession();
    expect(fs.promises.mkdir).toHaveBeenCalled();
    expect(fs.promises.writeFile).toHaveBeenCalled();
  });

  it("writeLines appends timestamped content", async () => {
    const fs = await import("fs");
    const writer = new ObsidianWriter("Test");
    await writer.writeLines(["hello", "world"]);
    expect(fs.promises.appendFile).toHaveBeenCalled();
  });
});
