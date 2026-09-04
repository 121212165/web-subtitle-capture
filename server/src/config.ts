export interface Config {
  port: number;
  vaultPath: string;
  notesDir: string;
  maxSessions: number;
  sessionTimeoutMs: number;
  maxBodySize: number;
}

let config: Config | null = null;

export function loadConfig(): Config {
  const vaultPath = process.env.OBSIDIAN_VAULT;
  if (!vaultPath) {
    console.error("[config] OBSIDIAN_VAULT environment variable is required");
    console.error("[config] Example: OBSIDIAN_VAULT=/path/to/obsidian/vault npm start");
    process.exit(1);
  }

  config = {
    port: parseInt(process.env.PORT || "3210", 10),
    vaultPath,
    notesDir: process.env.NOTES_DIR || "notes",
    maxSessions: parseInt(process.env.MAX_SESSIONS || "50", 10),
    sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || "600000", 10), // 10 minutes
    maxBodySize: parseInt(process.env.MAX_BODY_SIZE || "1048576", 10), // 1MB
  };

  return config;
}

export function getConfig(): Config {
  if (!config) {
    return loadConfig();
  }
  return config;
}
