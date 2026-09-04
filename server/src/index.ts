import { config as loadEnv } from "dotenv";
import path from "path";
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env") });
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { SessionManager } from "./sessions.js";
import { loadConfig, getConfig } from "./config.js";
import { log } from "./logger.js";
import { loadMimoConfig, transcribeAudio, checkMimoHealth } from "./mimo-asr.js";
import crypto from "crypto";

const config = loadConfig();
const manager = new SessionManager();
const mimoConfig = loadMimoConfig();
const AUTH_TOKEN = process.env.AUTH_TOKEN || crypto.randomBytes(32).toString("hex");

const app = new Hono();

// CORS middleware
app.use("/*", cors({
  origin: (origin) => {
    if (origin.startsWith("chrome-extension://") || origin === `http://localhost:${config.port}`) {
      return origin;
    }
    return "null";
  },
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "X-Auth-Token"],
}));

// Security headers middleware
app.use("/*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Cache-Control", "no-store");
});

// Body size limit middleware
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
app.use("/api/*", async (c, next) => {
  const contentLength = c.req.header("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return c.json({ success: false, error: "Request body too large" }, 413);
  }
  await next();
});

// Request logging middleware
app.use("/*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  log.request(c.req.method, c.req.path, c.res.status, duration);
});

// Auth middleware for API routes — local-only server, skip auth for local requests
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  const referer = c.req.header("referer") ?? "";

  // Allow: chrome-extension, localhost, or no origin (service worker / curl)
  const isLocal = !origin
    || origin.startsWith("chrome-extension://")
    || origin.startsWith("http://localhost")
    || origin.startsWith("http://127.0.0.1")
    || referer.includes("localhost")
    || referer.startsWith("chrome-extension://");

  if (isLocal) {
    await next();
    return;
  }

  const auth = c.req.header("X-Auth-Token");
  if (auth !== AUTH_TOKEN) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  await next();
});

// POST /api/subtitle — receive subtitle text
app.post("/api/subtitle", async (c) => {
  const contentType = c.req.header("content-type") || "";
  if (!contentType.includes("application/json")) {
    return c.json({ success: false, error: "Content-Type must be application/json" }, 415);
  }
  try {
    const body = await c.req.json();
    const { sessionId, text, tabTitle, platform } = body;
    if (!sessionId || !text) {
      return c.json({ success: false, error: "sessionId and text required" }, 400);
    }
    if (typeof text !== "string" || text.length > 100000) {
      return c.json({ success: false, error: "text too large" }, 400);
    }
    await manager.addSubtitle(sessionId, text, tabTitle ?? "untitled", platform ?? "unknown");
    return c.json({ success: true });
  } catch (e) {
    log.error("subtitle error", { error: String(e) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// POST /api/session — create session
app.post("/api/session", async (c) => {
  const contentType = c.req.header("content-type") || "";
  if (!contentType.includes("application/json")) {
    return c.json({ success: false, error: "Content-Type must be application/json" }, 415);
  }
  try {
    const body = await c.req.json();
    const { sessionId, tabTitle, platform } = body;
    const sid = sessionId || crypto.randomUUID();
    await manager.getOrCreate(sid, tabTitle ?? "untitled", platform ?? "unknown");
    return c.json({ success: true, sessionId: sid });
  } catch (e) {
    log.error("session create error", { error: String(e) });
    if (String(e).includes("Maximum session")) {
      return c.json({ success: false, error: "Maximum session limit reached" }, 429);
    }
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// DELETE /api/session/:id — stop session
app.delete("/api/session/:id", async (c) => {
  const id = c.req.param("id");
  await manager.stopSession(id);
  return c.json({ success: true });
});

// GET /api/sessions — list active sessions
app.get("/api/sessions", (c) => {
  return c.json({ success: true, sessions: manager.listSessions() });
});

// POST /api/asr — transcribe audio via MiMo ASR
app.post("/api/asr", async (c) => {
  if (!mimoConfig) {
    return c.json({ success: false, error: "MiMo ASR not configured (set MIMO_API_KEY)" }, 503);
  }
  const contentType = c.req.header("content-type") || "";
  if (!contentType.includes("application/json")) {
    return c.json({ success: false, error: "Content-Type must be application/json" }, 415);
  }
  try {
    const body = await c.req.json();
    const { audio, format, sessionId, tabTitle, platform } = body;
    if (!audio) {
      return c.json({ success: false, error: "audio (base64) required" }, 400);
    }
    if (typeof audio !== "string" || audio.length > 10 * 1024 * 1024) {
      return c.json({ success: false, error: "audio data too large (max 10MB base64)" }, 400);
    }

    const result = await transcribeAudio(audio, format ?? "wav");
    if (result.text && sessionId) {
      await manager.addSubtitle(sessionId, result.text, tabTitle ?? "ASR", platform ?? "xiaomi");
    }

    return c.json({ success: true, text: result.text });
  } catch (e) {
    log.error("asr error", { error: String(e) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// GET /api/health — health check
app.get("/api/health", async (c) => {
  const mimoOk = mimoConfig ? await checkMimoHealth() : false;
  return c.json({
    success: true,
    status: "ok",
    uptime: process.uptime(),
    activeSessions: manager.listSessions().length,
    vaultPath: config.vaultPath,
    authRequired: true,
    asrEnabled: !!mimoConfig,
    asrHealthy: mimoOk,
  });
});

// Graceful shutdown
process.on("SIGINT", async () => {
  log.info("Shutting down...");
  await manager.stopAll();
  process.exit(0);
});

serve({ fetch: app.fetch, port: config.port }, () => {
  log.info(`Server running on http://localhost:${config.port}`);
  log.info(`Auth token: ${AUTH_TOKEN}`);
  log.info("Waiting for extension connections...");
});

export { app, manager };
