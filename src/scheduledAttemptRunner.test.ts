/** Unit tests for scheduled attempt pass/retry logic (mocked book, no Playwright). */
import {
  runScheduledAttemptWithBook,
  SCHEDULED_PASSES,
  type BookFn,
} from "./scheduledAttemptRunner.js";
import type { BookingAttempt, GridDay, Slot } from "./types.js";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    failures++;
    console.error(`FAIL  ${msg}`);
  }
}

const slot5: Slot = {
  slotId: "1",
  date: "2026-07-13",
  day: "monday",
  time24: "18:00",
  court: 5,
  url: "https://example.com/1",
};

const slot6: Slot = {
  slotId: "2",
  date: "2026-07-13",
  day: "monday",
  time24: "18:00",
  court: 6,
  url: "https://example.com/2",
};

const attempt: BookingAttempt = {
  id: "test-attempt",
  status: "scheduled",
  slots: [
    { date: "2026-07-13", day: "monday", time24: "18:00", court: 5 },
    { date: "2026-07-13", day: "monday", time24: "18:00", court: 6 },
  ],
  createdAt: new Date().toISOString(),
};

const noopSleep = async () => {};

async function runTest(
  name: string,
  fetchOpenSlots: () => Promise<Slot[]>,
  bookFn: BookFn,
  expected: "booked" | "no_slots_yet" | "failed"
) {
  const result = await runScheduledAttemptWithBook(attempt, fetchOpenSlots, bookFn, {
    onBooked: () => {},
    onFailed: () => {},
    sleepFn: noopSleep,
  });
  assert(result === expected, `${name} → ${expected} (got ${result})`);
}

// All picks unavailable → no_slots_yet (no failAttempt)
await runTest(
  "all picks unavailable",
  async () => [],
  async () => ({ ok: false, error: "should not book" }),
  "no_slots_yet"
);

// Pick 1 fails, pick 2 succeeds on pass 1
let bookCalls = 0;
await runTest(
  "pick 1 fails, pick 2 succeeds",
  async () => [slot5, slot6],
  async (slot) => {
    bookCalls++;
    if (slot.court === 5) return { ok: false, error: "taken" };
    return {
      ok: true,
      confirmation: "ABC123",
      checkout: {
        slot,
        reservationNumber: "ABC123",
        receiptScreenshot: "/tmp/x.png",
        paymentMethod: { type: "card", last4: "1234", exp: "06/31" },
      },
    };
  },
  "booked"
);
assert(bookCalls === 2, `pick 1 fails then pick 2: 2 book calls (got ${bookCalls})`);

// Both picks fail all passes → failed
bookCalls = 0;
await runTest(
  "all picks fail all passes",
  async () => [slot5, slot6],
  async () => {
    bookCalls++;
    return { ok: false, error: "taken" };
  },
  "failed"
);
assert(
  bookCalls === SCHEDULED_PASSES * 2,
  `all passes exhausted: ${SCHEDULED_PASSES * 2} book calls (got ${bookCalls})`
);

// Pick 1 fails pass 1; pass 2 pick 1 absent, pick 2 succeeds
bookCalls = 0;
let fetchCount = 0;
await runTest(
  "pick 1 gone on pass 2, pick 2 succeeds",
  async () => {
    fetchCount++;
    return fetchCount === 1 ? [slot5, slot6] : [slot6];
  },
  async (slot) => {
    bookCalls++;
    if (slot.court === 5) return { ok: false, error: "taken" };
    return {
      ok: true,
      confirmation: "XYZ789",
      checkout: {
        slot,
        reservationNumber: "XYZ789",
        receiptScreenshot: "/tmp/y.png",
        paymentMethod: { type: "card", last4: "5678", exp: "06/31" },
      },
    };
  },
  "booked"
);
assert(bookCalls === 2, `pass 2 fallback: 2 book calls (got ${bookCalls})`);

// Unpublished target day → skip passes 2–3 (single fetch via initialOpenSlots)
fetchCount = 0;
{
  const unpublishedGrid: GridDay[] = [];
  const result = await runScheduledAttemptWithBook(
    attempt,
    async () => {
      fetchCount++;
      return [];
    },
    async () => ({ ok: false, error: "should not book" }),
    {
      onBooked: () => {},
      onFailed: () => {},
      sleepFn: noopSleep,
      initialOpenSlots: [],
      initialGridDays: unpublishedGrid,
    }
  );
  assert(result === "no_slots_yet", `unpublished day → no_slots_yet (got ${result})`);
  assert(fetchCount === 0, `unpublished day: no extra fetches (got ${fetchCount})`);
}

// Published day but picks closed → still run further passes (refetch)
fetchCount = 0;
bookCalls = 0;
{
  const publishedGrid: GridDay[] = [
    {
      date: "2026-07-13",
      day: "monday",
      published: true,
      cells: [
        {
          date: "2026-07-13",
          day: "monday",
          court: 5,
          time24: "18:00",
          status: "booked",
        },
      ],
    },
  ];
  const result = await runScheduledAttemptWithBook(
    attempt,
    async () => {
      fetchCount++;
      return fetchCount === 1 ? [] : [slot6];
    },
    async (slot) => {
      bookCalls++;
      return {
        ok: true,
        confirmation: "PUB1",
        checkout: {
          slot,
          reservationNumber: "PUB1",
          paymentMethod: { type: "card", last4: "0000" },
        },
      };
    },
    {
      onBooked: () => {},
      onFailed: () => {},
      sleepFn: noopSleep,
      initialOpenSlots: [],
      initialGridDays: publishedGrid,
    }
  );
  assert(result === "booked", `published empty then open → booked (got ${result})`);
  assert(fetchCount >= 1, `published day: refetched (got ${fetchCount})`);
  assert(bookCalls === 1, `published day: 1 book call (got ${bookCalls})`);
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll scheduled attempt runner tests passed.");
