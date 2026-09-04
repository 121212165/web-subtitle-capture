import fs from "fs";
import path from "path";
import { getConfig } from "./config.js";
import { log } from "./logger.js";

export function sanitizeFilename(title: string): string {
  const safeTitle = title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 30) || "untitled";

  const { vaultPath, notesDir } = getConfig();
  const resolved = path.resolve(vaultPath, notesDir, safeTitle + ".md");
  const dirResolved = path.resolve(vaultPath, notesDir);
  if (!resolved.startsWith(dirResolved + path.sep) && resolved !== dirResolved) {
    throw new Error("Invalid filename: path traversal detected");
  }

  return safeTitle;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDisplayDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export class ObsidianWriter {
  private filePath: string;
  private fileExists = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(tabTitle: string) {
    const { vaultPath, notesDir } = getConfig();
    const dir = path.join(vaultPath, notesDir);
    const safeTitle = sanitizeFilename(tabTitle);
    const date = formatDate(new Date());
    this.filePath = path.join(dir, `${safeTitle}-${date}.md`);
  }

  async init(): Promise<void> {
    const { vaultPath, notesDir } = getConfig();
    const dir = path.join(vaultPath, notesDir);
    await fs.promises.mkdir(dir, { recursive: true });
    try {
      await fs.promises.access(this.filePath);
      this.fileExists = true;
    } catch {
      this.fileExists = false;
    }
  }

  async beginSession(): Promise<void> {
    await this.init();
    const now = new Date();
    if (!this.fileExists) {
      const title = path.basename(this.filePath, ".md").replace(/-\d{4}-\d{2}-\d{2}$/, "");
      const header = `# ${title} — ${formatDisplayDate(now)}\n\n`;
      await fs.promises.writeFile(this.filePath, header, "utf-8");
      this.fileExists = true;
    } else {
      await fs.promises.appendFile(this.filePath, "\n---\n\n", "utf-8");
    }
    await fs.promises.appendFile(this.filePath, `> ${formatTime(now)} 开始捕获\n\n`, "utf-8");
  }

  async writeLines(lines: string[]): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const now = new Date();
      const time = formatTime(now);
      const content = lines.map((line) => `${time} | ${line}`).join("\n") + "\n";
      await fs.promises.appendFile(this.filePath, content, "utf-8");
    });
    return this.writeQueue;
  }

  async close(): Promise<void> {
    await this.writeQueue;
    const now = new Date();
    await fs.promises.appendFile(this.filePath, `\n> ${formatTime(now)} 捕获结束\n\n`, "utf-8");
  }

  getFilePath(): string {
    return this.filePath;
  }
}
