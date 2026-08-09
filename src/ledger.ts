import { readBookings } from "./bookings.js";
import type { BookingRecord } from "./types.js";

/** @deprecated Use readBookings() — ledger rows are migrated into bookings.json */
export function readLedger(): BookingRecord[] {
  return readBookings().map((b) => ({
    date: b.date,
    day: b.day,
    time24: b.time24,
    court: b.court,
    slotId: b.slotId,
    confirmation: b.reservationNumber,
    amount: b.amount,
    bookedAt: b.bookedAt,
  }));
}

/** @deprecated Bookings are created via bookingFlow.onBookingSuccess */
export function appendBooking(record: BookingRecord): void {
  void record;
  throw new Error("appendBooking is deprecated — use onBookingSuccess()");
}

export { hasBookingOn } from "./bookings.js";
