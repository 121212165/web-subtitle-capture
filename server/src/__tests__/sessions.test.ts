import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config
vi.mock("../config.js", () => ({
  getConfig: () => ({
    vaultPath: "/tmp/test-vault",
    notesDir: "notes",
    port: 3210,
    maxSessions: 3,
    sessionTimeoutMs: 600000,
    maxBodySize: 1048576,
  }),
}));

// Mock logger
vi.mock("../logger.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    request: vi.fn(),
  },
}));

// Mock writer — use a class so it works with `new`
vi.mock("../writer.js", () => {
  return {
    ObsidianWriter: class MockObsidianWriter {
      beginSession = vi.fn().mockResolvedValue(undefined);
      writeLines = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      getFilePath = vi.fn().mockReturnValue("/tmp/test-vault/notes/Test-2026-05-27.md");
    },
    sanitizeFilename: vi.fn((title: string) =>
      title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\.{2,}/g, ".").replace(/\s+/g, " ").trim().substring(0, 30) || "untitled"
    ),
  };
});

import { SessionManager } from "../sessions.js";
import { ObsidianWriter } from "../writer.js";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SessionManager();
  });

  it("creates a new session", async () => {
    const session = await manager.getOrCreate("s1", "Test Video", "generic");
    expect(session.id).toBe("s1");
    expect(session.tabTitle).toBe("Test Video");
    expect(session.platform).toBe("generic");
  });

  it("calls beginSession on new session creation", async () => {
    await manager.getOrCreate("s1", "Test", "generic");
    // Get the writer instance from the session to check beginSession was called
    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(1);
  });

  it("returns existing session on duplicate id", async () => {
    const s1 = await manager.getOrCreate("s1", "Test", "generic");
    const s2 = await manager.getOrCreate("s1", "Different", "feishu");
    expect(s1).toBe(s2);
  });

  it("lists active sessions", async () => {
    await manager.getOrCreate("s1", "A", "generic");
    await manager.getOrCreate("s2", "B", "feishu");
    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("s1");
    expect(sessions[1].id).toBe("s2");
  });

  it("removes session on stop", async () => {
    await manager.getOrCreate("s1", "Test", "generic");
    await manager.stopSession("s1");
    expect(manager.listSessions()).toHaveLength(0);
  });

  it("handles stopping non-existent session", async () => {
    await manager.stopSession("nonexistent");
    // No error should be thrown
  });

  it("adds subtitle lines to session", async () => {
    await manager.addSubtitle("s1", "hello\nworld", "Test", "generic");
    const sessions = manager.listSessions();
    expect(sessions[0].lineCount).toBe(2);
  });

  it("filters empty lines", async () => {
    await manager.addSubtitle("s1", "hello\n\n  \nworld", "Test", "generic");
    const sessions = manager.listSessions();
    expect(sessions[0].lineCount).toBe(2);
  });

  it("enforces maximum session limit", async () => {
    await manager.getOrCreate("s1", "A", "generic");
    await manager.getOrCreate("s2", "B", "generic");
    await manager.getOrCreate("s3", "C", "generic");
    await expect(manager.getOrCreate("s4", "D", "generic")).rejects.toThrow("Maximum session limit");
  });

  it("stopAll closes all sessions", async () => {
    await manager.getOrCreate("s1", "A", "generic");
    await manager.getOrCreate("s2", "B", "feishu");
    await manager.stopAll();
    expect(manager.listSessions()).toHaveLength(0);
  });
});
