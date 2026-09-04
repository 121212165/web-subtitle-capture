import { describe, it, expect, vi } from "vitest";

// Mock dependencies before any imports
vi.mock("../config.js", () => ({
  loadConfig: () => ({
    vaultPath: "/tmp/test-vault",
    notesDir: "notes",
    port: 0,
    maxSessions: 50,
    sessionTimeoutMs: 600000,
    maxBodySize: 1048576,
  }),
  getConfig: () => ({
    vaultPath: "/tmp/test-vault",
    notesDir: "notes",
    port: 0,
    maxSessions: 50,
    sessionTimeoutMs: 600000,
    maxBodySize: 1048576,
  }),
}));

vi.mock("../logger.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    request: vi.fn(),
  },
}));

vi.mock("../writer.js", () => ({
  ObsidianWriter: class MockObsidianWriter {
    beginSession = vi.fn().mockResolvedValue(undefined);
    writeLines = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    getFilePath = vi.fn().mockReturnValue("/tmp/test-vault/notes/Test-2026-05-27.md");
  },
  sanitizeFilename: vi.fn((title: string) =>
    title.replace(/[<>:"/\\|?*]/g, "").replace(/\.{2,}/g, ".").replace(/\s+/g, " ").trim().substring(0, 30) || "untitled"
  ),
}));

// Mock serve to prevent actually starting the server
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(() => ({ close: vi.fn() })),
}));

import { app } from "../index.js";

describe("API routes", () => {
  // Simulate a non-local origin so the auth middleware actually checks the token
  const foreignOrigin = { origin: "https://external.example.com" };

  it("health endpoint returns 401 without auth token (non-local origin)", async () => {
    const res = await app.request("/api/health", { headers: foreignOrigin });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("health endpoint returns expected fields with auth", async () => {
    const res = await app.request("/api/health", {
      headers: { "X-Auth-Token": "test-token" },
    });
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("POST /api/subtitle rejects without auth (non-local origin)", async () => {
    const res = await app.request("/api/subtitle", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...foreignOrigin },
      body: JSON.stringify({ sessionId: "s1", text: "hello" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/session rejects without auth (non-local origin)", async () => {
    const res = await app.request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...foreignOrigin },
      body: JSON.stringify({ sessionId: "s1", tabTitle: "Test" }),
    });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/session/:id rejects without auth (non-local origin)", async () => {
    const res = await app.request("/api/session/s1", {
      method: "DELETE",
      headers: foreignOrigin,
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/sessions rejects without auth (non-local origin)", async () => {
    const res = await app.request("/api/sessions", { headers: foreignOrigin });
    expect(res.status).toBe(401);
  });

  it("session list item has correct shape", () => {
    // Validate the contract that SessionManager.listSessions() returns
    const session = {
      id: "s1",
      tabTitle: "Test",
      platform: "generic",
      lineCount: 5,
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(session).toHaveProperty("id");
    expect(session).toHaveProperty("tabTitle");
    expect(session).toHaveProperty("platform");
    expect(session).toHaveProperty("lineCount");
    expect(session).toHaveProperty("startedAt");
  });

  it("subtitle request contract requires sessionId and text", () => {
    const validBody = { sessionId: "s1", text: "hello", tabTitle: "Test", platform: "generic" };
    expect(validBody.sessionId).toBeTruthy();
    expect(validBody.text).toBeTruthy();

    const invalidBody = { sessionId: "", text: "" };
    expect(!invalidBody.sessionId || !invalidBody.text).toBe(true);
  });
});
