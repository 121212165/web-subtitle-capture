import { ObsidianWriter } from "./writer.js";
import { getConfig } from "./config.js";
import { log } from "./logger.js";

interface Session {
  id: string;
  tabTitle: string;
  platform: string;
  writer: ObsidianWriter;
  lineCount: number;
  startedAt: Date;
  lastActivity: Date;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanup();
  }

  private startCleanup(): void {
    const { sessionTimeoutMs } = getConfig();
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (now - session.lastActivity.getTime() > sessionTimeoutMs) {
          log.info("Session timed out", { sessionId: id, lineCount: session.lineCount });
          session.writer.close().catch(() => {});
          this.sessions.delete(id);
        }
      }
    }, 60_000);
  }

  async getOrCreate(sessionId: string, tabTitle: string, platform: string): Promise<Session> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      const { maxSessions } = getConfig();
      if (this.sessions.size >= maxSessions) {
        throw new Error("Maximum session limit reached");
      }
      const writer = new ObsidianWriter(tabTitle);
      await writer.beginSession();
      session = {
        id: sessionId,
        tabTitle,
        platform,
        writer,
        lineCount: 0,
        startedAt: new Date(),
        lastActivity: new Date(),
      };
      this.sessions.set(sessionId, session);
      log.info("New session", { sessionId, platform, tabTitle });
    }
    return session;
  }

  async addSubtitle(sessionId: string, text: string, tabTitle: string, platform: string): Promise<void> {
    const session = await this.getOrCreate(sessionId, tabTitle, platform);
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      await session.writer.writeLines(lines);
      session.lineCount += lines.length;
      session.lastActivity = new Date();
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.writer.close();
      log.info("Session stopped", { sessionId, lineCount: session.lineCount });
      this.sessions.delete(sessionId);
    }
  }

  listSessions(): Array<{ id: string; tabTitle: string; platform: string; lineCount: number; startedAt: string }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      tabTitle: s.tabTitle,
      platform: s.platform,
      lineCount: s.lineCount,
      startedAt: s.startedAt.toISOString(),
    }));
  }

  async stopAll(): Promise<void> {
    for (const [id, session] of this.sessions) {
      await session.writer.close();
      log.info("Stopping session", { sessionId: id, lineCount: session.lineCount });
    }
    this.sessions.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
