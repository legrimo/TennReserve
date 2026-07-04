import { loadTargets } from "./config.js";
import { launchContext } from "./browser.js";
import { fetchAvailabilityHtml } from "./navigate.js";
import { parseAvailability } from "./parser.js";
import { hasBookingOn } from "./ledger.js";
import { book } from "./booker.js";
import { log, notify } from "./notify.js";
import type { Slot, TargetsConfig } from "./types.js";

const POLL_MS = 60_000; // normal cadence
const BURST_MS = 10_000; // right after midnight ET, when the new 7th day is released
const DISABLED_MS = 5 * 60_000; // check config less often while disabled
const WAF_BACKOFF_MAX_MS = 15 * 60_000;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Burst window: 00:00–00:10 local (machine assumed to be in America/New_York, same as the site). */
function inMidnightBurst(): boolean {
  const d = new Date();
  return d.getHours() === 0 && d.getMinutes() < 10;
}

/**
 * Pick the best slot per the config: earlier target in the list wins,
 * then earlier start time, then court preference order.
 * Same-day slots and days already booked (ledger) are excluded.
 */
export function matchSlots(slots: Slot[], cfg: TargetsConfig): Slot[] {
  const today = todayIso();
  const courtRank = new Map(cfg.courts.map((c, i) => [c, i]));

  const candidates: { slot: Slot; targetIdx: number }[] = [];
  for (const slot of slots) {
    if (slot.date <= today) continue; // no same-day booking (site rule)
    if (!courtRank.has(slot.court)) continue;
    if (hasBookingOn(slot.date)) continue; // one reservation per day
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
      const cfg = loadTargets(); // re-read every cycle: weekly edits apply live

      if (!cfg.enabled) {
        interval = DISABLED_MS;
        log("Booking disabled in config/targets.yaml (enabled: false) — standing by");
      } else if (cfg.targets.length === 0) {
        interval = DISABLED_MS;
        log("No targets configured — standing by");
      } else {
        const html = await fetchAvailability();
        wafBackoff = 0;
        const slots = parseAvailability(html);
        const matches = matchSlots(slots, cfg);
        log(`${slots.length} open slot(s), ${matches.length} matching target(s)`);

        if (matches.length > 0) {
          const slot = matches[0];
          log(`MATCH: ${slot.date} ${slot.day} ${slot.time24} court ${slot.court} — booking now`);
          const result = await book(slot, { headless: opts.headless });
          if (result.ok) {
            log(`Booked ${slot.date} ${slot.time24} — confirmation ${result.confirmation}`);
          } else {
            log(`Booking failed: ${result.error} — will retry on next matching slot`);
            await sleep(POLL_MS); // brief cooldown so a broken flow doesn't hammer the site
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
