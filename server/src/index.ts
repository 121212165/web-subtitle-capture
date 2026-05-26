import http from "http";
import { SessionManager } from "./sessions.js";

const PORT = 3210;
const manager = new SessionManager();

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // POST /api/subtitle — receive subtitle text
  if (req.method === "POST" && url.pathname === "/api/subtitle") {
    try {
      const body = JSON.parse(await readBody(req));
      const { sessionId, text, tabTitle, platform } = body;
      if (!sessionId || !text) {
        sendJson(res, { error: "sessionId and text required" }, 400);
        return;
      }
      manager.addSubtitle(sessionId, text, tabTitle ?? "untitled", platform ?? "unknown");
      sendJson(res, { ok: true });
    } catch (e) {
      sendJson(res, { error: String(e) }, 500);
    }
    return;
  }

  // POST /api/session — create/get session
  if (req.method === "POST" && url.pathname === "/api/session") {
    try {
      const body = JSON.parse(await readBody(req));
      const { sessionId, tabTitle, platform } = body;
      manager.getOrCreate(sessionId, tabTitle ?? "untitled", platform ?? "unknown");
      sendJson(res, { ok: true });
    } catch (e) {
      sendJson(res, { error: String(e) }, 500);
    }
    return;
  }

  // DELETE /api/session/:id — stop session
  if (req.method === "DELETE" && url.pathname.startsWith("/api/session/")) {
    const id = url.pathname.split("/").pop()!;
    manager.stopSession(id);
    sendJson(res, { ok: true });
    return;
  }

  // GET /api/sessions — list active sessions
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(res, { sessions: manager.listSessions() });
    return;
  }

  // GET /api/health — health check
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, { status: "ok", uptime: process.uptime() });
    return;
  }

  sendJson(res, { error: "not found" }, 404);
});

server.listen(PORT, () => {
  console.log(`[server] Web Subtitle Capture server running on http://localhost:${PORT}`);
  console.log(`[server] Waiting for extension connections...`);
});

process.on("SIGINT", () => {
  manager.stopAll();
  process.exit(0);
});
