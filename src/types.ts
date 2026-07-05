export interface Slot {
  /** ISO date, e.g. "2026-07-03" */
  date: string;
  /** Lowercase weekday name, e.g. "friday" */
  day: string;
  /** 24h start time, e.g. "17:00" */
  time24: string;
  /** Court number, e.g. 5 */
  court: number;
  /** NYC Parks slot id from the reserve link */
  slotId: string;
  /** Absolute reserve URL */
  url: string;
}

export interface Target {
  day: string;
  /** [from, to) in 24h "HH:MM" — matches slot start times */
  between: [string, string];
}

export type BookingMode = "first_match" | "multi_match";

export interface TargetsConfig {
  enabled: boolean;
  courts: number[];
  bookingMode?: BookingMode;
  targets: Target[];
}

export type GridCellStatus = "available" | "booked" | "unavailable" | "held";

export interface GridCell {
  date: string;
  day: string;
  court: number;
  time24: string;
  status: GridCellStatus;
  slotId?: string;
  url?: string;
}

export interface GridDay {
  date: string;
  day: string;
  published: boolean;
  cells: GridCell[];
}

export interface AvailabilitySnapshot {
  fetchedAt: string;
  publishedDates: string[];
  candidateDate: string | null;
  today: string;
  days: GridDay[];
  slots: Slot[];
}

export interface BookingRecord {
  date: string;
  day: string;
  time24: string;
  court: number;
  slotId: string;
  confirmation: string;
  amount?: string;
  bookedAt: string;
}

export interface BookingResult {
  ok: boolean;
  dryRun?: boolean;
  confirmation?: string;
  screenshot?: string;
  error?: string;
}

export type AttemptStatus = "draft" | "scheduled" | "completed" | "cancelled" | "failed";

export interface SlotPick {
  date: string;
  day: string;
  time24: string;
  court: number;
}

export interface BookingAttempt {
  id: string;
  name?: string;
  status: AttemptStatus;
  slots: SlotPick[];
  createdAt: string;
  scheduledAt?: string;
  bookedSlot?: SlotPick & { slotId: string; confirmation: string };
  error?: string;
}

export type DayZone = "today" | "published" | "staging";

export interface CalendarSnapshot {
  today: string;
  msUntilMidnight: number;
  days: GridDay[];
  dayZones: Record<string, DayZone>;
}
