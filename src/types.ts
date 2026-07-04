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

export interface TargetsConfig {
  enabled: boolean;
  courts: number[];
  targets: Target[];
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
