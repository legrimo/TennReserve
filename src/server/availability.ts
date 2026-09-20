import { fetchAvailabilityHttp } from "../fetchAvailability.js";
import { DEFAULT_FACILITY_ID, getFacility } from "../facilities.js";
import { parseAvailability, parseAvailabilityGrid } from "../parser.js";
import { buildCalendar, mergeLiveGrid } from "../calendar.js";
import type { CalendarSnapshot, GridDay, Slot } from "../types.js";

const cache = new Map<
  number,
  { at: number; snapshot: CalendarSnapshot; slots: Slot[]; live: boolean; error?: string }
>();
const CACHE_MS = 45_000;

export { msUntilMidnight } from "../calendar.js";

export interface AvailabilityResponse extends CalendarSnapshot {
  fetchedAt: string;
  live: boolean;
  error?: string;
  slots: Slot[];
  facilityName: string;
}

async function fetchLive(facilityId: number): Promise<{ gridDays: GridDay[]; slots: Slot[] }> {
  const html = await fetchAvailabilityHttp(facilityId);
  return {
    gridDays: parseAvailabilityGrid(html),
    slots: parseAvailability(html, facilityId),
  };
}

export async function getAvailability(
  force = false,
  facilityId: number = DEFAULT_FACILITY_ID
): Promise<AvailabilityResponse> {
  const cached = cache.get(facilityId);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    const { snapshot, slots, live, error } = cached;
    return {
      ...snapshot,
      fetchedAt: new Date(cached.at).toISOString(),
      live,
      error,
      slots,
      facilityName: getFacility(facilityId).name,
    };
  }

  const facilityName = getFacility(facilityId).name;
  const base = buildCalendar(facilityId);
  try {
    const { gridDays, slots } = await fetchLive(facilityId);
    const merged = mergeLiveGrid(base, gridDays);
    cache.set(facilityId, { at: Date.now(), snapshot: merged, slots, live: true });
    return {
      ...merged,
      fetchedAt: new Date().toISOString(),
      live: true,
      slots,
      facilityName,
    };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    cache.set(facilityId, { at: Date.now(), snapshot: base, slots: [], live: false, error: message });
    return {
      ...base,
      fetchedAt: new Date().toISOString(),
      live: false,
      error: message,
      slots: [],
      facilityName,
    };
  }
}

export function getCalendar(facilityId: number = DEFAULT_FACILITY_ID): CalendarSnapshot {
  return buildCalendar(facilityId);
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
