import { evaluateAttemptMiss } from "./attemptMiss.js";
import type { BookingAttempt, GridDay } from "./types.js";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ok  ${msg}`);
  else {
    failures++;
    console.error(`FAIL  ${msg}`);
  }
}

const attempt: BookingAttempt = {
  id: "a1",
  status: "scheduled",
  facilityId: 11,
  slots: [
    { date: "2026-07-13", day: "monday", time24: "18:00", court: 5 },
    { date: "2026-07-13", day: "monday", time24: "18:00", court: 6 },
  ],
  createdAt: new Date().toISOString(),
};

const gridBooked: GridDay[] = [
  {
    date: "2026-07-13",
    day: "monday",
    published: true,
    cells: [
      { date: "2026-07-13", day: "monday", time24: "18:00", court: 5, status: "booked" },
      { date: "2026-07-13", day: "monday", time24: "18:00", court: 6, status: "unavailable" },
    ],
  },
];

const gridOpen: GridDay[] = [
  {
    date: "2026-07-13",
    day: "monday",
    published: true,
    cells: [
      { date: "2026-07-13", day: "monday", time24: "18:00", court: 5, status: "booked" },
      { date: "2026-07-13", day: "monday", time24: "18:00", court: 6, status: "available", slotId: "99" },
    ],
  },
];

const gridUnpublished: GridDay[] = [];

assert(evaluateAttemptMiss(attempt, gridUnpublished) === null, "unpublished day → not missed");
assert(evaluateAttemptMiss(attempt, gridOpen) === null, "fallback slot still available → not missed");
const miss = evaluateAttemptMiss(attempt, gridBooked);
assert(miss !== null, "all targets gone → missed");
if (miss) {
  assert(miss.reason.includes("18:00 Court 5: booked"), "reason mentions court 5 booked");
  assert(miss.reason.includes("18:00 Court 6: unavailable"), "reason mentions court 6 unavailable");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll attempt miss tests passed.");
