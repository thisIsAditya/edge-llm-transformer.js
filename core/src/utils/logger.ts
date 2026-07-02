export function log(level: "info" | "warn" | "error" | "debug", tag: string, msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${tag}]`;
  if (data) {
    console[level === "debug" ? "log" : level](`${prefix} ${msg}`, data);
  } else {
    console[level === "debug" ? "log" : level](`${prefix} ${msg}`);
  }
}

export function createLogger(tag: string) {
  return {
    info: (msg: string, data?: Record<string, unknown>) => log("info", tag, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", tag, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", tag, msg, data),
    debug: (msg: string, data?: Record<string, unknown>) => log("debug", tag, msg, data),
    child: (childTag: string) => createLogger(`${tag}:${childTag}`),
  };
}
