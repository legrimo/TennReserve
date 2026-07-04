import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { LEDGER_PATH } from "./config.js";
import type { BookingRecord } from "./types.js";

export function readLedger(): BookingRecord[] {
  if (!existsSync(LEDGER_PATH)) return [];
  return JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
}

export function appendBooking(record: BookingRecord): void {
  const ledger = readLedger();
  ledger.push(record);
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

/** Site rule: max one active reservation per day. */
export function hasBookingOn(date: string): boolean {
  return readLedger().some((r) => r.date === date);
}
