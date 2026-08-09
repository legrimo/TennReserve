import { createBookingFromCheckout } from "./bookings.js";
import { succeedAttempt } from "./attempts.js";
import type { Booking, CheckoutResult } from "./types.js";

/** Create a Booking and optionally mark the scheduled booking as succeeded. */
export function onBookingSuccess(
  scheduledBookingId: string | undefined,
  checkout: CheckoutResult
): Booking {
  const booking = createBookingFromCheckout(checkout, scheduledBookingId);
  if (scheduledBookingId) {
    succeedAttempt(scheduledBookingId, booking.id);
  }
  return booking;
}
