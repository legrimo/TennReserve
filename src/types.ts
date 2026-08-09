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
  /** True when this cell is one of our confirmed bookings */
  owned?: boolean;
  reservationNumber?: string;
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

/** @deprecated Legacy ledger row — migrated into Booking on read */
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

export interface BookingPaymentMethod {
  type: "card";
  last4: string;
  exp?: string;
}

/** Confirmed McCarren reservation after successful payment */
export interface Booking {
  id: string;
  reservationNumber: string;
  scheduledBookingId?: string;

  date: string;
  day: string;
  time24: string;
  court: number;
  slotId: string;
  location: string;
  reservationType?: string;

  paymentSuccess: boolean;
  paymentMethod: BookingPaymentMethod;
  amount?: string;

  receiptScreenshot?: string;
  bookedAt: string;
}

export interface CheckoutResult {
  slot: Slot;
  reservationNumber: string;
  receiptScreenshot?: string;
  amount?: string;
  paymentMethod: BookingPaymentMethod;
}

export interface BookingResult {
  ok: boolean;
  dryRun?: boolean;
  confirmation?: string;
  screenshot?: string;
  error?: string;
  checkout?: CheckoutResult;
}

export type AttemptStatus = "draft" | "scheduled" | "cancelled" | "succeeded" | "failed" | "missed";

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
  /** Set when status is missed (auto-closed after drop without booking). */
  missedAt?: string;
  bookingId?: string;
  /** @deprecated Migrated to bookingId + Booking entity */
  bookedSlot?: SlotPick & { slotId: string; confirmation: string };
  error?: string;
}

/** Alias for the scheduled-booking domain object */
export type ScheduledBooking = BookingAttempt;

export type DayZone = "today" | "published" | "staging";

export interface CalendarSnapshot {
  today: string;
  msUntilMidnight: number;
  days: GridDay[];
  dayZones: Record<string, DayZone>;
}
