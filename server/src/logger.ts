type LogLevel = "info" | "warn" | "error" | "debug";

function formatLog(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level}] ${message}`;
  if (context) {
    return `${base} ${JSON.stringify(context)}`;
  }
  return base;
}

export const log = {
  info(message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "test") return;
    console.log(formatLog("info", message, context));
  },

  warn(message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "test") return;
    console.warn(formatLog("warn", message, context));
  },

  error(message: string, context?: Record<string, unknown>): void {
    console.error(formatLog("error", message, context));
  },

  debug(message: string, context?: Record<string, unknown>): void {
    if (!process.env.DEBUG) return;
    console.log(formatLog("debug", message, context));
  },

  request(method: string, pathname: string, status: number, durationMs: number): void {
    if (process.env.NODE_ENV === "test") return;
    console.log(formatLog("info", `${method} ${pathname} ${status} ${durationMs}ms`));
  },
};
