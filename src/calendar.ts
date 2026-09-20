import { DEFAULT_FACILITY_ID, getFacility, type Facility } from "./facilities.js";
import { weekdayOf } from "./parser.js";
import type { GridCell, GridDay, CalendarSnapshot, DayZone } from "./types.js";

/** @deprecated Use getFacility(11).courts */
export const MCCARREN_COURTS = getFacility(11).courts;
/** @deprecated Use getFacility(11).hours */
export const MCCARREN_HOURS = getFacility(11).hours;

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function skeletonDay(date: string, published: boolean, facility: Facility): GridDay {
  const day = weekdayOf(date);
  const cells: GridCell[] = [];
  for (const time24 of facility.hours) {
    for (const court of facility.courts) {
      cells.push({ date, day, court, time24, status: "unavailable" });
    }
  }
  return { date, day, published, cells };
}

/** Computed calendar: today, published window (tomorrow..+7), staging (+8..+28). No Playwright. */
export function buildCalendar(facilityId: number = DEFAULT_FACILITY_ID): CalendarSnapshot {
  const facility = getFacility(facilityId);
  const today = todayIso();
  const dayZones: Record<string, DayZone> = {};
  const days: GridDay[] = [];

  dayZones[today] = "today";
  days.push(skeletonDay(today, true, facility));

  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, i);
    dayZones[date] = "published";
    days.push(skeletonDay(date, true, facility));
  }

  for (let i = 8; i <= 28; i++) {
    const date = addDays(today, i);
    dayZones[date] = "staging";
    days.push(skeletonDay(date, false, facility));
  }

  return {
    today,
    msUntilMidnight: msUntilMidnight(),
    days,
    dayZones,
    facilityId: facility.id,
    courts: [...facility.courts],
  };
}

/** Overlay live parsed grid cells onto the skeleton calendar. */
export function mergeLiveGrid(base: CalendarSnapshot, liveDays: GridDay[]): CalendarSnapshot {
  const liveByDate = new Map(liveDays.map((d) => [d.date, d]));
  const days = base.days.map((day) => {
    const live = liveByDate.get(day.date);
    if (!live) return day;
    const liveMap = new Map(live.cells.map((c) => [`${c.time24}-${c.court}`, c]));
    return {
      ...day,
      published: true,
      cells: day.cells.map((cell) => {
        const hit = liveMap.get(`${cell.time24}-${cell.court}`);
        return hit ? { ...cell, ...hit } : cell;
      }),
    };
  });
  return { ...base, days };
}

/** Overlay our confirmed bookings onto the calendar grid. */
export function mergeOwnedBookings(base: CalendarSnapshot, bookings: { date: string; day: string; time24: string; court: number; slotId: string; reservationNumber: string }[]): CalendarSnapshot {
  if (bookings.length === 0) return base;
  const byKey = new Map(
    bookings.map((b) => [`${b.date}-${b.time24}-${b.court}`, b])
  );
  const days = base.days.map((day) => ({
    ...day,
    cells: day.cells.map((cell) => {
      const hit = byKey.get(`${cell.date}-${cell.time24}-${cell.court}`);
      if (!hit) return cell;
      return {
        ...cell,
        status: "booked" as const,
        slotId: hit.slotId,
        owned: true,
        reservationNumber: hit.reservationNumber,
      };
    }),
  }));
  return { ...base, days };
}

export function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/** Local midnight when `slotDate` first enters the NYC Parks 7-day published window. */
export function scheduledExecutionAt(slotDate: string): Date {
  const dropIso = addDays(slotDate, -7);
  const [y, mo, d] = dropIso.split("-").map(Number);
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

/** Earliest drop time across slot dates, or null if none. */
export function earliestScheduledExecution(slotDates: string[]): Date | null {
  if (slotDates.length === 0) return null;
  let earliest: Date | null = null;
  for (const date of slotDates) {
    const at = scheduledExecutionAt(date);
    if (!earliest || at.getTime() < earliest.getTime()) earliest = at;
  }
  return earliest;
}

export type { DayZone };
