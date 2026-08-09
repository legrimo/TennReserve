import { failAttempt } from "./attempts.js";
import { book } from "./booker.js";
import { onBookingSuccess } from "./bookingFlow.js";
import { log, notify } from "./notify.js";
import type { BookingAttempt, BookingResult, CheckoutResult, GridDay, Slot, SlotPick } from "./types.js";

export const SCHEDULED_PASSES = 3;
export const SLOT_RETRY_DELAY_MS = 2_000;

export type ScheduledAttemptResult = "booked" | "no_slots_yet" | "failed";

export type BookFn = (
  slot: Slot,
  opts: { headless?: boolean; notifyOnFailure?: boolean }
) => Promise<BookingResult>;

function findOpenSlot(openSlots: Slot[], pick: SlotPick): Slot | undefined {
  return openSlots.find(
    (s) => s.date === pick.date && s.time24 === pick.time24 && s.court === pick.court
  );
}

/** True when at least one pick's date is on the live published grid. */
export function anyPickDatePublished(attempt: BookingAttempt, gridDays: GridDay[]): boolean {
  return attempt.slots.some((pick) => {
    const day = gridDays.find((d) => d.date === pick.date);
    return day?.published === true;
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function runScheduledAttemptWithBook(
  attempt: BookingAttempt,
  fetchOpenSlots: () => Promise<Slot[]>,
  bookFn: BookFn,
  opts: {
    headless?: boolean;
    onBooked?: (checkout: CheckoutResult) => void;
    onFailed?: (message: string) => void;
    sleepFn?: (ms: number) => Promise<void>;
    /** Reuse a fetch from the outer poll cycle for pass 1. */
    initialOpenSlots?: Slot[];
    /** Grid from the outer poll — used to skip passes 2–3 when days aren't published yet. */
    initialGridDays?: GridDay[];
  } = {}
): Promise<ScheduledAttemptResult> {
  let anyBookAttempted = false;
  let lastError = "";
  const wait = opts.sleepFn ?? sleep;

  for (let pass = 1; pass <= SCHEDULED_PASSES; pass++) {
    log(`ATTEMPT ${attempt.id}: pass ${pass}/${SCHEDULED_PASSES}`);
    const openSlots =
      pass === 1 && opts.initialOpenSlots ? opts.initialOpenSlots : await fetchOpenSlots();

    for (const pick of attempt.slots) {
      const slot = findOpenSlot(openSlots, pick);
      if (!slot) continue;

      anyBookAttempted = true;
      log(
        `ATTEMPT ${attempt.id}: trying ${slot.date} ${slot.day} ${slot.time24} court ${slot.court} (pass ${pass})`
      );
      const result = await bookFn(slot, { headless: opts.headless, notifyOnFailure: false });
      if (result.ok && result.checkout) {
        if (opts.onBooked) {
          opts.onBooked(result.checkout);
        } else {
          const booking = onBookingSuccess(attempt.id, result.checkout);
          log(`Attempt ${attempt.id} succeeded — booking ${booking.id} (${booking.reservationNumber})`);
        }
        return "booked";
      }
      lastError = result.error ?? "booking failed";
      log(`ATTEMPT ${attempt.id}: court ${slot.court} failed: ${lastError}`);
      await wait(SLOT_RETRY_DELAY_MS);
    }

    // No open matches on pass 1 and target day(s) not on Parks yet → don't refetch.
    if (pass === 1 && !anyBookAttempted && opts.initialGridDays) {
      if (!anyPickDatePublished(attempt, opts.initialGridDays)) {
        log(`ATTEMPT ${attempt.id}: target day(s) not published yet — skipping further passes`);
        return "no_slots_yet";
      }
    }
  }

  if (!anyBookAttempted) {
    log(`ATTEMPT ${attempt.id}: no matching open slots yet`);
    return "no_slots_yet";
  }

  const message = `All ${SCHEDULED_PASSES} passes failed — ${lastError}`;
  if (opts.onFailed) {
    opts.onFailed(message);
  } else {
    failAttempt(attempt.id, message);
    log(`Attempt ${attempt.id} marked failed: ${message}`);
    notify("TennReserve: scheduled attempt FAILED", message);
  }
  return "failed";
}

export async function runScheduledAttempt(
  attempt: BookingAttempt,
  fetchOpenSlots: () => Promise<Slot[]>,
  opts: { headless?: boolean; initialOpenSlots?: Slot[]; initialGridDays?: GridDay[] } = {}
): Promise<ScheduledAttemptResult> {
  return runScheduledAttemptWithBook(attempt, fetchOpenSlots, book, opts);
}
