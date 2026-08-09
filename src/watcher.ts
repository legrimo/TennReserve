import { loadTargets } from "./config.js";
import { launchContext } from "./browser.js";
import { fetchAvailabilityHttp } from "./fetchAvailability.js";
import { fetchAvailabilityHtml } from "./navigate.js";
import { parseAvailability, parseAvailabilityGrid } from "./parser.js";
import { hasBookingOn } from "./bookings.js";
import { book } from "./booker.js";
import { onBookingSuccess } from "./bookingFlow.js";
import { evaluateAttemptMiss } from "./attemptMiss.js";
import { log, notify } from "./notify.js";
import { listScheduledAttempts, missAttempt } from "./attempts.js";
import { runScheduledAttempt } from "./scheduledAttemptRunner.js";
import type { GridDay, Slot, TargetsConfig } from "./types.js";

const POLL_MS = 60_000;
const BURST_MS = 3_000;
const DISABLED_MS = 5 * 60_000;
const WAF_BACKOFF_MAX_MS = 15 * 60_000;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inBurstWindow(hasScheduledAttempts: boolean): boolean {
  const d = new Date();
  if (d.getHours() !== 0) return false;
  return d.getMinutes() < (hasScheduledAttempts ? 30 : 10);
}

/** Legacy yaml range matching — kept for CLI / backward compat. */
export function matchSlots(slots: Slot[], cfg: TargetsConfig): Slot[] {
  const today = todayIso();
  const courtRank = new Map(cfg.courts.map((c, i) => [c, i]));

  const candidates: { slot: Slot; targetIdx: number }[] = [];
  for (const slot of slots) {
    if (slot.date <= today) continue;
    if (!courtRank.has(slot.court)) continue;
    if (hasBookingOn(slot.date)) continue;
    const idx = cfg.targets.findIndex(
      (t) => t.day === slot.day && slot.time24 >= t.between[0] && slot.time24 < t.between[1]
    );
    if (idx === -1) continue;
    candidates.push({ slot, targetIdx: idx });
  }

  candidates.sort((a, b) => {
    if (a.targetIdx !== b.targetIdx) return a.targetIdx - b.targetIdx;
    if (a.slot.date !== b.slot.date) return a.slot.date < b.slot.date ? -1 : 1;
    if (a.slot.time24 !== b.slot.time24) return a.slot.time24 < b.slot.time24 ? -1 : 1;
    return (courtRank.get(a.slot.court) ?? 99) - (courtRank.get(b.slot.court) ?? 99);
  });

  return candidates.map((c) => c.slot);
}

function filterBookable(slots: Slot[]): Slot[] {
  const today = todayIso();
  return slots.filter((s) => s.date > today && !hasBookingOn(s.date));
}

async function fetchAvailabilityPlaywright(): Promise<string> {
  const ctx = await launchContext({ headless: true });
  const page = await ctx.newPage();
  try {
    return await fetchAvailabilityHtml(page);
  } finally {
    await ctx.close();
  }
}

interface AvailabilitySnapshot {
  html: string;
  slots: Slot[];
  gridDays: GridDay[];
  via: "http" | "browser";
}

async function fetchAvailabilitySnapshot(): Promise<AvailabilitySnapshot> {
  const started = Date.now();
  try {
    const html = await fetchAvailabilityHttp();
    const slots = filterBookable(parseAvailability(html));
    const gridDays = parseAvailabilityGrid(html);
    log(`Availability fetched via HTTP in ${Date.now() - started}ms (${slots.length} open)`);
    return { html, slots, gridDays, via: "http" };
  } catch (err: any) {
    log(`HTTP availability failed (${err?.message ?? err}) — falling back to browser`);
    const html = await fetchAvailabilityPlaywright();
    const slots = filterBookable(parseAvailability(html));
    const gridDays = parseAvailabilityGrid(html);
    log(`Availability fetched via browser in ${Date.now() - started}ms (${slots.length} open)`);
    return { html, slots, gridDays, via: "browser" };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function watch(opts: { headless?: boolean } = {}): Promise<void> {
  log("Watcher started — polling McCarren availability/11");
  let wafBackoff = 0;

  while (true) {
    let interval = POLL_MS;
    try {
      const cfg = loadTargets();
      const scheduled = listScheduledAttempts();
      const hasWork = cfg.enabled && (scheduled.length > 0 || cfg.targets.length > 0);

      if (!hasWork) {
        interval = DISABLED_MS;
        log(
          scheduled.length === 0 && cfg.targets.length === 0
            ? "No scheduled attempts or yaml targets — standing by"
            : "Booking disabled (enabled: false) — standing by"
        );
      } else {
        const snap = await fetchAvailabilitySnapshot();
        wafBackoff = 0;
        log(`${snap.slots.length} open bookable slot(s), ${scheduled.length} scheduled attempt(s)`);

        const fetchOpenSlots = async () => {
          const fresh = await fetchAvailabilitySnapshot();
          snap.slots = fresh.slots;
          snap.gridDays = fresh.gridDays;
          return fresh.slots;
        };

        let booked = false;

        // Priority 1: scheduled booking attempts (explicit slot picks, 3-pass retry)
        if (cfg.enabled) {
          for (const attempt of scheduled) {
            const outcome = await runScheduledAttempt(attempt, fetchOpenSlots, {
              headless: opts.headless,
              initialOpenSlots: snap.slots,
            });
            if (outcome === "booked") {
              booked = true;
              break;
            }
            if (outcome === "no_slots_yet") {
              const miss = evaluateAttemptMiss(attempt, snap.gridDays);
              if (miss) {
                missAttempt(attempt.id, miss.reason);
                log(`Attempt ${attempt.id} auto-closed: ${miss.reason}`);
                notify("TennReserve: scheduled attempt missed", miss.reason);
              }
            }
          }
        }

        // Priority 2: legacy yaml targets (first match)
        if (!booked && cfg.enabled && cfg.targets.length > 0) {
          const matches = matchSlots(snap.slots, cfg);
          log(`${matches.length} yaml target match(es)`);
          if (matches.length > 0) {
            const slot = matches[0];
            log(`YAML MATCH: ${slot.date} ${slot.day} ${slot.time24} court ${slot.court} — booking`);
            const result = await book(slot, { headless: opts.headless });
            if (result.ok && result.checkout) {
              const booking = onBookingSuccess(undefined, result.checkout);
              log(`Booked ${slot.date} ${slot.time24} — ${booking.reservationNumber}`);
            } else if (result.ok) {
              log(`Booked ${slot.date} ${slot.time24} — confirmation ${result.confirmation}`);
            } else {
              log(`Booking failed: ${result.error} — will retry on next matching slot`);
              await sleep(POLL_MS);
            }
          }
        }

        if (inBurstWindow(scheduled.length > 0)) interval = BURST_MS;
      }
    } catch (err: any) {
      if (err?.message === "WAF_CHALLENGE") {
        wafBackoff = Math.min(wafBackoff === 0 ? 60_000 : wafBackoff * 2, WAF_BACKOFF_MAX_MS);
        interval = wafBackoff;
        log(`AWS WAF challenge detected — backing off ${Math.round(interval / 1000)}s`);
      } else {
        log(`Watcher error: ${err?.message ?? err}`);
        notifyOnce(err?.message ?? String(err));
      }
    }
    await sleep(interval);
  }
}

let lastNotified = "";
function notifyOnce(message: string): void {
  if (message === lastNotified) return;
  lastNotified = message;
  notify("TennReserve: watcher error", message);
}
