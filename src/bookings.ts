import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { BOOKINGS_PATH, LEDGER_PATH, loadIdentity } from "./config.js";
import { DEFAULT_FACILITY_ID, getFacility, resolveFacilityId } from "./facilities.js";
import type { Booking, BookingRecord, CheckoutResult } from "./types.js";

let migrated = false;

function migrateFromLedger(existing: Booking[]): Booking[] {
  if (migrated || !existsSync(LEDGER_PATH)) return existing;
  migrated = true;

  let last4 = "????";
  try {
    last4 = loadIdentity().cardNumber.slice(-4);
  } catch {
    /* identity optional during migration */
  }

  const ledger: BookingRecord[] = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
  const known = new Set(existing.map((b) => b.reservationNumber));

  for (const row of ledger) {
    if (known.has(row.confirmation)) continue;
    existing.push({
      id: randomUUID(),
      reservationNumber: row.confirmation,
      date: row.date,
      day: row.day,
      time24: row.time24,
      court: row.court,
      slotId: row.slotId,
      location: "McCarren Park",
      facilityId: DEFAULT_FACILITY_ID,
      reservationType: "Singles",
      paymentSuccess: true,
      paymentMethod: { type: "card", last4 },
      amount: row.amount,
      bookedAt: row.bookedAt,
    });
  }

  if (ledger.length > 0 && existing.length > 0) {
    writeFileSync(BOOKINGS_PATH, JSON.stringify(existing, null, 2) + "\n");
  }

  return existing;
}

export function readBookings(): Booking[] {
  let bookings: Booking[] = [];
  if (existsSync(BOOKINGS_PATH)) {
    bookings = JSON.parse(readFileSync(BOOKINGS_PATH, "utf8"));
  }
  bookings = migrateFromLedger(bookings);
  let changed = false;
  for (const b of bookings) {
    if (b.facilityId == null) {
      b.facilityId = DEFAULT_FACILITY_ID;
      if (!b.location) b.location = getFacility(DEFAULT_FACILITY_ID).name;
      changed = true;
    }
  }
  if (changed) writeBookings(bookings);
  return bookings;
}

function writeBookings(bookings: Booking[]): void {
  writeFileSync(BOOKINGS_PATH, JSON.stringify(bookings, null, 2) + "\n");
}

export function getBooking(id: string): Booking | undefined {
  return readBookings().find((b) => b.id === id);
}

export function findBookingByReservationNumber(reservationNumber: string): Booking | undefined {
  return readBookings().find((b) => b.reservationNumber === reservationNumber);
}

export function createBookingFromCheckout(
  checkout: CheckoutResult,
  scheduledBookingId?: string
): Booking {
  const { slot, reservationNumber, receiptScreenshot, amount, paymentMethod } = checkout;
  const facilityId = resolveFacilityId(slot.facilityId);
  const booking: Booking = {
    id: randomUUID(),
    reservationNumber,
    scheduledBookingId,
    date: slot.date,
    day: slot.day,
    time24: slot.time24,
    court: slot.court,
    slotId: slot.slotId,
    location: getFacility(facilityId).name,
    facilityId,
    reservationType: "Singles",
    paymentSuccess: true,
    paymentMethod,
    amount,
    receiptScreenshot,
    bookedAt: new Date().toISOString(),
  };

  const bookings = readBookings();
  bookings.push(booking);
  writeBookings(bookings);
  return booking;
}

/** Site rule: max one active reservation per day. */
export function hasBookingOn(date: string): boolean {
  return readBookings().some((b) => b.date === date);
}
