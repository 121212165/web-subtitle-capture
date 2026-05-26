import { ObsidianWriter } from "./writer.js";

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

  getOrCreate(sessionId: string, tabTitle: string, platform: string): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      const writer = new ObsidianWriter(tabTitle);
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
      writer.beginSession();
      console.log(`[session] New: ${sessionId} (${platform}) "${tabTitle}"`);
      console.log(`[session]   → ${writer.getFilePath()}`);
    }
    return session;
  }

  addSubtitle(sessionId: string, text: string, tabTitle: string, platform: string): void {
    const session = this.getOrCreate(sessionId, tabTitle, platform);
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      session.writer.writeLines(lines);
      session.lineCount += lines.length;
      session.lastActivity = new Date();
      process.stdout.write(`[session] ${sessionId}: +${lines.length} (total ${session.lineCount})\r`);
    }
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`\n[session] Stopped: ${sessionId} (${session.lineCount} lines)`);
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

  stopAll(): void {
    for (const [id, session] of this.sessions) {
      console.log(`\n[session] Stopping: ${id} (${session.lineCount} lines)`);
    }
    this.sessions.clear();
  }
}
