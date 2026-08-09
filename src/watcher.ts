import type { BrowserContext } from "playwright";
import { loadTargets } from "./config.js";
import { launchContext } from "./browser.js";
import { earliestScheduledExecution } from "./calendar.js";
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
import type { BookingAttempt, GridDay, Slot, TargetsConfig } from "./types.js";

const POLL_MS = 60_000;
const BURST_MS = 3_000;
const DISABLED_MS = 5 * 60_000;
const FAR_POLL_MS = 15 * 60_000;
/** When the earliest drop is farther than this, poll slowly and never open Chromium for availability. */
const FAR_FROM_DROP_MS = 12 * 60 * 60_000;
const BROWSER_COOLDOWN_MS = 10 * 60_000;
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

function earliestDropForAttempts(attempts: BookingAttempt[]): Date | null {
  const dates = attempts.flatMap((a) => a.slots.map((s) => s.date));
  return earliestScheduledExecution(dates);
}

function isFarFromDrop(attempts: BookingAttempt[], now = Date.now()): boolean {
  const drop = earliestDropForAttempts(attempts);
  if (!drop) return false;
  return drop.getTime() - now > FAR_FROM_DROP_MS;
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

/** Shared Playwright context for availability fetches (avoid launch/teardown every poll). */
let sharedAvailabilityCtx: BrowserContext | null = null;
let browserCooldownUntil = 0;

async function getSharedAvailabilityContext(headless: boolean): Promise<BrowserContext> {
  if (!sharedAvailabilityCtx) {
    sharedAvailabilityCtx = await launchContext({ headless });
    log("Opened shared Playwright context for availability");
  }
  return sharedAvailabilityCtx;
}

async function closeSharedAvailabilityContext(): Promise<void> {
  if (!sharedAvailabilityCtx) return;
  const ctx = sharedAvailabilityCtx;
  sharedAvailabilityCtx = null;
  await ctx.close().catch(() => {});
  log("Closed shared Playwright context");
}

async function fetchAvailabilityPlaywright(headless: boolean): Promise<string> {
  const ctx = await getSharedAvailabilityContext(headless);
  const page = await ctx.newPage();
  try {
    return await fetchAvailabilityHtml(page);
  } finally {
    await page.close().catch(() => {});
  }
}

interface AvailabilitySnapshot {
  html: string;
  slots: Slot[];
  gridDays: GridDay[];
  via: "http" | "browser";
}

async function fetchAvailabilitySnapshot(opts: {
  allowBrowser: boolean;
  headless: boolean;
}): Promise<AvailabilitySnapshot> {
  const started = Date.now();
  try {
    const html = await fetchAvailabilityHttp();
    const slots = filterBookable(parseAvailability(html));
    const gridDays = parseAvailabilityGrid(html);
    log(`Availability fetched via HTTP in ${Date.now() - started}ms (${slots.length} open)`);
    return { html, slots, gridDays, via: "http" };
  } catch (err: any) {
    const httpErr = err?.message ?? err;
    const now = Date.now();
    const coolingDown = now < browserCooldownUntil;

    if (!opts.allowBrowser || coolingDown) {
      const why = !opts.allowBrowser ? "browser disabled this cycle" : "browser cooldown active";
      log(`HTTP availability failed (${httpErr}) — ${why}, skipping Playwright`);
      throw new Error(`HTTP_ONLY_UNAVAILABLE: ${httpErr}`);
    }

    log(`HTTP availability failed (${httpErr}) — falling back to shared browser`);
    try {
      const html = await fetchAvailabilityPlaywright(opts.headless);
      if (!html.includes('class="tab-pane"')) {
        throw new Error("WAF_CHALLENGE");
      }
      const slots = filterBookable(parseAvailability(html));
      const gridDays = parseAvailabilityGrid(html);
      log(`Availability fetched via browser in ${Date.now() - started}ms (${slots.length} open)`);
      // Warm profile succeeded — still cool down so we don't thrash if HTTP stays blocked.
      browserCooldownUntil = Date.now() + BROWSER_COOLDOWN_MS;
      return { html, slots, gridDays, via: "browser" };
    } catch (browserErr: any) {
      browserCooldownUntil = Date.now() + BROWSER_COOLDOWN_MS;
      await closeSharedAvailabilityContext();
      throw browserErr;
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function watch(opts: { headless?: boolean } = {}): Promise<void> {
  const headless = opts.headless ?? false;
  log("Watcher started — polling McCarren availability/11");
  let wafBackoff = 0;

  while (true) {
    let interval = POLL_MS;
    try {
      const cfg = loadTargets();
      const scheduled = listScheduledAttempts();
      const hasWork = cfg.enabled && (scheduled.length > 0 || cfg.targets.length > 0);
      const farFromDrop = isFarFromDrop(scheduled);
      const burst = inBurstWindow(scheduled.length > 0);

      if (!hasWork) {
        interval = DISABLED_MS;
        await closeSharedAvailabilityContext();
        log(
          scheduled.length === 0 && cfg.targets.length === 0
            ? "No scheduled attempts or yaml targets — standing by"
            : "Booking disabled (enabled: false) — standing by"
        );
      } else if (farFromDrop) {
        interval = FAR_POLL_MS;
        const drop = earliestDropForAttempts(scheduled);
        log(
          `Far from drop (${drop?.toLocaleString() ?? "?"}) — HTTP-only poll every ${FAR_POLL_MS / 60_000}m`
        );
        try {
          const snap = await fetchAvailabilitySnapshot({ allowBrowser: false, headless });
          wafBackoff = 0;
          log(`${snap.slots.length} open bookable slot(s), ${scheduled.length} scheduled attempt(s)`);
          // Still evaluate miss if somehow published early; skip multi-pass browser thrash.
          for (const attempt of scheduled) {
            const miss = evaluateAttemptMiss(attempt, snap.gridDays);
            if (miss) {
              missAttempt(attempt.id, miss.reason);
              log(`Attempt ${attempt.id} auto-closed: ${miss.reason}`);
              notify("TennReserve: scheduled attempt missed", miss.reason);
            }
          }
        } catch (err: any) {
          if (String(err?.message ?? err).startsWith("HTTP_ONLY_UNAVAILABLE")) {
            log(`Far-from-drop HTTP poll failed — will retry in ${FAR_POLL_MS / 60_000}m`);
          } else {
            throw err;
          }
        }
      } else {
        // Near drop: allow browser in midnight burst, or when cooldown has elapsed.
        const allowBrowser = burst || Date.now() >= browserCooldownUntil;
        const snap = await fetchAvailabilitySnapshot({ allowBrowser, headless });
        wafBackoff = 0;
        log(`${snap.slots.length} open bookable slot(s), ${scheduled.length} scheduled attempt(s)`);

        const fetchOpenSlots = async () => {
          const fresh = await fetchAvailabilitySnapshot({
            allowBrowser: burst || Date.now() >= browserCooldownUntil,
            headless,
          });
          snap.slots = fresh.slots;
          snap.gridDays = fresh.gridDays;
          return fresh.slots;
        };

        let booked = false;

        // Priority 1: scheduled booking attempts (explicit slot picks, 3-pass retry)
        if (cfg.enabled) {
          for (const attempt of scheduled) {
            const outcome = await runScheduledAttempt(attempt, fetchOpenSlots, {
              headless,
              initialOpenSlots: snap.slots,
              initialGridDays: snap.gridDays,
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
            const result = await book(slot, { headless });
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

        if (burst) interval = BURST_MS;
      }
    } catch (err: any) {
      if (err?.message === "WAF_CHALLENGE") {
        wafBackoff = Math.min(wafBackoff === 0 ? 60_000 : wafBackoff * 2, WAF_BACKOFF_MAX_MS);
        browserCooldownUntil = Date.now() + Math.max(BROWSER_COOLDOWN_MS, wafBackoff);
        interval = wafBackoff;
        await closeSharedAvailabilityContext();
        log(`AWS WAF challenge detected — backing off ${Math.round(interval / 1000)}s`);
      } else if (String(err?.message ?? err).startsWith("HTTP_ONLY_UNAVAILABLE")) {
        interval = POLL_MS;
        log(`Availability unavailable without browser — retry in ${interval / 1000}s`);
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
