import { launchContext } from "./browser.js";
import { loadTargets } from "./config.js";
import { DEFAULT_FACILITY_ID, getFacility, resolveFacilityId } from "./facilities.js";
import { fetchAvailabilityHtml } from "./navigate.js";
import { parseAvailability } from "./parser.js";
import { book } from "./booker.js";
import { log } from "./notify.js";
import { matchSlots, watch } from "./watcher.js";
import { discover } from "./discover.js";
import type { Slot } from "./types.js";

const USAGE = `TennReserve — NYC Parks tennis court auto-booker (McCarren Park, Mill Pond)

Usage:
  npm run watch                     poll availability and auto-book matching targets
  npm run discover [-- <slotId>]    open a reserve page, dump form fields + hold timer, no payment
  npm run book -- <slotId>          book a specific slot now (real payment)
  npm run dry-run -- <slotId>       walk the flow up to Payflow, stop before paying
  npx tsx src/index.ts slots        list current open slots and which match your targets

  --facility=<id>                   11 = McCarren Park (default), 4 = Mill Pond
  --headless                        run the booker browser headless (TENNRESERVE_BROWSER, default firefox)

Weekly yaml targets still apply to McCarren. Dashboard booking attempts store facilityId.`;

function parseCli(rest: string[]): { flags: Set<string>; args: string[]; facilityId: number } {
  const flags = new Set<string>();
  const args: string[] = [];
  let facilityId = DEFAULT_FACILITY_ID;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--facility" || a === "--facility-id") {
      facilityId = resolveFacilityId(parseInt(rest[++i] ?? "", 10));
    } else if (a.startsWith("--facility=")) {
      facilityId = resolveFacilityId(parseInt(a.slice("--facility=".length), 10));
    } else if (a.startsWith("--")) {
      flags.add(a);
    } else {
      args.push(a);
    }
  }
  return { flags, args, facilityId };
}

async function currentSlots(facilityId: number): Promise<Slot[]> {
  const ctx = await launchContext({ headless: true });
  const page = await ctx.newPage();
  try {
    const html = await fetchAvailabilityHtml(page, facilityId);
    return parseAvailability(html, facilityId);
  } finally {
    await ctx.close();
  }
}

async function resolveSlot(slotId: string, facilityId: number): Promise<Slot | string> {
  try {
    const slots = await currentSlots(facilityId);
    const slot = slots.find((s) => s.slotId === slotId);
    if (slot) return slot;
  } catch {
    // WAF or transient failure — booker resolves metadata via browser navigation
  }
  return slotId;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, args, facilityId } = parseCli(rest);
  const headless = flags.has("--headless");

  switch (cmd) {
    case "watch":
      await watch({ headless });
      break;

    case "discover":
      await discover(args[0], facilityId);
      break;

    case "book": {
      if (!args[0]) throw new Error("book requires a slot id: npm run book -- <slotId>");
      const slot = await resolveSlot(args[0], facilityId);
      const result = await book(slot, { dryRun: flags.has("--dry-run"), headless, facilityId });
      if (!result.ok) process.exit(1);
      break;
    }

    case "slots": {
      const slots = await currentSlots(facilityId);
      const cfg = loadTargets();
      const matches = new Set(matchSlots(slots, cfg).map((s) => s.slotId));
      const name = getFacility(facilityId).name;
      log(`${slots.length} open slot(s) at ${name} (facility ${facilityId}, enabled: ${cfg.enabled}):`);
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
