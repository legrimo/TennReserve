import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const mer = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${mer}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** e.g. "Monday 7-13" from slot metadata */
export function formatSlotDayLabel(date: string, day: string): string {
  const [, mo, d] = date.split("-");
  return `${capitalize(day)} ${Number(mo)}-${Number(d)}`;
}

export function attemptLabel(attempt: {
  name?: string;
  id: string;
  slots: { date: string; day: string }[];
}): string {
  const top = attempt.slots[0];
  if (top) return formatSlotDayLabel(top.date, top.day);
  return attempt.name ?? attempt.id.slice(0, 8);
}

function parseLocalDate(iso: string): Date {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

function addDaysIso(iso: string, n: number): string {
  const dt = parseLocalDate(iso);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Midnight drop when a staging-day slot enters the NYC Parks published window. */
export function scheduledExecutionAt(slotDate: string): Date {
  const dropIso = addDaysIso(slotDate, -7);
  const d = parseLocalDate(dropIso);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatScheduledExecution(slotDate: string, now = new Date()): string {
  const at = scheduledExecutionAt(slotDate);
  if (at.getTime() <= now.getTime()) {
    return "Now — polling for open slots";
  }
  const ms = at.getTime() - now.getTime();
  const formatted = at.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatted} (in ${formatCountdown(ms)})`;
}
