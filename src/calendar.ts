import { weekdayOf } from "./parser.js";
import type { GridCell, GridDay, CalendarSnapshot, DayZone } from "./types.js";

export const MCCARREN_COURTS = [5, 6];
/** Bookable 1-hour slot start times at McCarren (facility 11). */
export const MCCARREN_HOURS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
];

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function skeletonDay(date: string, published: boolean): GridDay {
  const day = weekdayOf(date);
  const cells: GridCell[] = [];
  for (const time24 of MCCARREN_HOURS) {
    for (const court of MCCARREN_COURTS) {
      cells.push({ date, day, court, time24, status: "unavailable" });
    }
  }
  return { date, day, published, cells };
}

/** Computed calendar: today, published window (tomorrow..+7), staging (+8..+14). No Playwright. */
export function buildCalendar(): CalendarSnapshot {
  const today = todayIso();
  const dayZones: Record<string, DayZone> = {};
  const days: GridDay[] = [];

  dayZones[today] = "today";
  days.push(skeletonDay(today, true));

  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, i);
    dayZones[date] = "published";
    days.push(skeletonDay(date, true));
  }

  for (let i = 8; i <= 14; i++) {
    const date = addDays(today, i);
    dayZones[date] = "staging";
    days.push(skeletonDay(date, false));
  }

  return {
    today,
    msUntilMidnight: msUntilMidnight(),
    days,
    dayZones,
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

export function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export type { DayZone };
