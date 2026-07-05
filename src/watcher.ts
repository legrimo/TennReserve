import { loadTargets } from "./config.js";
import { launchContext } from "./browser.js";
import { fetchAvailabilityHtml } from "./navigate.js";
import { parseAvailability } from "./parser.js";
import { hasBookingOn } from "./ledger.js";
import { book } from "./booker.js";
import { log, notify } from "./notify.js";
import { listScheduledAttempts, matchAttemptSlot, completeAttempt } from "./attempts.js";
import type { Slot, TargetsConfig } from "./types.js";

const POLL_MS = 60_000;
const BURST_MS = 10_000;
const DISABLED_MS = 5 * 60_000;
const WAF_BACKOFF_MAX_MS = 15 * 60_000;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inMidnightBurst(): boolean {
  const d = new Date();
  return d.getHours() === 0 && d.getMinutes() < 10;
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

async function fetchAvailability(): Promise<string> {
  const ctx = await launchContext({ headless: true });
  const page = await ctx.newPage();
  try {
    return await fetchAvailabilityHtml(page);
  } finally {
    await ctx.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function watch(opts: { headless?: boolean } = {}): Promise<void> {
  log("Watcher started — polling McCarren availability/11 via browser");
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
        const html = await fetchAvailability();
        wafBackoff = 0;
        const slots = filterBookable(parseAvailability(html));
        log(`${slots.length} open bookable slot(s), ${scheduled.length} scheduled attempt(s)`);

        let booked = false;

        // Priority 1: scheduled booking attempts (explicit slot picks)
        if (cfg.enabled) {
          for (const attempt of scheduled) {
            const slot = matchAttemptSlot(slots, attempt);
            if (!slot) continue;
            log(
              `ATTEMPT ${attempt.id}: MATCH ${slot.date} ${slot.day} ${slot.time24} court ${slot.court} — booking`
            );
            const result = await book(slot, { headless: opts.headless });
            if (result.ok && result.confirmation) {
              completeAttempt(attempt.id, {
                date: slot.date,
                day: slot.day,
                time24: slot.time24,
                court: slot.court,
                slotId: slot.slotId,
                confirmation: result.confirmation,
              });
              log(`Attempt ${attempt.id} completed — confirmation ${result.confirmation}`);
              booked = true;
              break;
            }
            log(`Attempt ${attempt.id} booking failed: ${result.error}`);
            await sleep(POLL_MS);
          }
        }

        // Priority 2: legacy yaml targets (first match)
        if (!booked && cfg.enabled && cfg.targets.length > 0) {
          const matches = matchSlots(slots, cfg);
          log(`${matches.length} yaml target match(es)`);
          if (matches.length > 0) {
            const slot = matches[0];
            log(`YAML MATCH: ${slot.date} ${slot.day} ${slot.time24} court ${slot.court} — booking`);
            const result = await book(slot, { headless: opts.headless });
            if (result.ok) {
              log(`Booked ${slot.date} ${slot.time24} — confirmation ${result.confirmation}`);
            } else {
              log(`Booking failed: ${result.error} — will retry on next matching slot`);
              await sleep(POLL_MS);
            }
          }
        }

        if (inMidnightBurst()) interval = BURST_MS;
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
