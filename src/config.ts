import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import dotenv from "dotenv";
import type { TargetsConfig } from "./types.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const STORAGE_DIR = join(ROOT, "storage");
export const PROFILE_DIR = join(STORAGE_DIR, "profile");
export const SCREENSHOT_DIR = join(STORAGE_DIR, "screenshots");
export const LEDGER_PATH = join(STORAGE_DIR, "ledger.json");
export const LOG_PATH = join(STORAGE_DIR, "tennreserve.log");

export const FACILITY_ID = 11; // McCarren Park
export const AVAILABILITY_URL = `https://www.nycgovparks.org/tennisreservation/availability/${FACILITY_ID}`;

dotenv.config({ path: join(ROOT, ".env"), quiet: true });

for (const dir of [STORAGE_DIR, SCREENSHOT_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const TIME_RE = /^\d{2}:\d{2}$/;

/** Re-read config/targets.yaml on every call so weekly edits apply without a restart. */
export function loadTargets(): TargetsConfig {
  const raw = parse(readFileSync(join(ROOT, "config", "targets.yaml"), "utf8"));
  const cfg: TargetsConfig = {
    enabled: raw.enabled === true,
    courts: Array.isArray(raw.courts) ? raw.courts.map(Number) : [5, 6],
    targets: (raw.targets ?? []).map((t: any) => ({
      day: String(t.day).toLowerCase(),
      between: [String(t.between[0]), String(t.between[1])] as [string, string],
    })),
  };
  for (const t of cfg.targets) {
    if (!WEEKDAYS.includes(t.day)) throw new Error(`targets.yaml: unknown day "${t.day}"`);
    if (!TIME_RE.test(t.between[0]) || !TIME_RE.test(t.between[1]))
      throw new Error(`targets.yaml: times must be "HH:MM" 24h (got ${t.between.join("–")})`);
    if (t.between[0] >= t.between[1])
      throw new Error(`targets.yaml: "from" must be before "to" (${t.day}: ${t.between.join("–")})`);
  }
  return cfg;
}

export interface Identity {
  cardNumber: string;
  cardExpMonth: string;
  cardExpYear: string;
  cardCvv: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  billingAddress: string;
  billingApt?: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  /** Optional — only needed if PARTY_PERMITS is 1 or 2 */
  permitNumber?: string;
  /** How many in the party have a season/single-play permit: none | 1 | 2 (default 2) */
  partyPermits: "none" | "1" | "2";
  player2Name?: string;
  player2Permit?: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} — copy .env.example to .env and fill it in.`);
  return v;
}

function partyPermitsFromEnv(): "none" | "1" | "2" {
  const v = (process.env.PARTY_PERMITS ?? "2").toLowerCase();
  if (v === "none" || v === "0") return "none";
  if (v === "1") return "1";
  if (v === "2") return "2";
  throw new Error(`PARTY_PERMITS must be none, 1, or 2 (got ${process.env.PARTY_PERMITS})`);
}

export function loadIdentity(): Identity {
  const partyPermits = partyPermitsFromEnv();
  return {
    cardNumber: required("CARD_NUMBER"),
    cardExpMonth: required("CARD_EXP_MONTH").padStart(2, "0"),
    cardExpYear: required("CARD_EXP_YEAR"),
    cardCvv: required("CARD_CVV"),
    firstName: required("FIRST_NAME"),
    lastName: required("LAST_NAME"),
    email: required("EMAIL"),
    phone: required("PHONE"),
    billingAddress: required("BILLING_ADDRESS"),
    billingApt: process.env.BILLING_APT,
    billingCity: required("BILLING_CITY"),
    billingState: required("BILLING_STATE"),
    billingZip: required("BILLING_ZIP"),
    permitNumber: process.env.PERMIT_NUMBER,
    partyPermits,
    player2Name: process.env.PLAYER2_NAME,
    player2Permit: process.env.PLAYER2_PERMIT,
  };
}
