import fs from "fs";
import path from "path";

// Users must set OBSIDIAN_VAULT to their actual vault path.
// Example: OBSIDIAN_VAULT="/Users/me/MyVault" or OBSIDIAN_VAULT="D:\Notes\MyVault"
const VAULT_PATH = process.env.OBSIDIAN_VAULT ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", "obsidian-vault");
const NOTES_DIR = process.env.NOTES_DIR ?? "notes";

function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 30) || "untitled";
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
  private prevText = "";

  constructor(tabTitle: string) {
    const dir = path.join(VAULT_PATH, NOTES_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const safeTitle = sanitizeFilename(tabTitle);
    const date = formatDate(new Date());
    this.filePath = path.join(dir, `${safeTitle}-${date}.md`);
    this.fileExists = fs.existsSync(this.filePath);
  }

  beginSession(): void {
    const now = new Date();
    if (!this.fileExists) {
      const title = path.basename(this.filePath, ".md").replace(/-\d{4}-\d{2}-\d{2}$/, "");
      const header = `# ${title} — ${formatDisplayDate(now)}\n\n`;
      fs.writeFileSync(this.filePath, header, "utf-8");
      this.fileExists = true;
    } else {
      fs.appendFileSync(this.filePath, "\n---\n\n", "utf-8");
    }
    fs.appendFileSync(this.filePath, `> ${formatTime(now)} 开始捕获\n\n`, "utf-8");
  }

  writeLines(lines: string[]): void {
    const now = new Date();
    const time = formatTime(now);
    const content = lines.map((line) => `${time} | ${line}`).join("\n") + "\n";
    fs.appendFileSync(this.filePath, content, "utf-8");
  }

  getFilePath(): string {
    return this.filePath;
  }
}
