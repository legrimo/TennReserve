import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import nodemailer from "nodemailer";
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
export function notifyMac(title: string, message: string): void {
  log(`${title}: ${message}`);
  if (process.platform !== "darwin") return;
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  execFile(
    "osascript",
    ["-e", `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`],
    () => {}
  );
}

async function notifyEmail(subject: string, body: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_EMAIL;
  if (!host || !user || !pass || !to) return;

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: { user, pass },
  });

  await transporter.sendMail({ from: user, to, subject, text: body });
  log(`Email sent to ${to}: ${subject}`);
}

/** iMessage recipient — explicit IMESSAGE_TO, else PHONE from checkout identity. */
export function iMessageRecipient(): string | undefined {
  const explicit = process.env.IMESSAGE_TO?.trim();
  if (explicit) return explicit;
  return process.env.PHONE?.trim() || undefined;
}

function escAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Send via the Mac Messages app (iMessage or SMS relay).
 * Uses `service` + `buddy` — the `account` + `participant` API fails on current macOS.
 */
export function notifyIMessage(message: string): Promise<void> {
  const to = iMessageRecipient();
  if (!to || process.platform !== "darwin") return Promise.resolve();

  const body = escAppleScript(message.replace(/\r?\n/g, " — "));
  const toEsc = escAppleScript(to);

  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      [
        "-e",
        'tell application "Messages"',
        "-e",
        "set targetService to 1st service whose service type = iMessage",
        "-e",
        `set targetBuddy to buddy "${toEsc}" of targetService`,
        "-e",
        `send "${body}" to targetBuddy`,
        "-e",
        "end tell",
      ],
      (err, _stdout, stderr) => {
        if (err) {
          const detail = stderr?.trim() || err.message;
          log(`iMessage failed (${to}): ${detail}`);
          reject(new Error(detail));
          return;
        }
        log(`iMessage sent to ${to}`);
        resolve();
      }
    );
  });
}

export interface BookingNotifyEvent {
  success: boolean;
  title: string;
  message: string;
}

/** Notify across all configured channels (macOS, email, iMessage). */
export async function notifyBooking(event: BookingNotifyEvent): Promise<void> {
  const { title, message, success } = event;
  if (!success && process.env.NOTIFY_ON_FAILURE !== "true") {
    notifyMac(title, message);
    return;
  }

  notifyMac(title, message);
  try {
    await notifyIMessage(`${title} — ${message}`);
  } catch (err: any) {
    log(`iMessage skipped after error: ${err?.message ?? err}`);
  }
  try {
    await notifyEmail(title, message);
  } catch (err: any) {
    log(`Email failed: ${err?.message ?? err}`);
  }
}

/** Backward-compatible alias used by watcher errors. */
export function notify(title: string, message: string): void {
  void notifyBooking({ success: false, title, message });
}

export interface TestNotificationResult {
  channels: string[];
  errors: string[];
}

/** Send test notifications through all enabled channels. */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  const channels: string[] = [];
  const errors: string[] = [];
  const title = "TennReserve: test notification";
  const message = "If you see this, alerts are working.";

  notifyMac(title, message);
  channels.push("macOS");

  if (iMessageRecipient()) {
    try {
      await notifyIMessage(`${title} — ${message}`);
      channels.push("iMessage");
    } catch (err: any) {
      errors.push(`iMessage: ${err?.message ?? err}`);
    }
  } else {
    errors.push("iMessage: set IMESSAGE_TO or PHONE in .env");
  }

  if (process.env.SMTP_HOST && process.env.NOTIFY_EMAIL) {
    try {
      await notifyEmail(title, message);
      channels.push("email");
    } catch (err: any) {
      errors.push(`email: ${err?.message ?? err}`);
    }
  }

  return { channels, errors };
}
