import http from "http";
import { SessionManager } from "./sessions.js";

const PORT = 3210;
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const manager = new SessionManager();

function isValidOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return origin.startsWith("chrome-extension://");
}

function sendJson(res: http.ServerResponse, data: unknown, status = 200, origin?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && isValidOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("error", reject);
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers["origin"];

  // CORS preflight
  if (req.method === "OPTIONS") {
    if (!isValidOrigin(origin)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin!,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Health check does not require auth (used for connection testing)
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, { status: "ok", uptime: process.uptime() }, 200, origin);
    return;
  }

  // All other endpoints require valid origin
  if (!isValidOrigin(origin)) {
    sendJson(res, { error: "Forbidden" }, 403, origin);
    return;
  }

  // POST /api/subtitle — receive subtitle text
  if (req.method === "POST" && url.pathname === "/api/subtitle") {
    try {
      const body = JSON.parse(await readBody(req));
      const { sessionId, text, tabTitle, platform } = body;
      if (!sessionId || !text) {
        sendJson(res, { error: "sessionId and text required" }, 400, origin);
        return;
      }
      manager.addSubtitle(sessionId, text, tabTitle ?? "untitled", platform ?? "unknown");
      sendJson(res, { ok: true }, 200, origin);
    } catch (e) {
      console.error("[server] POST /api/subtitle error:", e);
      sendJson(res, { error: "Internal server error" }, 500, origin);
    }
    return;
  }

  // POST /api/session — create/get session
  if (req.method === "POST" && url.pathname === "/api/session") {
    try {
      const body = JSON.parse(await readBody(req));
      const { sessionId, tabTitle, platform } = body;
      manager.getOrCreate(sessionId, tabTitle ?? "untitled", platform ?? "unknown");
      sendJson(res, { ok: true }, 200, origin);
    } catch (e) {
      console.error("[server] POST /api/session error:", e);
      sendJson(res, { error: "Internal server error" }, 500, origin);
    }
    return;
  }

  // DELETE /api/session/:id — stop session
  if (req.method === "DELETE" && url.pathname.startsWith("/api/session/")) {
    const id = url.pathname.split("/").pop()!;
    manager.stopSession(id);
    sendJson(res, { ok: true }, 200, origin);
    return;
  }

  // GET /api/sessions — list active sessions
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(res, { sessions: manager.listSessions() }, 200, origin);
    return;
  }

  sendJson(res, { error: "not found" }, 404, origin);
});

server.listen(PORT, () => {
  console.log(`[server] Web Subtitle Capture server running on http://localhost:${PORT}`);
  console.log(`[server] Waiting for extension connections...`);
});

process.on("SIGINT", () => {
  manager.stopAll();
  process.exit(0);
});
