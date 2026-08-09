import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import dotenv from "dotenv";
import type { BookingMode, TargetsConfig } from "./types.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TARGETS_PATH = join(ROOT, "config", "targets.yaml");
export const ENV_PATH = join(ROOT, ".env");
export const STORAGE_DIR = join(ROOT, "storage");
export const PROFILE_DIR = join(STORAGE_DIR, "profile");
export const SCREENSHOT_DIR = join(STORAGE_DIR, "screenshots");
export const BOOKINGS_PATH = join(STORAGE_DIR, "bookings.json");
export const LEDGER_PATH = join(STORAGE_DIR, "ledger.json");
export const LOG_PATH = join(STORAGE_DIR, "tennreserve.log");

export const FACILITY_ID = 11; // McCarren Park
export const AVAILABILITY_URL = `https://www.nycgovparks.org/tennisreservation/availability/${FACILITY_ID}`;

dotenv.config({ path: ENV_PATH, quiet: true });

for (const dir of [STORAGE_DIR, SCREENSHOT_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const TIME_RE = /^\d{2}:\d{2}$/;

export function validateTargetsConfig(cfg: TargetsConfig): void {
  for (const t of cfg.targets) {
    if (!WEEKDAYS.includes(t.day)) throw new Error(`targets.yaml: unknown day "${t.day}"`);
    if (!TIME_RE.test(t.between[0]) || !TIME_RE.test(t.between[1]))
      throw new Error(`targets.yaml: times must be "HH:MM" 24h (got ${t.between.join("–")})`);
    if (t.between[0] >= t.between[1])
      throw new Error(`targets.yaml: "from" must be before "to" (${t.day}: ${t.between.join("–")})`);
  }
}

/** Re-read config/targets.yaml on every call so weekly edits apply without a restart. */
export function loadTargets(): TargetsConfig {
  const raw = parse(readFileSync(TARGETS_PATH, "utf8"));
  const mode = raw.bookingMode as BookingMode | undefined;
  const cfg: TargetsConfig = {
    enabled: raw.enabled === true,
    courts: Array.isArray(raw.courts) ? raw.courts.map(Number) : [5, 6],
    bookingMode: mode === "multi_match" ? "multi_match" : "first_match",
    targets: (raw.targets ?? []).map((t: any) => ({
      day: String(t.day).toLowerCase(),
      between: [String(t.between[0]), String(t.between[1])] as [string, string],
    })),
  };
  validateTargetsConfig(cfg);
  return cfg;
}

export function saveTargets(cfg: TargetsConfig): void {
  validateTargetsConfig(cfg);
  const doc = {
    enabled: cfg.enabled,
    courts: cfg.courts,
    bookingMode: cfg.bookingMode ?? "first_match",
    targets: cfg.targets,
  };
  writeFileSync(TARGETS_PATH, stringify(doc, { lineWidth: 0 }) + "\n");
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

export interface IdentityUi extends Omit<Identity, "cardNumber" | "cardCvv"> {
  cardNumberMasked: string;
  cardCvvSet: boolean;
}

function maskCard(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

/** Safe identity for the dashboard — secrets masked. */
export function loadIdentityForUi(): IdentityUi {
  try {
    const id = loadIdentity();
    const { cardNumber, cardCvv, ...rest } = id;
    return { ...rest, cardNumberMasked: maskCard(cardNumber), cardCvvSet: !!cardCvv };
  } catch {
    return {
      cardNumberMasked: "",
      cardCvvSet: false,
      cardExpMonth: process.env.CARD_EXP_MONTH?.padStart(2, "0") ?? "",
      cardExpYear: process.env.CARD_EXP_YEAR ?? "",
      firstName: process.env.FIRST_NAME ?? "",
      lastName: process.env.LAST_NAME ?? "",
      email: process.env.EMAIL ?? "",
      phone: process.env.PHONE ?? "",
      billingAddress: process.env.BILLING_ADDRESS ?? "",
      billingApt: process.env.BILLING_APT,
      billingCity: process.env.BILLING_CITY ?? "",
      billingState: process.env.BILLING_STATE ?? "NY",
      billingZip: process.env.BILLING_ZIP ?? "",
      permitNumber: process.env.PERMIT_NUMBER,
      partyPermits: (() => {
        try {
          return partyPermitsFromEnv();
        } catch {
          return "2" as const;
        }
      })(),
      player2Name: process.env.PLAYER2_NAME,
      player2Permit: process.env.PLAYER2_PERMIT,
    };
  }
}

const IDENTITY_KEYS = [
  "CARD_NUMBER",
  "CARD_EXP_MONTH",
  "CARD_EXP_YEAR",
  "CARD_CVV",
  "FIRST_NAME",
  "LAST_NAME",
  "EMAIL",
  "PHONE",
  "BILLING_ADDRESS",
  "BILLING_APT",
  "BILLING_CITY",
  "BILLING_STATE",
  "BILLING_ZIP",
  "PARTY_PERMITS",
  "PERMIT_NUMBER",
  "PLAYER2_NAME",
  "PLAYER2_PERMIT",
] as const;

export interface IdentityUpdate {
  cardNumber?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  cardCvv?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  billingApt?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  partyPermits?: "none" | "1" | "2";
  permitNumber?: string;
  player2Name?: string;
  player2Permit?: string;
}

function identityToEnvMap(id: IdentityUpdate): Record<string, string | undefined> {
  return {
    CARD_NUMBER: id.cardNumber,
    CARD_EXP_MONTH: id.cardExpMonth,
    CARD_EXP_YEAR: id.cardExpYear,
    CARD_CVV: id.cardCvv,
    FIRST_NAME: id.firstName,
    LAST_NAME: id.lastName,
    EMAIL: id.email,
    PHONE: id.phone,
    BILLING_ADDRESS: id.billingAddress,
    BILLING_APT: id.billingApt,
    BILLING_CITY: id.billingCity,
    BILLING_STATE: id.billingState,
    BILLING_ZIP: id.billingZip,
    PARTY_PERMITS: id.partyPermits,
    PERMIT_NUMBER: id.permitNumber,
    PLAYER2_NAME: id.player2Name,
    PLAYER2_PERMIT: id.player2Permit,
  };
}

/** Merge identity updates into .env atomically. Omit masked fields to preserve secrets. */
export function saveIdentity(update: IdentityUpdate): void {
  const updates = identityToEnvMap(update);
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8").split("\n") : [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const key = m[1];
    if (!(IDENTITY_KEYS as readonly string[]).includes(key)) {
      out.push(line);
      continue;
    }
    seen.add(key);
    const val = updates[key as keyof typeof updates];
    if (val === undefined || val === "") {
      out.push(line);
    } else {
      out.push(`${key}=${val}`);
    }
  }

  for (const key of IDENTITY_KEYS) {
    if (seen.has(key)) continue;
    const val = updates[key];
    if (val !== undefined && val !== "") out.push(`${key}=${val}`);
  }

  const tmp = `${ENV_PATH}.tmp`;
  writeFileSync(tmp, out.filter((l, i, a) => !(i === a.length - 1 && l === "")).join("\n") + "\n");
  renameSync(tmp, ENV_PATH);
  dotenv.config({ path: ENV_PATH, quiet: true, override: true });
}
