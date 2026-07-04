import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { LOG_PATH } from "./config.js";

export function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    appendFileSync(LOG_PATH, line + "\n");
  } catch {
    // logging must never crash the watcher
  }
}

/** macOS notification via osascript; falls back silently elsewhere. */
export function notify(title: string, message: string): void {
  log(`${title}: ${message}`);
  if (process.platform !== "darwin") return;
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  execFile(
    "osascript",
    ["-e", `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`],
    () => {}
  );
}
