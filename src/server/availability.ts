import { launchContext } from "../browser.js";
import { fetchAvailabilityHtml } from "../navigate.js";
import { parseAvailability, parseAvailabilityGrid } from "../parser.js";
import { buildCalendar, mergeLiveGrid } from "../calendar.js";
import type { CalendarSnapshot, GridDay, Slot } from "../types.js";

let cache: { at: number; snapshot: CalendarSnapshot; slots: Slot[]; live: boolean; error?: string } | null =
  null;
const CACHE_MS = 45_000;

export { msUntilMidnight } from "../calendar.js";

export interface AvailabilityResponse extends CalendarSnapshot {
  fetchedAt: string;
  live: boolean;
  error?: string;
  slots: Slot[];
}

async function fetchLive(): Promise<{ gridDays: GridDay[]; slots: Slot[] }> {
  const ctx = await launchContext({ headless: true });
  const page = await ctx.newPage();
  try {
    const html = await fetchAvailabilityHtml(page);
    return {
      gridDays: parseAvailabilityGrid(html),
      slots: parseAvailability(html),
    };
  } finally {
    await ctx.close();
  }
}

export async function getAvailability(force = false): Promise<AvailabilityResponse> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    const { snapshot, slots, live, error } = cache;
    return {
      ...snapshot,
      fetchedAt: new Date(cache.at).toISOString(),
      live,
      error,
      slots,
    };
  }

  const base = buildCalendar();
  try {
    const { gridDays, slots } = await fetchLive();
    const merged = mergeLiveGrid(base, gridDays);
    cache = { at: Date.now(), snapshot: merged, slots, live: true };
    return {
      ...merged,
      fetchedAt: new Date().toISOString(),
      live: true,
      slots,
    };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    cache = { at: Date.now(), snapshot: base, slots: [], live: false, error: message };
    return {
      ...base,
      fetchedAt: new Date().toISOString(),
      live: false,
      error: message,
      slots: [],
    };
  }
}

export function getCalendar(): CalendarSnapshot {
  return buildCalendar();
}

export function resolveSlot(
  snapshot: CalendarSnapshot,
  date: string,
  time24: string,
  court: number
) {
  const day = snapshot.days.find((d) => d.date === date);
  if (!day) return { found: false as const, reason: "not_found" as const };
  const cell = day.cells.find((c) => c.time24 === time24 && c.court === court);
  if (!cell) return { found: false as const, reason: "not_found" as const };
  if (!day.published) return { found: false as const, reason: "not_published" as const };
  return { found: true as const, cell };
}
