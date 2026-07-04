import { launchContext } from "./browser.js";
import { loadTargets } from "./config.js";
import { fetchAvailabilityHtml } from "./navigate.js";
import { parseAvailability } from "./parser.js";
import { book } from "./booker.js";
import { log, notify } from "./notify.js";
import { matchSlots, watch } from "./watcher.js";
import { discover } from "./discover.js";
import type { Slot } from "./types.js";

const USAGE = `TennReserve — McCarren Park court auto-booker

Usage:
  npm run watch                     poll availability and auto-book matching targets
  npm run discover [-- <slotId>]    open a reserve page, dump form fields + hold timer, no payment
  npm run book -- <slotId>          book a specific slot now (real payment)
  npm run dry-run -- <slotId>       walk the flow up to Payflow, stop before paying
  npx tsx src/index.ts slots        list current open slots and which match your targets

Weekly tuning: edit config/targets.yaml (enabled flag + day/time ranges).`;

async function currentSlots(): Promise<Slot[]> {
  const ctx = await launchContext({ headless: true });
  const page = await ctx.newPage();
  try {
    const html = await fetchAvailabilityHtml(page);
    return parseAvailability(html);
  } finally {
    await ctx.close();
  }
}

async function resolveSlot(slotId: string): Promise<Slot | string> {
  try {
    const slots = await currentSlots();
    const slot = slots.find((s) => s.slotId === slotId);
    if (slot) return slot;
  } catch {
    // WAF or transient failure — booker resolves metadata via browser navigation
  }
  return slotId;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const args = rest.filter((a) => !a.startsWith("--"));
  const headless = flags.has("--headless");

  switch (cmd) {
    case "watch":
      await watch({ headless });
      break;

    case "discover":
      await discover(args[0]);
      break;

    case "book": {
      if (!args[0]) throw new Error("book requires a slot id: npm run book -- <slotId>");
      const slot = await resolveSlot(args[0]);
      const result = await book(slot, { dryRun: flags.has("--dry-run"), headless });
      if (!result.ok) process.exit(1);
      break;
    }

    case "slots": {
      const slots = await currentSlots();
      const cfg = loadTargets();
      const matches = new Set(matchSlots(slots, cfg).map((s) => s.slotId));
      log(`${slots.length} open slot(s) at McCarren (enabled: ${cfg.enabled}):`);
      for (const s of slots) {
        const mark = matches.has(s.slotId) ? "  << matches target" : "";
        console.log(`  ${s.date} ${s.day.padEnd(9)} ${s.time24} court ${s.court}  #${s.slotId}${mark}`);
      }
      break;
    }

    default:
      console.log(USAGE);
      if (cmd) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
