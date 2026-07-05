import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { STORAGE_DIR } from "./config.js";
import { weekdayOf } from "./parser.js";
import type { BookingAttempt, Slot, SlotPick } from "./types.js";

export const ATTEMPTS_PATH = `${STORAGE_DIR}/attempts.json`;

export function readAttempts(): BookingAttempt[] {
  if (!existsSync(ATTEMPTS_PATH)) return [];
  return JSON.parse(readFileSync(ATTEMPTS_PATH, "utf8"));
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

export function createAttempt(input: { name?: string; targetDate?: string } = {}): BookingAttempt {
  const attempts = readAttempts();
  const attempt: BookingAttempt = {
    id: randomUUID(),
    name: input.name ?? (input.targetDate ? `Attempt ${input.targetDate}` : "New booking attempt"),
    status: "draft",
    slots: [],
    createdAt: new Date().toISOString(),
  };
  attempts.push(attempt);
  writeAttempts(attempts);
  return attempt;
}

export function updateAttempt(
  id: string,
  patch: { name?: string; slots?: SlotPick[] }
): BookingAttempt {
  const attempts = readAttempts();
  const idx = attempts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Attempt ${id} not found`);
  const current = attempts[idx];
  if (current.status !== "draft") throw new Error("Only draft attempts can be edited");

  if (patch.name !== undefined) current.name = patch.name;
  if (patch.slots !== undefined) {
    for (const s of patch.slots) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new Error(`Invalid date ${s.date}`);
      if (!/^\d{2}:\d{2}$/.test(s.time24)) throw new Error(`Invalid time ${s.time24}`);
      if (![5, 6].includes(s.court)) throw new Error(`Invalid court ${s.court}`);
      s.day = s.day || weekdayOf(s.date);
    }
    current.slots = patch.slots;
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

export function completeAttempt(
  id: string,
  booked: SlotPick & { slotId: string; confirmation: string }
): BookingAttempt {
  const attempts = readAttempts();
  const idx = attempts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Attempt ${id} not found`);
  attempts[idx].status = "completed";
  attempts[idx].bookedSlot = booked;
  writeAttempts(attempts);
  return attempts[idx];
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

export function deleteAttempt(id: string): void {
  const attempts = readAttempts();
  const current = attempts.find((a) => a.id === id);
  if (!current) throw new Error(`Attempt ${id} not found`);
  if (!["draft", "cancelled", "completed", "failed"].includes(current.status)) {
    throw new Error("Cancel scheduled attempts before deleting");
  }
  writeAttempts(attempts.filter((a) => a.id !== id));
}

/** Match open slots against an attempt's priority list. */
export function matchAttemptSlot(openSlots: Slot[], attempt: BookingAttempt): Slot | null {
  for (const pick of attempt.slots) {
    const hit = openSlots.find(
      (s) => s.date === pick.date && s.time24 === pick.time24 && s.court === pick.court
    );
    if (hit) return hit;
  }
  return null;
}
