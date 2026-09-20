import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { STORAGE_DIR } from "./config.js";
import { DEFAULT_FACILITY_ID, isCourtInFacility, resolveFacilityId } from "./facilities.js";
import { findBookingByReservationNumber } from "./bookings.js";
import { weekdayOf } from "./parser.js";
import type { BookingAttempt, Slot, SlotPick } from "./types.js";

export const ATTEMPTS_PATH = `${STORAGE_DIR}/attempts.json`;

let attemptsPersisted = false;

function migrateAttempt(raw: Record<string, unknown>): BookingAttempt {
  const a = raw as unknown as BookingAttempt & { status?: string; bookedSlot?: BookingAttempt["bookedSlot"] };
  if (String(a.status) === "completed") {
    a.status = "succeeded";
  }
  if (!a.bookingId && a.bookedSlot?.confirmation) {
    const booking = findBookingByReservationNumber(a.bookedSlot.confirmation);
    if (booking) a.bookingId = booking.id;
  }
  if (a.facilityId == null) {
    a.facilityId = DEFAULT_FACILITY_ID;
  }
  return a;
}

export function readAttempts(): BookingAttempt[] {
  if (!existsSync(ATTEMPTS_PATH)) return [];
  const raw: Record<string, unknown>[] = JSON.parse(readFileSync(ATTEMPTS_PATH, "utf8"));
  const needsPersist = raw.some(
    (r) => r.status === "completed" || (r.bookedSlot && !r.bookingId) || r.facilityId == null
  );
  const attempts = raw.map(migrateAttempt);
  if (!attemptsPersisted && needsPersist) {
    attemptsPersisted = true;
    writeAttempts(attempts);
  }
  return attempts;
}

function writeAttempts(attempts: BookingAttempt[]): void {
  writeFileSync(ATTEMPTS_PATH, JSON.stringify(attempts, null, 2) + "\n");
}

export function getAttempt(id: string): BookingAttempt | undefined {
  return readAttempts().find((a) => a.id === id);
}

export function listScheduledAttempts(): BookingAttempt[] {
  return readAttempts().filter((a) => a.status === "scheduled");
}

export function validateSlotPicks(slots: SlotPick[], facilityId: number): SlotPick[] {
  for (const s of slots) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new Error(`Invalid date ${s.date}`);
    if (!/^\d{2}:\d{2}$/.test(s.time24)) throw new Error(`Invalid time ${s.time24}`);
    if (!isCourtInFacility(facilityId, s.court)) {
      throw new Error(`Invalid court ${s.court} for facility ${facilityId}`);
    }
    s.day = s.day || weekdayOf(s.date);
  }
  return slots;
}

export function createAttempt(
  input: { name?: string; targetDate?: string; facilityId?: number } = {}
): BookingAttempt {
  const facilityId = resolveFacilityId(input.facilityId);
  const attempts = readAttempts();
  const attempt: BookingAttempt = {
    id: randomUUID(),
    name: input.name ?? (input.targetDate ? `Attempt ${input.targetDate}` : "New booking attempt"),
    status: "draft",
    facilityId,
    slots: [],
    createdAt: new Date().toISOString(),
  };
  attempts.push(attempt);
  writeAttempts(attempts);
  return attempt;
}

export function updateAttempt(
  id: string,
  patch: { name?: string; slots?: SlotPick[]; facilityId?: number }
): BookingAttempt {
  const attempts = readAttempts();
  const idx = attempts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Attempt ${id} not found`);
  const current = attempts[idx];
  if (current.status !== "draft") throw new Error("Only draft attempts can be edited");

  if (patch.name !== undefined) current.name = patch.name;
  if (patch.facilityId !== undefined) {
    current.facilityId = resolveFacilityId(patch.facilityId);
    current.slots = current.slots.filter((s) => isCourtInFacility(current.facilityId, s.court));
  }
  if (patch.slots !== undefined) {
    current.slots = validateSlotPicks(patch.slots, current.facilityId);
  }

  attempts[idx] = current;
  writeAttempts(attempts);
  return current;
}

export function scheduleAttempt(id: string): BookingAttempt {
  const attempts = readAttempts();
  const idx = attempts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Attempt ${id} not found`);
  const current = attempts[idx];
  if (current.status !== "draft") throw new Error("Only draft attempts can be scheduled");
  if (current.slots.length === 0) throw new Error("Add at least one slot before scheduling");

  current.status = "scheduled";
  current.scheduledAt = new Date().toISOString();
  attempts[idx] = current;
  writeAttempts(attempts);
  return current;
}

export function cancelAttempt(id: string): BookingAttempt {
  const attempts = readAttempts();
  const idx = attempts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Attempt ${id} not found`);
  const current = attempts[idx];
  if (current.status !== "scheduled") throw new Error("Only scheduled attempts can be cancelled");
  current.status = "cancelled";
  attempts[idx] = current;
  writeAttempts(attempts);
  return current;
}

export function succeedAttempt(id: string, bookingId: string): BookingAttempt {
  const attempts = readAttempts();
  const idx = attempts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Attempt ${id} not found`);
  attempts[idx].status = "succeeded";
  attempts[idx].bookingId = bookingId;
  delete attempts[idx].bookedSlot;
  writeAttempts(attempts);
  return attempts[idx];
}

/** @deprecated Use succeedAttempt */
export function completeAttempt(
  id: string,
  booked: SlotPick & { slotId: string; confirmation: string }
): BookingAttempt {
  void booked;
  throw new Error("completeAttempt is deprecated — use onBookingSuccess()");
}

export function failAttempt(id: string, error: string): BookingAttempt {
  const attempts = readAttempts();
  const idx = attempts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Attempt ${id} not found`);
  attempts[idx].status = "failed";
  attempts[idx].error = error;
  writeAttempts(attempts);
  return attempts[idx];
}

/** Auto-close a scheduled attempt when all target slots are gone after the drop. */
export function missAttempt(id: string, reason: string): BookingAttempt {
  const attempts = readAttempts();
  const idx = attempts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Attempt ${id} not found`);
  attempts[idx].status = "missed";
  attempts[idx].error = reason;
  attempts[idx].missedAt = new Date().toISOString();
  writeAttempts(attempts);
  return attempts[idx];
}

export function deleteAttempt(id: string): void {
  const attempts = readAttempts();
  const current = attempts.find((a) => a.id === id);
  if (!current) throw new Error(`Attempt ${id} not found`);
  if (!["draft", "cancelled", "succeeded", "failed", "missed"].includes(current.status)) {
    throw new Error("Cancel scheduled attempts before deleting");
  }
  writeAttempts(attempts.filter((a) => a.id !== id));
}

export function attemptFacilityId(attempt: BookingAttempt): number {
  return attempt.facilityId ?? DEFAULT_FACILITY_ID;
}
export function matchAttemptSlot(openSlots: Slot[], attempt: BookingAttempt): Slot | null {
  for (const pick of attempt.slots) {
    const hit = openSlots.find(
      (s) => s.date === pick.date && s.time24 === pick.time24 && s.court === pick.court
    );
    if (hit) return hit;
  }
  return null;
}
